"""
Video Matcher Workflow Service - Human-in-the-loop Architecture

基于第一性原理设计的工作流：
1. Step 1: AI 分段 + 提取关键词 → 人工确认
2. Step 2: AI 搜索素材 → 人工选择
3. Step 3: 导出最终结果

优势：
- 每一步都可排查问题
- 人工可以随时干预
- 支持增量式处理
"""

import json
import logging
import asyncio
from typing import List, Dict, Any, Optional, Literal
from dataclasses import dataclass, field
from urllib.parse import quote_plus
from openai import AsyncOpenAI
import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

MediaType = Literal["video", "photo"]

# ═══════════════════════════════════════════════════════════════════════════════
# 数据模型
# ═══════════════════════════════════════════════════════════════════════════════

class WorkflowStep:
    """工作流步骤"""
    SEGMENTATION = "segmentation"      # 分段+关键词提取
    KEYWORD_REVIEW = "keyword_review"   # 关键词人工确认
    MEDIA_SEARCH = "media_search"       # 素材搜索
    MEDIA_SELECTION = "media_selection" # 素材人工选择
    EXPORT = "export"                   # 导出

class SegmentData(BaseModel):
    """字幕分段数据"""
    id: str                          # 唯一标识
    index: int                       # 顺序索引
    segment_text: str                # 字幕文本
    ai_keyword: str                  # AI提取的关键词
    user_keyword: Optional[str] = None  # 用户修改后的关键词
    keyword_confirmed: bool = False  # 是否已确认
    
class MediaCandidate(BaseModel):
    """媒体候选"""
    source: str                      # pexels, pixabay, youtube, unsplash
    media_type: MediaType
    media_url: str
    source_url: str
    media_id: str
    thumbnail_url: str
    duration: int = 0
    width: int = 0
    height: int = 0
    title: str = ""                  # 素材标题（用于人工判断）

class SegmentWithMedia(BaseModel):
    """带有素材的分段"""
    id: str
    index: int
    segment_text: str
    keyword: str                     # 最终使用的关键词
    media_type: MediaType
    candidates: List[MediaCandidate] = []
    selected_candidate_index: int = 0
    search_error: Optional[str] = None

class WorkflowState(BaseModel):
    """工作流状态 - 可持久化"""
    session_id: str
    current_step: str = WorkflowStep.SEGMENTATION
    media_type_preference: MediaType = "video"
    
    # Step 1 数据
    original_text: str = ""
    segments: List[SegmentData] = []
    segmentation_error: Optional[str] = None
    
    # Step 2 数据
    segments_with_media: List[SegmentWithMedia] = []
    
    # 元数据
    created_at: str = ""
    updated_at: str = ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1: AI 分段 + 关键词提取
# ═══════════════════════════════════════════════════════════════════════════════

SEGMENTATION_PROMPT = """\
你是一个专业的视频脚本分析助手。请分析用户提供的视频解说文案/逐字稿。

任务：
1. 将文案按照语义拆分成多个短句（每句约10-40个字，适合配合一个镜头）
2. 为每个短句提取一个高度相关的英文搜索关键词

输出要求（严格遵守）：
1. 必须输出合法的 JSON 数组
2. 每个元素包含：
   - "segment_text": 拆分出的文案片段（保留原文）
   - "ai_keyword": AI提取的英文搜索关键词（1-3个单词，精准描述画面内容）
   - "reasoning": 简短说明为什么选择这个关键词（中文，帮助人工审核）
3. 不要输出任何 JSON 以外的内容
4. 确保 JSON 完整、格式正确，字符串需要正确转义

示例输出：
[
  {
    "segment_text": "今天我们来看一段奇妙的海底世界。",
    "ai_keyword": "underwater ocean",
    "reasoning": "海底世界对应 underwater ocean"
  },
  {
    "segment_text": "五颜六色的珊瑚礁中，游动着一群海龟。",
    "ai_keyword": "sea turtle coral",
    "reasoning": "画面主体是海龟和珊瑚"
  }
]
"""


def normalize_llm_url(url: str) -> str:
    """Normalize LLM API URL."""
    if not url:
        return "https://api.openai.com/v1"
    url = url.strip().rstrip("/")
    if url.endswith("/v1/chat/completions"):
        url = url[:-len("/chat/completions")]
    elif url.endswith("/chat/completions"):
        url = url[:-len("/chat/completions")]
    return url


def safe_json_parse(raw: str) -> tuple[bool, Any]:
    """
    安全地解析 JSON，尝试多种修复方式
    返回: (是否成功, 解析结果或错误信息)
    """
    original = raw.strip()
    
    # 尝试 1: 直接解析
    try:
        return True, json.loads(original)
    except json.JSONDecodeError:
        pass
    
    # 尝试 2: 去除 markdown 代码块
    cleaned = original
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 3:
            cleaned = parts[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
            elif cleaned.startswith("\n"):
                cleaned = cleaned[1:].strip()
    
    try:
        return True, json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    
    # 尝试 3: 提取方括号之间的内容
    try:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1 and end > start:
            return True, json.loads(cleaned[start:end+1])
    except json.JSONDecodeError:
        pass
    
    # 尝试 4: 修复常见的 JSON 错误
    # 4.1: 处理未闭合的字符串
    try:
        # 找到最后一个完整的对象
        fixed = cleaned
        # 尝试补全不完整的 JSON
        open_braces = fixed.count("{") - fixed.count("}")
        open_brackets = fixed.count("[") - fixed.count("]")
        
        if open_brackets > 0:
            fixed += "]" * open_brackets
        if open_braces > 0:
            fixed += "}" * open_braces
        
        return True, json.loads(fixed)
    except json.JSONDecodeError:
        pass
    
    # 所有尝试都失败
    return False, {
        "error": "JSON parse failed",
        "raw_preview": original[:500] if len(original) > 500 else original,
        "raw_length": len(original)
    }


async def step1_extract_segments(
    text: str,
    llm_url: str,
    llm_token: str,
    llm_model: str,
) -> tuple[bool, List[SegmentData], Optional[str]]:
    """
    Step 1: AI 分段和关键词提取
    
    返回: (是否成功, 分段列表, 错误信息)
    """
    logger.info(f"Step 1: Starting segmentation, text length={len(text)}")
    
    if not text or not text.strip():
        return False, [], "输入文本为空"
    
    base_url = normalize_llm_url(llm_url)
    client = AsyncOpenAI(api_key=llm_token, base_url=base_url)
    
    messages = [
        {"role": "system", "content": SEGMENTATION_PROMPT},
        {"role": "user", "content": f"请分析以下文案并分段提取关键词：\n\n{text}"},
    ]
    
    try:
        resp = await client.chat.completions.create(
            model=llm_model or "gpt-3.5-turbo",
            messages=messages,
            temperature=0.5,  # 降低温度以获得更稳定的输出
            max_tokens=2048,
        )
        raw = resp.choices[0].message.content or "[]"
        
        logger.debug(f"Step 1: LLM raw output: {raw[:500]}")
        
        # 安全解析 JSON
        success, data = safe_json_parse(raw)
        
        if not success:
            error_detail = data if isinstance(data, dict) else {"error": str(data)}
            logger.error(f"Step 1: JSON parse failed: {error_detail}")
            return False, [], f"AI 返回格式错误: {error_detail.get('error', 'Unknown')}"
        
        if not isinstance(data, list):
            return False, [], f"AI 返回的不是数组: {type(data)}"
        
        # 转换为 SegmentData
        import uuid
        segments = []
        for i, item in enumerate(data):
            segment_text = item.get("segment_text", "").strip()
            ai_keyword = item.get("ai_keyword", "").strip()
            
            if not segment_text:
                logger.warning(f"Step 1: Empty segment at index {i}, skipping")
                continue
                
            segments.append(SegmentData(
                id=str(uuid.uuid4())[:8],
                index=i,
                segment_text=segment_text,
                ai_keyword=ai_keyword or "video background",
                user_keyword=None,
                keyword_confirmed=False,
            ))
        
        logger.info(f"Step 1: Successfully extracted {len(segments)} segments")
        return True, segments, None
        
    except Exception as e:
        logger.exception("Step 1: Exception during segmentation")
        return False, [], f"AI 调用失败: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# Step 2: 素材搜索
# ═══════════════════════════════════════════════════════════════════════════════

async def search_pexels_video(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 Pexels 视频"""
    if not api_key:
        return None
    
    url = f"https://api.pexels.com/videos/search?query={keyword}&per_page=1&orientation=landscape"
    headers = {"Authorization": api_key}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            videos = data.get("videos", [])
            
            if videos:
                video = videos[0]
                files = video.get("video_files", [])
                hd_files = [f for f in files if f.get("quality") in ("hd", "uhd")]
                best = hd_files[0] if hd_files else (files[0] if files else None)
                
                if best:
                    vid = video.get("id", 0)
                    return MediaCandidate(
                        source="pexels",
                        media_type="video",
                        media_url=best.get("link", ""),
                        source_url=f"https://www.pexels.com/video/{vid}/",
                        media_id=str(vid),
                        thumbnail_url=video.get("image", ""),
                        duration=video.get("duration", 0),
                        width=best.get("width", 0),
                        height=best.get("height", 0),
                        title=keyword,
                    )
    except Exception as e:
        logger.error(f"Pexels video search error: {e}")
    return None


async def search_pixabay_video(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 Pixabay 视频"""
    if not api_key:
        return None
    
    url = f"https://pixabay.com/api/videos/?key={api_key}&q={quote_plus(keyword)}&per_page=1"
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            hits = data.get("hits", [])
            
            if hits:
                video = hits[0]
                vids = video.get("videos", {})
                best = None
                for q in ("large", "medium", "small"):
                    if vids.get(q, {}).get("url"):
                        best = vids[q]
                        break
                
                if best:
                    vid = video.get("id", 0)
                    return MediaCandidate(
                        source="pixabay",
                        media_type="video",
                        media_url=best.get("url", ""),
                        source_url=f"https://pixabay.com/videos/id-{vid}/",
                        media_id=str(vid),
                        thumbnail_url=best.get("thumbnail", ""),
                        duration=video.get("duration", 0),
                        width=best.get("width", 0),
                        height=best.get("height", 0),
                        title=keyword,
                    )
    except Exception as e:
        logger.error(f"Pixabay video search error: {e}")
    return None


async def search_youtube_video(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 YouTube 视频"""
    if not api_key:
        return None
    
    url = (
        f"https://www.googleapis.com/youtube/v3/search"
        f"?part=snippet&q={quote_plus(keyword)}&type=video"
        f"&videoEmbeddable=true&videoLicense=creativeCommon&maxResults=1&key={api_key}"
    )
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items", [])
            
            if items:
                item = items[0]
                vid = item.get("id", {}).get("videoId", "")
                snippet = item.get("snippet", {})
                thumbs = snippet.get("thumbnails", {})
                thumb = thumbs.get("high", {}).get("url") or thumbs.get("medium", {}).get("url", "")
                
                if vid:
                    return MediaCandidate(
                        source="youtube",
                        media_type="video",
                        media_url=f"https://www.youtube.com/embed/{vid}",
                        source_url=f"https://www.youtube.com/watch?v={vid}",
                        media_id=vid,
                        thumbnail_url=thumb,
                        duration=0,  # YouTube search API 不返回时长
                        width=0,
                        height=0,
                        title=snippet.get("title", keyword)[:50],
                    )
    except Exception as e:
        logger.error(f"YouTube search error: {e}")
    return None


async def search_pexels_photo(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 Pexels 图片"""
    if not api_key:
        return None
    
    url = f"https://api.pexels.com/v1/search?query={keyword}&per_page=1&orientation=landscape"
    headers = {"Authorization": api_key}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            photos = data.get("photos", [])
            
            if photos:
                photo = photos[0]
                src = photo.get("src", {})
                pid = photo.get("id", 0)
                return MediaCandidate(
                    source="pexels",
                    media_type="photo",
                    media_url=src.get("landscape") or src.get("large", ""),
                    source_url=f"https://www.pexels.com/photo/{pid}/",
                    media_id=str(pid),
                    thumbnail_url=src.get("medium", ""),
                    duration=0,
                    width=photo.get("width", 0),
                    height=photo.get("height", 0),
                    title=keyword,
                )
    except Exception as e:
        logger.error(f"Pexels photo search error: {e}")
    return None


async def search_pixabay_photo(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 Pixabay 图片"""
    if not api_key:
        return None
    
    url = f"https://pixabay.com/api/?key={api_key}&q={quote_plus(keyword)}&per_page=1&image_type=photo"
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            hits = data.get("hits", [])
            
            if hits:
                photo = hits[0]
                pid = photo.get("id", 0)
                return MediaCandidate(
                    source="pixabay",
                    media_type="photo",
                    media_url=photo.get("largeImageURL", ""),
                    source_url=f"https://pixabay.com/photos/id-{pid}/",
                    media_id=str(pid),
                    thumbnail_url=photo.get("previewURL", ""),
                    duration=0,
                    width=photo.get("imageWidth", 0),
                    height=photo.get("imageHeight", 0),
                    title=keyword,
                )
    except Exception as e:
        logger.error(f"Pixabay photo search error: {e}")
    return None


async def search_unsplash_photo(keyword: str, api_key: str) -> Optional[MediaCandidate]:
    """搜索 Unsplash 图片"""
    if not api_key:
        return None
    
    url = f"https://api.unsplash.com/search/photos?query={keyword}&per_page=1&orientation=landscape"
    headers = {"Authorization": f"Client-ID {api_key}"}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            
            if results:
                photo = results[0]
                pid = photo.get("id", "")
                urls = photo.get("urls", {})
                return MediaCandidate(
                    source="unsplash",
                    media_type="photo",
                    media_url=urls.get("regular", ""),
                    source_url=photo.get("links", {}).get("html", ""),
                    media_id=str(pid),
                    thumbnail_url=urls.get("small", ""),
                    duration=0,
                    width=photo.get("width", 0),
                    height=photo.get("height", 0),
                    title=keyword,
                )
    except Exception as e:
        logger.error(f"Unsplash search error: {e}")
    return None


async def search_media_for_segment(
    keyword: str,
    media_type: MediaType,
    pexels_key: str = "",
    pixabay_key: str = "",
    youtube_key: str = "",
    unsplash_key: str = "",
) -> tuple[List[MediaCandidate], Optional[str]]:
    """
    为单个分段搜索素材
    
    返回: (候选列表, 错误信息)
    """
    logger.info(f"Searching {media_type} for keyword: {keyword}")
    
    tasks = []
    
    if media_type == "video":
        if pexels_key:
            tasks.append(search_pexels_video(keyword, pexels_key))
        if pixabay_key:
            tasks.append(search_pixabay_video(keyword, pixabay_key))
        if youtube_key:
            tasks.append(search_youtube_video(keyword, youtube_key))
    else:  # photo
        if pexels_key:
            tasks.append(search_pexels_photo(keyword, pexels_key))
        if pixabay_key:
            tasks.append(search_pixabay_photo(keyword, pixabay_key))
        if unsplash_key:
            tasks.append(search_unsplash_photo(keyword, unsplash_key))
    
    if not tasks:
        return [], "没有配置任何素材源 API Key"
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    candidates = []
    errors = []
    
    for result in results:
        if isinstance(result, Exception):
            errors.append(str(result))
        elif result is not None:
            candidates.append(result)
    
    if not candidates and errors:
        return [], f"搜索失败: {'; '.join(errors[:2])}"
    
    return candidates, None


async def step2_search_media(
    segments: List[SegmentData],
    media_type: MediaType,
    pexels_key: str = "",
    pixabay_key: str = "",
    youtube_key: str = "",
    unsplash_key: str = "",
) -> tuple[bool, List[SegmentWithMedia], Optional[str]]:
    """
    Step 2: 批量搜索素材
    
    返回: (是否成功, 带素材的分段列表, 错误信息)
    """
    logger.info(f"Step 2: Searching media for {len(segments)} segments, type={media_type}")
    
    async def process_one(seg: SegmentData) -> SegmentWithMedia:
        keyword = seg.user_keyword if seg.user_keyword else seg.ai_keyword
        
        candidates, error = await search_media_for_segment(
            keyword=keyword,
            media_type=media_type,
            pexels_key=pexels_key,
            pixabay_key=pixabay_key,
            youtube_key=youtube_key,
            unsplash_key=unsplash_key,
        )
        
        return SegmentWithMedia(
            id=seg.id,
            index=seg.index,
            segment_text=seg.segment_text,
            keyword=keyword,
            media_type=media_type,
            candidates=candidates,
            selected_candidate_index=0 if candidates else -1,
            search_error=error if not candidates else None,
        )
    
    # 并发搜索所有分段
    tasks = [process_one(seg) for seg in segments]
    results = await asyncio.gather(*tasks)
    
    # 统计结果
    total = len(results)
    with_media = sum(1 for r in results if r.candidates)
    with_error = sum(1 for r in results if r.search_error)
    
    logger.info(f"Step 2: Completed. {with_media}/{total} segments with media, {with_error} errors")
    
    return True, list(results), None


# ═══════════════════════════════════════════════════════════════════════════════
# 完整工作流
# ═══════════════════════════════════════════════════════════════════════════════

class VideoMatcherWorkflow:
    """
    视频配图工作流 - Human in the Loop
    
    使用方式：
    1. 调用 step1() 获取分段和关键词 → 前端展示供人工确认
    2. 人工修改关键词后，调用 step2() 搜索素材 → 前端展示供人工选择
    3. 人工选择素材后，调用 export() 导出最终结果
    """
    
    def __init__(
        self,
        llm_url: str,
        llm_token: str,
        llm_model: str,
        pexels_key: str = "",
        pixabay_key: str = "",
        youtube_key: str = "",
        unsplash_key: str = "",
    ):
        self.llm_url = llm_url
        self.llm_token = llm_token
        self.llm_model = llm_model
        self.pexels_key = pexels_key
        self.pixabay_key = pixabay_key
        self.youtube_key = youtube_key
        self.unsplash_key = unsplash_key
    
    async def step1_segment(self, text: str) -> dict:
        """
        第一步：分段和关键词提取
        
        返回包含以下字段的字典：
        - success: bool
        - segments: List[SegmentData]
        - error: Optional[str]
        - debug_info: dict
        """
        success, segments, error = await step1_extract_segments(
            text=text,
            llm_url=self.llm_url,
            llm_token=self.llm_token,
            llm_model=self.llm_model,
        )
        
        return {
            "success": success,
            "segments": [s.model_dump() for s in segments] if segments else [],
            "error": error,
            "debug_info": {
                "input_length": len(text),
                "output_segments": len(segments) if segments else 0,
            }
        }
    
    async def step2_search(
        self,
        segments: List[dict],
        media_type: MediaType = "video",
    ) -> dict:
        """
        第二步：搜索素材
        
        参数:
        - segments: 前端确认后的分段列表（包含用户修改的关键词）
        - media_type: 素材类型
        
        返回:
        - success: bool
        - segments_with_media: List[SegmentWithMedia]
        - error: Optional[str]
        - stats: dict
        """
        # 转换前端传来的数据
        segment_objects = [SegmentData(**s) for s in segments]
        
        success, results, error = await step2_search_media(
            segments=segment_objects,
            media_type=media_type,
            pexels_key=self.pexels_key,
            pixabay_key=self.pixabay_key,
            youtube_key=self.youtube_key,
            unsplash_key=self.unsplash_key,
        )
        
        # 统计信息
        stats = {
            "total_segments": len(results),
            "with_media": sum(1 for r in results if r.candidates),
            "with_error": sum(1 for r in results if r.search_error),
            "sources_used": [],
        }
        
        if self.pexels_key:
            stats["sources_used"].append("pexels")
        if self.pixabay_key:
            stats["sources_used"].append("pixabay")
        if self.youtube_key and media_type == "video":
            stats["sources_used"].append("youtube")
        if self.unsplash_key and media_type == "photo":
            stats["sources_used"].append("unsplash")
        
        return {
            "success": success,
            "segments_with_media": [r.model_dump() for r in results],
            "error": error,
            "stats": stats,
        }
    
    async def re_search_single(
        self,
        segment: dict,
        new_keyword: str,
        media_type: MediaType,
    ) -> dict:
        """
        重新搜索单个分段的素材（用于人工修改关键词后）
        """
        candidates, error = await search_media_for_segment(
            keyword=new_keyword,
            media_type=media_type,
            pexels_key=self.pexels_key,
            pixabay_key=self.pixabay_key,
            youtube_key=self.youtube_key,
            unsplash_key=self.unsplash_key,
        )
        
        return {
            "success": error is None or len(candidates) > 0,
            "segment_id": segment.get("id"),
            "keyword": new_keyword,
            "media_type": media_type,
            "candidates": [c.model_dump() for c in candidates],
            "error": error,
        }
