import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, currentOption, prompt, image } = body;
        
        const llmUrl = req.headers.get("x-llm-url");
        const llmToken = req.headers.get("x-llm-token");
        const llmModel = req.headers.get("x-llm-model");

        if (!llmUrl || !llmToken || !llmModel) {
            return NextResponse.json({ detail: "缺少 AI 大模型配置，请先在右上角设置中配置 API Key。" }, { status: 400 });
        }

        const systemPrompt = `You are an expert data visualization designer using Apache ECharts. 
The user wants to iteratively modify an existing ECharts configuration.
You will be provided with the current ECharts \`option\` object as JSON.
You must update the configuration based on the user's instructions.

### STRICT RESPONSE FORMAT
Your response must follow this EXACT structure:
1. Short commentary in Chinese.
2. The final JSON result wrapped in special delimiters: <<<STITCH_JSON>>> { ... } <<<END_STITCH_JSON>>>

The JSON inside the delimiters MUST have exactly two keys:
- "reply": The same short commentary (in Chinese).
- "optionString": The COMPLETE, updated ECharts \`option\` Javascript object as a string.

### ONE-SHOT EXAMPLE
User Instruction: "将背景改为暗蓝色，并平滑曲线"
Current Option: { "xAxis": { "data": ["A", "B"] }, "series": [{ "type": "line", "data": [1, 2] }] }

Assistant Response:
已经为您将背景设置为暗蓝色，并开启了曲线平滑效果。
<<<STITCH_JSON>>>
{
  "reply": "已经为您将背景设置为暗蓝色，并开启了曲线平滑效果。",
  "optionString": "{ backgroundColor: '#000814', xAxis: { data: ['A', 'B'] }, series: [{ type: 'line', data: [1, 2], smooth: true }] }"
}
<<<END_STITCH_JSON>>>

### RULES
- DO NOT use markdown code blocks (\`\`\`).
- DO NOT hallucinate keys. Only "reply" and "optionString".
- "optionString" must be the ENTIRE updated object, not just changes.
- Ensure the JSON is valid and the delimiters are verbatim.`;

        // Format user message to include prompt, current option, and optional image
        let content: any[] = [
            {
                type: "text",
                text: `### CURRENT STATE
Current ECharts Option:
${JSON.stringify(currentOption, null, 2)}

### USER INSTRUCTION
${prompt}`
            }
        ];

        if (image) {
            content.push({
                type: "image_url",
                image_url: {
                    url: image 
                }
            });
        }

        const llmMessages = [
            { role: "system", content: systemPrompt },
            ...messages.map((m: any) => ({
                role: m.role,
                content: m.content
            })),
            { role: "user", content }
        ];

        const response = await fetch(`${llmUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${llmToken}`
            },
            body: JSON.stringify({
                model: llmModel,
                messages: llmMessages,
                temperature: 0.7
                // REMOVED response_format: { type: "json_object" } as it conflicts with custom delimiters
            })
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`LLM API returned ${response.status}: ${errTxt}`);
        }

        const data = await response.json();
        
        if (!data || !data.choices || data.choices.length === 0) {
            console.error("Invalid LLM response structure:", data);
            throw new Error(`AI 服务返回格式异常 (${data.detail || data.message || "未知原因"})`);
        }

        const responseContent = data.choices[0]?.message?.content?.trim() || "";
        
        if (!responseContent) {
            throw new Error("AI 返回了空内容，请稍后重试。");
        }

        // [LOGGING] Temporarily log the raw response to help debug
        console.log("RAW AI RESPONSE:", responseContent);
        
        // Extract JSON using delimiters (verbatim first, then fuzzy)
        let jsonToParse = "";
        const jsonMatch = responseContent.match(/<<<STITCH_JSON>>>([\s\S]*?)<<<END_STITCH_JSON>>>/);
        
        if (jsonMatch) {
            jsonToParse = jsonMatch[1].trim();
        } else {
            // Fallback: search for anything between the markers, even if malformed
            const markers = ["<<<STITCH_JSON>>>", "STITCH_JSON", "<<<END_STITCH_JSON>>>", "END_STITCH_JSON"];
            let startIndex = -1;
            for (const m of markers.slice(0, 2)) {
                if (responseContent.indexOf(m) !== -1) {
                    startIndex = responseContent.indexOf(m) + m.length;
                    break;
                }
            }
            let endIndex = -1;
            for (const m of markers.slice(2)) {
                if (responseContent.lastIndexOf(m) !== -1) {
                    endIndex = responseContent.lastIndexOf(m);
                    break;
                }
            }

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                jsonToParse = responseContent.substring(startIndex, endIndex).trim();
            } else {
                // Last fallback: find the longest { ... } block
                const braceMatch = responseContent.match(/\{[\s\S]*\}/);
                if (braceMatch) {
                    jsonToParse = braceMatch[0];
                } else {
                    jsonToParse = responseContent;
                }
            }
        }

        // Cleanup markdown wrappers
        if (jsonToParse.startsWith("```json")) jsonToParse = jsonToParse.substring(7);
        else if (jsonToParse.startsWith("```javascript")) jsonToParse = jsonToParse.substring(13);
        else if (jsonToParse.startsWith("```js")) jsonToParse = jsonToParse.substring(5);
        else if (jsonToParse.startsWith("```")) jsonToParse = jsonToParse.substring(3);
        if (jsonToParse.endsWith("```")) jsonToParse = jsonToParse.substring(0, jsonToParse.length - 3);

        let parsedContent: any;
        try {
            parsedContent = JSON.parse(jsonToParse.trim());
        } catch (e) {
            // High-power retry: try to find a JSON object inside the string if it's already a partial
            try {
                 const innerMatch = jsonToParse.match(/\{[\s\S]*\}/);
                 if (innerMatch) {
                     parsedContent = JSON.parse(innerMatch[0]);
                 } else {
                     throw e;
                 }
            } catch (e2) {
                console.error("Critical Parse Error. Content was:", responseContent);
                throw new Error("AI 返回的格式无法解析，请再次尝试。");
            }
        }

        // Extremely robust key matching
        let reply = "图表已根据您的要求进行了更新。";
        let optionString = "";

        // Flatten the search: look for any keys that resemble reply or option
        const findKey = (obj: any, search: string): any => {
            if (!obj || typeof obj !== 'object') return null;
            const keys = Object.keys(obj);
            // Direct match
            for (const k of keys) {
                if (k.toLowerCase() === search.toLowerCase()) return obj[k];
            }
            // Partial match
            for (const k of keys) {
                if (k.toLowerCase().includes(search.toLowerCase())) return obj[k];
            }
            // Recurse once
            for (const k of keys) {
                 if (typeof obj[k] === 'object') {
                     const res = findKey(obj[k], search);
                     if (res) return res;
                 }
            }
            return null;
        };

        const foundReply = findKey(parsedContent, "reply") || findKey(parsedContent, "explanation") || findKey(parsedContent, "content");
        if (foundReply && typeof foundReply === 'string') reply = foundReply;

        const foundOption = findKey(parsedContent, "option") || findKey(parsedContent, "config") || findKey(parsedContent, "code") || findKey(parsedContent, "echart");
        if (foundOption) {
            if (typeof foundOption === 'string') optionString = foundOption;
            else if (typeof foundOption === 'object') optionString = JSON.stringify(foundOption);
        }

        // If still not found, and parsedContent itself looks like an ECharts option (contains grid/xAxis/series/etc)
        if (!optionString) {
             if (parsedContent.series || parsedContent.xAxis || (parsedContent.grid && parsedContent.yAxis)) {
                 optionString = JSON.stringify(parsedContent);
             }
        }

        if (!optionString) {
            console.error("Incomplete AI Data. Parsed object keys:", Object.keys(parsedContent));
            throw new Error("AI 返回的数据不完整，无法提取图表配置。");
        }

        const optionStr = optionString.trim();
        if (!optionStr.includes("{")) {
             throw new Error("AI 生成的图表配置格式无效。");
        }

        return NextResponse.json({ 
            reply: reply,
            optionString: optionStr
        });
    } catch (e: any) {
        console.error("Stitch Chat Error:", e);
        return NextResponse.json({ detail: e.message || "Failed to edit AI effect" }, { status: 500 });
    }
}
