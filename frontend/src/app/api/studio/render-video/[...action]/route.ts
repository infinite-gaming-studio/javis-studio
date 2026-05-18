import { NextResponse } from "next/server";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ action: string[] }> }
) {
    try {
        const { action } = await params;
        const subPath = action.join("/");
        const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";
        const targetUrl = `${backendUrl}/api/studio/render-video/${subPath}`;

        console.log(`[Proxy] Streaming large POST payload to: ${targetUrl}`);

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': req.headers.get('Content-Type') || 'application/json',
            },
            body: req.body,
            // 'duplex: half' is required in Node fetch when streaming a request body
            duplex: 'half',
        } as any);

        return new NextResponse(res.body, {
            status: res.status,
            headers: res.headers,
        });
    } catch (e: any) {
        console.error("[Proxy] render-video streaming proxy error:", e);
        return NextResponse.json({ error: `视频渲染后端请求失败: ${e.message}` }, { status: 502 });
    }
}
