import { NextResponse } from "next/server";

/**
 * API Proxy for testing connections
 * This bypasses CORS restrictions when testing third-party API endpoints from the browser.
 */
export async function POST(req: Request) {
    try {
        const { url, method = "GET", headers = {} } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "Target URL is required" }, { status: 400 });
        }

        console.log(`[Proxy] Testing connection to: ${url} (${method})`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    ...headers,
                    "User-Agent": "JavisStudio/1.0",
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // We don't always need the body, but let's try to get it for error details
            let errorDetail = "";
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                try {
                    const data = JSON.parse(text);
                    errorDetail = data.error?.message || data.detail || text;
                } catch {
                    errorDetail = text.slice(0, 200); // Limit long error messages
                }
            }

            return NextResponse.json({
                ok: res.ok,
                status: res.status,
                statusText: res.statusText,
                errorDetail: errorDetail,
            });
        } catch (fetchError: unknown) {
            clearTimeout(timeoutId);
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            return NextResponse.json({
                ok: false,
                status: 0,
                statusText: "Fetch Error",
                errorDetail: message,
            }, { status: 200 }); // Status 200 because the proxy worked, but the target failed
        }
    } catch (e: unknown) {
        console.error("Proxy Route Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
