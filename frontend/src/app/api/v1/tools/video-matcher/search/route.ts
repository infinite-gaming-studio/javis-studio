import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        
        const pexelsKey = req.headers.get("x-pexels-key");
        if (pexelsKey) headers["x-pexels-key"] = pexelsKey;
        
        const pixabayKey = req.headers.get("x-pixabay-key");
        if (pixabayKey) headers["x-pixabay-key"] = pixabayKey;
        
        const youtubeKey = req.headers.get("x-youtube-key");
        if (youtubeKey) headers["x-youtube-key"] = youtubeKey;

        const unsplashKey = req.headers.get("x-unsplash-key");
        if (unsplashKey) headers["x-unsplash-key"] = unsplashKey;

        const backendUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";
        const targetUrl = `${backendUrl}/api/v1/tools/video-matcher/search`;

        const res = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            let errorDetail = await res.text().catch(() => "Unknown error from backend");
            try {
                const jsonErr = JSON.parse(errorDetail);
                if (jsonErr.detail) errorDetail = typeof jsonErr.detail === 'string' ? jsonErr.detail : JSON.stringify(jsonErr.detail);
            } catch (e) {
                // Ignore parsing errors
            }
            return NextResponse.json({ detail: errorDetail }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[Video Matcher Search Proxy] Internal Error:", error);
        return NextResponse.json(
            { detail: error.message || "Failed to reach backend." },
            { status: 500 }
        );
    }
}
