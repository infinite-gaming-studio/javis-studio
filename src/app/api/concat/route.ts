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
            const isAbsolute = url.startsWith("http");
            const fetchUrl = isAbsolute ? url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${url.startsWith('/') ? '' : '/'}${url}`;

            const res = await fetch(fetchUrl);
            if (!res.ok) {
                throw new Error(`Failed to fetch ${fetchUrl}: ${res.statusText}`);
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            const parsedUrl = new URL(fetchUrl);
            const ext = path.extname(parsedUrl.pathname) || ".wav";
            const localPath = path.join(tempDir, `segment_${i}${ext}`);
            await fs.writeFile(localPath, buffer);
            localPaths.push(localPath);
        }

        const outFileName = `merged_${uuidv4()}.wav`;
        const outPath = path.join(publicAudioDir, outFileName);

        // Create concat demuxer file (best practice for ffmpeg concat)
        const concatListPath = path.join(tempDir, "concat_list.txt");
        await createConcatFile(localPaths, concatListPath);

        // Use ffmpeg concat demuxer for reliable audio merging
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions([
                    '-c', 'copy',           // Copy codec (no re-encoding, fast)
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
