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

### RESPONSE FORMAT
Return the final result wrapped in special delimiters:
<<<STITCH_OPTION>>> { ... } <<<END_STITCH_OPTION>>>

### RULES
- Return ONLY the Javascript object itself inside the delimiters.
- It MUST start with "{" and end with "}".
- NO markdown formatting. No \`\`\` wrappers. 
- You MAY use Javascript functions for formatters if needed.`;

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
        
        if (!data || !data.choices || data.choices.length === 0) {
            console.error("Invalid AI response structure:", data);
            throw new Error(`AI 服务返回格式异常 (${data.detail || data.message || "未知原因"})`);
        }

        const responseContent = data.choices[0]?.message?.content?.trim() || "";
        
        if (!responseContent) {
            throw new Error("AI 返回了空内容，请稍后重试。");
        }
        
        // Extract using delimiters
        const optMatch = responseContent.match(/<<<STITCH_OPTION>>>([\s\S]*?)<<<END_STITCH_OPTION>>>/);
        let content = optMatch ? optMatch[1].trim() : responseContent;

        // Cleanup markdown wrappers if hallucinated
        if (content.startsWith("```json")) content = content.substring(7);
        else if (content.startsWith("```javascript")) content = content.substring(13);
        else if (content.startsWith("```js")) content = content.substring(5);
        else if (content.startsWith("```")) content = content.substring(3);
        if (content.endsWith("```")) content = content.substring(0, content.length - 3);

        content = content.trim();

        // Robust extraction logic
        if (content.startsWith("{") && content.endsWith("}")) {
            try {
                const parsed = JSON.parse(content);
                const optionKey = Object.keys(parsed).find(k => 
                    k.toLowerCase().includes("option") || 
                    k.toLowerCase().includes("config") || 
                    k.toLowerCase().includes("code")
                );
                if (optionKey && typeof parsed[optionKey] === 'string') {
                    content = parsed[optionKey];
                } else if (optionKey && typeof parsed[optionKey] === 'object') {
                    content = JSON.stringify(parsed[optionKey]);
                }
            } catch (e) {
                // Not valid JSON, probably raw JS
            }
        }

        if (!content.includes("{")) {
            throw new Error("AI 生成的图表配置格式无效 (未检测到有效配置对象)。");
        }

        return NextResponse.json({ optionString: content });
    } catch (e: any) {
        console.error("Stitch Generate Error:", e);
        return NextResponse.json({ detail: e.message || "Failed to generate AI effect" }, { status: 500 });
    }
}
