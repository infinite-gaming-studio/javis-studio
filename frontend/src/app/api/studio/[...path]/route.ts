import { NextResponse } from "next/server";
import nodeFs from "fs/promises";
import nodePath from "path";
import { execFile } from "child_process";
import { v4 as uuidv4 } from "uuid";

/**
 * Studio API Proxy
 * Routes /api/studio/* requests to the configured LLM or TTS backends.
 * Settings are passed via request headers (x-llm-url, x-llm-token, etc.)
 * from lib/api.ts which reads them from localStorage.
 */

function normalizeLLMBaseUrl(rawUrl: string): string {
    // Strip trailing slash
    let url = rawUrl.trim().replace(/\/+$/, "");
    // Strip /chat/completions or /completions if user already included it
    url = url.replace(/\/chat\/completions$/, "").replace(/\/completions$/, "");
    return url;
}

function normalizeTTSBaseUrl(rawUrl: string): string {
    return rawUrl.trim().replace(/\/+$/, "");
}

function findFfmpeg(): string {
    const envPath = process.env.FFMPEG_BIN?.trim();
    if (envPath) {
        try {
            execFile(envPath, ["-version"], { timeout: 5000 });
            return envPath;
        } catch { /* fall through */ }
    }
    const candidates = [
        "/opt/homebrew/bin/ffmpeg",   // Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",      // Intel Homebrew / Linux brew
        "/usr/bin/ffmpeg",            // Linux (Debian/Alpine)
    ];
    for (const c of candidates) {
        try {
            execFile(c, ["-version"], { timeout: 5000 });
            return c;
        } catch { continue; }
    }
    return "ffmpeg";
}

const FFMPEG_BIN = findFfmpeg();

async function convertToStereo(inputPath: string, outputPath: string): Promise<void> {
    const filterComplex =
        "[0:a]asplit=2[L][R];" +
        "[L]highpass=f=80[Lproc];" +
        "[R]adelay=25,lowpass=f=3500,highpass=f=80,volume=0.92[Rproc];" +
        "[Lproc][Rproc]join=inputs=2:channel_layout=stereo[out]";

    return new Promise((resolve, reject) => {
        execFile(FFMPEG_BIN, [
            "-i", inputPath,
            "-filter_complex", filterComplex,
            "-map", "[out]",
            "-ar", "44100",
            "-sample_fmt", "s16",
            "-ac", "2",
            "-y",
            outputPath,
        ], { timeout: 30000 }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getUserFriendlyError(status: number, detail: string): string {
    if (status === 401 || status === 403) return "API Token 无效或未授权，请检查设置中的令牌";
    if (status === 404) return "API 地址不正确，请检查设置中的 API URL 是否正确（无需包含 /chat/completions）";
    if (status === 429) return "请求过于频繁，请稍后再试";
    if (status === 400) return `请求参数错误: ${detail.slice(0, 200)}`;
    if (status >= 500) return `服务端错误 (${status})，请稍后再试`;
    return `请求失败 (${status}): ${detail.slice(0, 200)}`;
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;
        const subPath = path.join("/");
        const body = await req.json();

        const llmUrlRaw = req.headers.get("x-llm-url") || "";
        const llmToken = req.headers.get("x-llm-token") || "";
        const llmModel = req.headers.get("x-llm-model") || "gpt-3.5-turbo";
        const ttsUrlRaw = req.headers.get("x-tts-url") || "";
        const ttsToken = req.headers.get("x-tts-token") || "";

        // ── route: script (LLM only) ───────────────────────────────────────────
        if (subPath === "script") {
            if (!llmUrlRaw) {
                return NextResponse.json(
                    { error: "请先在⚙️全局设置中配置 LLM API URL" },
                    { status: 400 }
                );
            }

            const baseUrl = normalizeLLMBaseUrl(llmUrlRaw);
            const targetUrl = `${baseUrl}/chat/completions`;

            const { images, prompt } = body;

            // Build user content — only attach images if they are URLs (not data URIs)
            // to avoid overloading the request and issues with non-vision models.
            const textContent = `${prompt || "请生成一段旁白脚本"}`;
            const imageUrls: string[] = (images || []).filter(
                (img: string) => img.startsWith("http")
            );

            const userContent: any[] =
                imageUrls.length > 0
                    ? [
                        { type: "text", text: textContent },
                        ...imageUrls.map((url) => ({
                            type: "image_url",
                            image_url: { url },
                        })),
                    ]
                    : [{ type: "text", text: textContent }];

            const systemPrompt =
                "你是一个专业的短视频旁白脚本生成 AI。" +
                "请根据用户提供的主题/提示词，生成一段自然流畅、生动有趣的旁白脚本。" +
                "将脚本分成3-6个短段，每段约20-50个汉字。" +
                "必须以 JSON 格式返回，格式为：{\"script\": [{\"index\": 0, \"text\": \"...\"}]}";

            const llmPayload = {
                model: llmModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent },
                ],
                response_format: { type: "json_object" },
                temperature: 0.8,
            };

            console.log(`[Studio] Calling LLM: ${targetUrl} model=${llmModel}`);

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (llmToken) headers["Authorization"] = `Bearer ${llmToken}`;

            let llmRes: Response;
            try {
                llmRes = await fetch(targetUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(llmPayload),
                });
            } catch (fetchErr: any) {
                console.error(`[Studio] LLM fetch failed:`, fetchErr);
                const errMsg = fetchErr?.message || fetchErr?.cause?.message || String(fetchErr);
                return NextResponse.json(
                    { error: `连接 LLM 服务失败: ${errMsg}。请检查 API URL 是否正确 (${targetUrl})` },
                    { status: 502 }
                );
            }

            if (!llmRes.ok) {
                const errText = await llmRes.text().catch(() => "");
                console.error(`[Studio] LLM error ${llmRes.status}: ${errText}`);
                return NextResponse.json(
                    { error: getUserFriendlyError(llmRes.status, errText) },
                    { status: llmRes.status }
                );
            }

            const llmData = await llmRes.json();

            // Parse LLM response and normalize into { script: ScriptSegment[] }
            try {
                const rawContent = llmData?.choices?.[0]?.message?.content;
                if (!rawContent) throw new Error("LLM 未返回内容");

                const parsed = JSON.parse(rawContent);

                // Support both { script: [...] } and { segments: [...] } from LLM
                const segments = parsed.script || parsed.segments || parsed.paragraphs;
                if (!Array.isArray(segments)) {
                    // If LLM returned flat text, wrap it
                    return NextResponse.json({
                        script: [{ index: 0, text: rawContent }],
                    });
                }

                // Normalize: ensure each segment has index + text
                const normalized = segments.map((s: any, i: number) => ({
                    index: s.index ?? i,
                    text: s.text || s.content || s.paragraph || String(s),
                    emotion_hint: s.emotion_hint || s.emotion,
                }));

                return NextResponse.json({ script: normalized });
            } catch (parseErr) {
                console.error("[Studio] Failed to parse LLM response:", parseErr);
                return NextResponse.json(
                    { error: "AI 返回格式无法解析，请重试" },
                    { status: 500 }
                );
            }
        }

  // ── route: tts (TTS only) ──────────────────────────────────────────────
  // Forward JSON to the Python backend which handles IndexTTS2 internally,
  // then download the generated audio, apply ffmpeg stereo enhancement,
  // and serve it from the frontend's public/audio/ directory.
  if (subPath === "tts") {
    const backendUrl = process.env.BACKEND_API_URL || "http://backend:8000";
    const targetUrl = `${backendUrl}/api/studio/tts`;

    const { text, voice_settings } = body as {
      text: string;
      voice_settings?: Record<string, unknown>;
    };

    if (!text) {
      return NextResponse.json(
        { error: "缺少 text 参数" },
        { status: 400 }
      );
    }

    const ttsHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ttsToken) ttsHeaders["Authorization"] = `Bearer ${ttsToken}`;
    if (ttsUrlRaw) ttsHeaders["x-tts-url"] = ttsUrlRaw;

    console.log(`[Studio Proxy] Forwarding TTS to backend: ${targetUrl} | text="${text.slice(0, 30)}..."`);

    let ttsRes: Response;
    try {
      ttsRes = await fetch(targetUrl, {
        method: "POST",
        headers: ttsHeaders,
        body: JSON.stringify({ text, voice_settings: voice_settings ?? {} }),
      });
    } catch (fetchErr: any) {
      console.error(`[Studio] TTS backend fetch failed:`, fetchErr);
      const errMsg = fetchErr?.message || fetchErr?.cause?.message || String(fetchErr);
      return NextResponse.json(
        { error: `连接 TTS 后端服务失败: ${errMsg}。请确保后端服务正在运行 (${targetUrl})` },
        { status: 502 }
      );
    }

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => "");
      console.error(`[Studio] TTS backend error ${ttsRes.status}: ${errText}`);
      return NextResponse.json(
        { error: getUserFriendlyError(ttsRes.status, errText) },
        { status: ttsRes.status }
      );
    }

    // Backend returns JSON: { audio_url: "/api/studio/audio/single/{uuid}.wav", duration_secs }
    const ttsData = await ttsRes.json();
    const backendAudioUrl = ttsData.audio_url as string;
    const durationSecs = ttsData.duration_secs as number | undefined;

    if (!backendAudioUrl) {
      return NextResponse.json(
        { error: "后端未返回音频 URL" },
        { status: 502 }
      );
    }

    // Download the audio file from the backend
    const audioFetchUrl = `${backendUrl}${backendAudioUrl}`;
    console.log(`[Studio Proxy] Downloading audio from backend: ${audioFetchUrl}`);

    let audioRes: Response;
    try {
      audioRes = await fetch(audioFetchUrl);
    } catch (fetchErr: any) {
      console.error(`[Studio] Audio download from backend failed:`, fetchErr);
      return NextResponse.json(
        { error: `从后端下载音频失败: ${fetchErr?.message || String(fetchErr)}` },
        { status: 502 }
      );
    }

    if (!audioRes.ok) {
      console.error(`[Studio] Audio download error ${audioRes.status}`);
      return NextResponse.json(
        { error: `从后端下载音频失败 (HTTP ${audioRes.status})` },
        { status: 502 }
      );
    }

    // Save to public/audio/ with ffmpeg stereo conversion
    const fileName = `tts_${uuidv4()}.wav`;
    const publicAudioDir = nodePath.join(process.cwd(), "public", "audio");
    await nodeFs.mkdir(publicAudioDir, { recursive: true });

    const tempFileName = `tts_raw_${uuidv4()}.wav`;
    const tempFilePath = nodePath.join(publicAudioDir, tempFileName);
    const finalFilePath = nodePath.join(publicAudioDir, fileName);
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    await nodeFs.writeFile(tempFilePath, buffer);

    try {
      await convertToStereo(tempFilePath, finalFilePath);
    } catch (ffmpegErr: any) {
      console.error("[Studio] ffmpeg stereo conversion failed, saving mono fallback:", ffmpegErr?.message);
      await nodeFs.rename(tempFilePath, finalFilePath).catch(async () => {
        await nodeFs.copyFile(tempFilePath, finalFilePath);
      });
      await nodeFs.unlink(tempFilePath).catch(() => {});
      return NextResponse.json({ audio_url: `/audio/${fileName}`, duration_secs: durationSecs });
    }

    await nodeFs.unlink(tempFilePath).catch(() => {});
    return NextResponse.json({ audio_url: `/audio/${fileName}`, duration_secs: durationSecs });
  }

  // ── route: generate (LLM + TTS) ───────────────────────────────────────
  if (subPath === "generate") {
    const backendUrl = process.env.BACKEND_API_URL || "http://backend:8000";
    const targetUrl = `${backendUrl}/api/studio/generate`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ttsToken) headers["Authorization"] = `Bearer ${ttsToken}`;

    let genRes: Response;
    try {
      genRes = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (fetchErr: any) {
      console.error(`[Studio] Generate fetch failed:`, fetchErr);
      const errMsg = fetchErr?.message || fetchErr?.cause?.message || String(fetchErr);
      return NextResponse.json(
        { error: `连接生成服务失败: ${errMsg}。请检查后端服务是否运行 (${targetUrl})` },
        { status: 502 }
      );
    }

    if (!genRes.ok) {
      const errText = await genRes.text().catch(() => "");
      return NextResponse.json(
        { error: getUserFriendlyError(genRes.status, errText) },
        { status: genRes.status }
      );
    }

    return NextResponse.json(await genRes.json());
  }

  return NextResponse.json(
  { error: `未知的 Studio 路由: ${subPath}` },
  { status: 404 }
  );
 } catch (error: any) {
  console.error("[Studio Proxy] Internal Error:", error);
  return NextResponse.json(
  { error: error.message || "服务内部错误，请稍后重试" },
  { status: 500 }
  );
 }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const subPath = path.join("/");

    // ── route: audio/* ── proxy audio files from backend ──
    if (subPath.startsWith("audio/")) {
      const backendUrl = process.env.BACKEND_API_URL || "http://backend:8000";
      const targetUrl = `${backendUrl}/api/studio/${subPath}`;

      let audioRes: Response;
      try {
        audioRes = await fetch(targetUrl);
      } catch (fetchErr: any) {
        return NextResponse.json(
          { error: `无法从后端获取音频: ${fetchErr?.message || String(fetchErr)}` },
          { status: 502 }
        );
      }

      if (!audioRes.ok) {
        return NextResponse.json(
          { error: `音频文件获取失败 (HTTP ${audioRes.status})` },
          { status: audioRes.status }
        );
      }

      const contentType = audioRes.headers.get("content-type") || "audio/wav";
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      return new Response(audioBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(audioBuffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return NextResponse.json(
      { error: `未知的 Studio GET 路由: ${subPath}` },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[Studio Proxy GET] Internal Error:", error);
    return NextResponse.json(
      { error: error.message || "服务内部错误" },
      { status: 500 }
    );
  }
}
