import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
        const targetUrl = `${backendUrl}/api/v1/tools/video-matcher/download/batch`;

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

        // Stream the response back to the client
        const blob = await res.blob();
        const filename = res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] || "media_package.zip";

        return new NextResponse(blob, {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error("[Batch Download Proxy] Internal Error:", error);
        return NextResponse.json(
            { detail: error.message || "Failed to reach backend." },
            { status: 500 }
        );
    }
}
