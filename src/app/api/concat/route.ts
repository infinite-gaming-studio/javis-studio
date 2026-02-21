import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

// Configure ffmpeg path
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Create a concat demuxer file for ffmpeg
 * This is the recommended way to concatenate media files
 */
async function createConcatFile(inputPaths: string[], concatFilePath: string): Promise<void> {
    const lines = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`);
    await fs.writeFile(concatFilePath, lines.join('\n'), 'utf-8');
}

export async function POST(req: Request) {
    try {
        const { urls } = await req.json();

        if (!Array.isArray(urls) || urls.length === 0) {
            return NextResponse.json({ error: "Invalid urls. Array required." }, { status: 400 });
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "javis-concat-"));

        // Ensure public/audio directory exists
        const publicAudioDir = path.join(process.cwd(), "public", "audio");
        await fs.mkdir(publicAudioDir, { recursive: true });

        // Download all audio files
        const localPaths: string[] = [];
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            let buffer: Buffer;

            // 本地文件直接读取，避免不必要的 HTTP 请求
            if (url.startsWith("/audio/")) {
                const localFilePath = path.join(process.cwd(), "public", url);
                buffer = await fs.readFile(localFilePath);
            } else {
                const fetchUrl = url.startsWith("http") ? url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${url.startsWith('/') ? '' : '/'}${url}`;
                const res = await fetch(fetchUrl);
                if (!res.ok) {
                    throw new Error(`Failed to fetch ${fetchUrl}: ${res.statusText}`);
                }
                buffer = Buffer.from(await res.arrayBuffer());
            }

            const ext = path.extname(url) || ".wav";
            const localPath = path.join(tempDir, `segment_${i}${ext}`);
            await fs.writeFile(localPath, buffer);
            localPaths.push(localPath);
        }

        const outFileName = `merged_${uuidv4()}.wav`;
        const outPath = path.join(publicAudioDir, outFileName);

        // Create concat demuxer file (best practice for ffmpeg concat)
        const concatListPath = path.join(tempDir, "concat_list.txt");
        await createConcatFile(localPaths, concatListPath);

        // Use ffmpeg concat demuxer with re-encoding for maximum compatibility
        // -c copy requires identical format across all inputs; re-encoding handles any format
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions([
                    '-acodec', 'pcm_s16le',  // PCM 16-bit (CD音质标准，兼容性好)
                    '-ar', '44100',          // 44.1kHz (CD音质标准，与大多数TTS输出匹配)
                    '-ac', '2',              // Stereo channel (dual)
                    '-af', 'aresample=resampler=soxr:precision=28',  // 使用SOXR高品质重采样算法
                    '-y'                     // Overwrite output
                ])
                .on("error", (err: Error) => {
                    console.error("FFmpeg concat error:", err);
                    reject(err);
                })
                .on("end", () => {
                    console.log(`Successfully merged ${urls.length} segments to ${outPath}`);
                    resolve();
                })
                .save(outPath);
        });

        // Cleanup temporary directory
        await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
            console.warn("Failed to cleanup temp dir:", err);
        });

        return NextResponse.json({ url: `/audio/${outFileName}` });
    } catch (e: unknown) {
        console.error("Concat Route Error:", e);
        const errorMessage = e instanceof Error ? e.message : "Unknown error during concatenation";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
