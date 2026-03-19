import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { prompt } = body;
        
        const llmUrl = req.headers.get("x-llm-url");
        const llmToken = req.headers.get("x-llm-token");
        const llmModel = req.headers.get("x-llm-model");

        if (!llmUrl || !llmToken || !llmModel) {
            return NextResponse.json({ detail: "缺少 AI 大模型配置，请先在右上角设置中配置 API Key。" }, { status: 400 });
        }

        const systemPrompt = `You are an expert data visualization designer using Apache ECharts. 
The user will ask for a specific type of chart.
Generate a highly premium, beautiful, and dynamic ECharts \`option\` Javascript object.
Use dark mode aesthetics (e.g. dark background, vibrant colors like cyan, fuchsia, emerald).
Include realistic mock data.
Enable animations (e.g., animationDuration: 3000, animationEasing: 'cubicOut').
IMPORTANT: Return ONLY the Javascript object itself. NO markdown formatting. No \`\`\` wrappers. Start with { and end with }. You MAY use Javascript functions for formatters if needed.`;

        const response = await fetch(`${llmUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${llmToken}`
            },
            body: JSON.stringify({
                model: llmModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`LLM API returned ${response.status}: ${errTxt}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content.trim();
        
        // Cleanup markdown wrappers if hallucinated
        if (content.startsWith("```json")) content = content.substring(7);
        else if (content.startsWith("```javascript")) content = content.substring(13);
        else if (content.startsWith("```js")) content = content.substring(5);
        else if (content.startsWith("```")) content = content.substring(3);
        
        if (content.endsWith("```")) content = content.substring(0, content.length - 3);

        return NextResponse.json({ optionString: content.trim() });
    } catch (e: any) {
        console.error("Stitch Generate Error:", e);
        return NextResponse.json({ detail: e.message || "Failed to generate AI effect" }, { status: 500 });
    }
}
