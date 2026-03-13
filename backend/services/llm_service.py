import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from config import get_settings
from models.schemas import ScriptSegment

logger = logging.getLogger(__name__)
settings = get_settings()

_SYSTEM_PROMPT = """\
你是一位专业的影视旁白撰稿人。
用户将提供若干图片和背景提示词，请你根据图片内容和提示词，写出一段专业、流畅、富有情感的旁白逐字稿。

**输出要求（严格遵守）**：
- 输出格式为 JSON 数组；
- 每个元素代表一段独立语音片段（建议每段 20~80 字）；
- 每个元素包含以下字段：
  - "index": 段落序号（从 0 开始）
  - "text": 旁白文本
  - "emotion_hint": 情感提示词（英文），可选值：happy | angry | sad | afraid | disgusted | melancholic | surprised | calm | neutral
- 不要输出任何 JSON 以外的内容，不要有 markdown 代码块包裹。

示例输出：
[
  {"index": 0, "text": "欢迎来到未来的世界。", "emotion_hint": "calm"},
  {"index": 1, "text": "这里，科技与自然和谐共存。", "emotion_hint": "happy"}
]
"""


def _parse_segments(raw: str) -> list[ScriptSegment]:
    """Parse LLM JSON output into ScriptSegment list."""
    raw = raw.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    return [ScriptSegment(**item) for item in data]


async def generate_script_openai(
    images: list[str],
    prompt: str,
    language: str = "zh",
) -> list[ScriptSegment]:
    """Generate narration script using OpenAI (GPT-4o vision)."""
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)

    content: list[dict] = []
    # Add images
    for img in images:
        if img.startswith("http"):
            content.append({"type": "image_url", "image_url": {"url": img}})
        else:
            # Assume base64 data URI
            content.append({"type": "image_url", "image_url": {"url": img}})

    content.append({
        "type": "text",
        "text": f"目标语言：{language}\n\n用户提示词：\n{prompt}",
    })

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]

    logger.info("Calling OpenAI LLM: model=%s, images=%d", settings.openai_model, len(images))
    resp = await client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        temperature=0.7,
        max_tokens=2048,
    )
    raw = resp.choices[0].message.content or "[]"
    logger.debug("LLM raw output: %s", raw[:500])
    return _parse_segments(raw)


async def generate_script_gemini(
    images: list[str],
    prompt: str,
    language: str = "zh",
) -> list[ScriptSegment]:
    """Generate narration script using Google Gemini."""
    import base64
    import httpx
    import google.genai as genai
    from google.genai import types

    # Initialize the new SDK client
    client = genai.Client(api_key=settings.gemini_api_key)

    parts: list = []
    for img in images:
        if img.startswith("data:image"):
            # base64 data URI
            header, b64data = img.split(",", 1)
            mime = header.split(";")[0].replace("data:", "")
            parts.append(types.Part.from_bytes(data=base64.b64decode(b64data), mime_type=mime))
        elif img.startswith("http"):
            # Fetch the image bytes
            async with httpx.AsyncClient() as client_http:
                r = await client_http.get(img, timeout=15)
                r.raise_for_status()
                mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
                parts.append(types.Part.from_bytes(data=r.content, mime_type=mime))
        else:
            logger.warning("Unknown image format, skipping: %s", img[:80])

    parts.append(types.Part.from_text(text=f"目标语言：{language}\n\n用户提示词：\n{prompt}"))

    logger.info("Calling Gemini LLM: model=%s, images=%d", settings.gemini_model, len(images))
    
    # Generate content using the new async API
    resp = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=parts,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
        )
    )
    raw = resp.text or "[]"
    logger.debug("Gemini raw output: %s", raw[:500])
    return _parse_segments(raw)


async def generate_script(
    images: list[str],
    prompt: str,
    language: str = "zh",
) -> list[ScriptSegment]:
    """Dispatch to the configured LLM provider."""
    provider = settings.llm_provider.lower()
    if provider == "gemini":
        return await generate_script_gemini(images, prompt, language)
    return await generate_script_openai(images, prompt, language)
