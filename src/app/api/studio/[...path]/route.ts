import { NextResponse } from "next/server";
import nodeFs from "fs/promises";
import nodePath from "path";
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

            const llmRes = await fetch(targetUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(llmPayload),
            });

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
        if (subPath === "tts") {
            if (!ttsUrlRaw) {
                return NextResponse.json(
                    { error: "请先在⚙️全局设置中配置 TTS API URL" },
                    { status: 400 }
                );
            }

            const baseUrl = normalizeTTSBaseUrl(ttsUrlRaw);
            const targetUrl = `${baseUrl}/api/tts`;

            // IndexTTS2 expects multipart/form-data, not JSON.
            // Extract fields from the incoming JSON body.
            const { text, voice_settings } = body as {
                text: string;
                voice_settings?: {
                    spk_audio_prompt?: string;  // base64 data URI
                    emo_audio_prompt?: string;  // base64 data URI
                    emotion_mode?: string;
                    emo_alpha?: number;
                    emo_vector?: number[];
                    emo_text?: string;
                    use_random?: boolean;
                };
            };

            if (!text) {
                return NextResponse.json(
                    { error: "缺少 text 参数" },
                    { status: 400 }
                );
            }

            const vs = voice_settings ?? {};

            // Helper: convert base64 data URI to a Blob
            function base64ToBlob(dataUri: string): { blob: Blob; mimeType: string } {
                const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
                const mimeType = match ? match[1] : "audio/wav";
                const b64 = match ? match[2] : dataUri;
                const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
                return { blob: new Blob([bytes], { type: mimeType }), mimeType };
            }

            const formData = new FormData();
            formData.append("text", text);

            // spk_audio is required by IndexTTS2
            if (vs.spk_audio_prompt) {
                const { blob } = base64ToBlob(vs.spk_audio_prompt);
                formData.append("spk_audio", blob, "spk_audio.wav");
            }

            // Optional emotion audio
            if (vs.emotion_mode === "audio" && vs.emo_audio_prompt) {
                const { blob } = base64ToBlob(vs.emo_audio_prompt);
                formData.append("emo_audio", blob, "emo_audio.wav");
            }

            // Optional scalar/text emotion fields
            if (vs.emotion_mode !== undefined) formData.append("emotion_mode", vs.emotion_mode);
            if (vs.emo_alpha !== undefined) formData.append("emo_alpha", String(vs.emo_alpha));
            if (vs.emo_text !== undefined) formData.append("emo_text", vs.emo_text);
            if (vs.use_random !== undefined) formData.append("use_random", String(vs.use_random));
            if (vs.emo_vector !== undefined) formData.append("emo_vector", JSON.stringify(vs.emo_vector));

            const ttsHeaders: Record<string, string> = {};
            if (ttsToken) ttsHeaders["Authorization"] = `Bearer ${ttsToken}`;

            const ttsRes = await fetch(targetUrl, {
                method: "POST",
                headers: ttsHeaders,  // let fetch set Content-Type + boundary for FormData
                body: formData,
            });

            if (!ttsRes.ok) {
                const errText = await ttsRes.text().catch(() => "");
                return NextResponse.json(
                    { error: getUserFriendlyError(ttsRes.status, errText) },
                    { status: ttsRes.status }
                );
            }

            // IndexTTS2 returns raw audio binary (WAV/MP3), not JSON.
            // Save to public/audio/ and return a URL the frontend can play.
            const contentType = ttsRes.headers.get("content-type") || "";
            const isAudio = contentType.includes("audio") || contentType.includes("octet-stream");

            if (isAudio || !contentType.includes("json")) {
                const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? ".mp3" : ".wav";
                const fileName = `tts_${uuidv4()}${ext}`;
                const publicAudioDir = nodePath.join(process.cwd(), "public", "audio");
                await nodeFs.mkdir(publicAudioDir, { recursive: true });
                const filePath = nodePath.join(publicAudioDir, fileName);
                const buffer = Buffer.from(await ttsRes.arrayBuffer());
                await nodeFs.writeFile(filePath, buffer);
                return NextResponse.json({ audio_url: `/audio/${fileName}` });
            }

            // If backend returns JSON (e.g. { audio_url: "..." }), pass through
            return NextResponse.json(await ttsRes.json());
        }

        // ── route: generate (LLM + TTS) ───────────────────────────────────────
        if (subPath === "generate") {
            // Delegate: first call /api/studio/script, then /api/studio/tts per segment
            // For now, proxy directly to TTS backend if it has a /generate endpoint
            if (!ttsUrlRaw) {
                return NextResponse.json(
                    { error: "请先在⚙️全局设置中配置 TTS API URL" },
                    { status: 400 }
                );
            }
            const baseUrl = normalizeTTSBaseUrl(ttsUrlRaw);
            const targetUrl = `${baseUrl}/api/studio/generate`;

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (ttsToken) headers["Authorization"] = `Bearer ${ttsToken}`;

            const genRes = await fetch(targetUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            });

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
