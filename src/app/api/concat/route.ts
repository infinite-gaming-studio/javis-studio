import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
// @ts-expect-error
import { v4 as uuidv4 } from "uuid";
// @ts-expect-error
import ffmpeg from "fluent-ffmpeg";
// @ts-expect-error
import ffmpegStatic from "ffmpeg-static";

// Configure ffmpeg path if available
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic as string);
} else {
    console.warn("ffmpeg-static not found. Make sure ffmpeg is installed in the system.");
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
            // If the URL is relative, assume it's from the backend on localhost:8000
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

        // Merge files using fluent-ffmpeg
        await new Promise<void>((resolve, reject) => {
            const command = ffmpeg();

            // Add each file as input
            localPaths.forEach(p => command.input(p));

            command
                .on("error", (err: Error) => {
                    console.error("FFmpeg concat error:", err);
                    reject(err);
                })
                .on("end", () => {
                    console.log(`Successfully merged ${urls.length} segments to ${outPath}`);
                    resolve();
                })
                .mergeToFile(outPath, tempDir);
        });

        // Cleanup temporary directory
        await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
            console.warn("Failed to cleanup temp dir:", err);
        });

        // Return the public URL to the merged file
        return NextResponse.json({ url: `/audio/${outFileName}` });
    } catch (e: unknown) {
        console.error("Concat Route Error:", e);
        const errorMessage = e instanceof Error ? e.message : "Unknown error during concatenation";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
