import json
import logging
import asyncio
from typing import List, Dict, Any, Optional, Literal
from urllib.parse import quote_plus
from openai import AsyncOpenAI
import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

MediaType = Literal["video", "photo"]

class MediaCandidate(BaseModel):
    source: str          # "pexels", "pixabay", or "youtube"
    media_type: MediaType  # "video" or "photo"
    media_url: str       # video_url or photo_url (direct download/play URL)
    source_url: str      # Original source page URL (for attribution/linking)
    media_id: str        # Changed to str to support YouTube video IDs
    thumbnail_url: str
    duration: int = 0    # 0 for photos
    width: int = 0       # Default 0 since YouTube API doesn't provide dimensions directly
    height: int = 0

class VideoCandidate(BaseModel):
    source: str          # "pexels" or "pixabay"
    video_url: str
    video_id: int
    thumbnail_url: str
    duration: int
    width: int
    height: int
    source_url: str      # Original source page URL

class SegmentMatch(BaseModel):
    segment: str
    keyword: str
    media_type: MediaType = "video"  # default to video for backward compat
    candidates: List[MediaCandidate]
    error: Optional[str] = None  # Error message if search failed

# Keep backward-compat for the single-search endpoint
class VideoMatchResult(BaseModel):
    segment: str
    keyword: str
    source: str
    video_url: str
    video_id: int
    thumbnail_url: str
    duration: int
    width: int
    height: int

SYSTEM_PROMPT = """\
你是一个视频配图专家。用户会提供一段视频解说文案/逐字稿，请将文案按照语义拆分成多个端句（每句约10-30个字）。
对于每个短句，提取出一个高度相关的英文搜索关键词（适用于在 Pexels 素材网站上搜索视频）。

输出要求：
1. 必须输出合格的 JSON 数组。
2. 每个元素包含两个字段：
   - "segment": 拆分出的一段文案
   - "keyword": 对应的搜索关键词（仅限英文，只输出 1~3 个英文单词，不要带其他符号）
3. 返回的内容只能是 JSON，不要包含任何前后缀、说明或 Markdown 标记。

示例：
[
  {"segment": "今天我们来看一段奇妙的海底世界。", "keyword": "underwater ocean"},
  {"segment": "五颜六色的珊瑚礁中，游动着一群海龟。", "keyword": "sea turtle coral"}
]
"""

def normalize_llm_url(url: str) -> str:
    """Normalize LLM API URL - remove /chat/completions suffix if present."""
    if not url:
        return "https://api.openai.com/v1"
    url = url.strip()
    # Remove trailing slashes
    url = url.rstrip("/")
    # Remove /chat/completions suffix (OpenAI client adds this automatically)
    # Check longer pattern first to handle /v1/chat/completions correctly
    if url.endswith("/v1/chat/completions"):
        url = url[:-len("/chat/completions")]
    elif url.endswith("/chat/completions"):
        url = url[:-len("/chat/completions")]
    logger.info(f"Normalized LLM URL: {url}")
    return url

async def extract_keywords(
    text: str,
    llm_url: str,
    llm_token: str,
    llm_model: str,
) -> List[Dict[str, str]]:
    base_url = normalize_llm_url(llm_url)
    logger.info(f"Using LLM URL: {base_url}")
    client = AsyncOpenAI(api_key=llm_token, base_url=base_url)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]

    resp = await client.chat.completions.create(
        model=llm_model or "gpt-3.5-turbo",
        messages=messages,
        temperature=0.7,
        max_tokens=1024,
    )
    raw = resp.choices[0].message.content or "[]"
    
    # Strip markdown if any
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        elif "\n" in raw:
            pass
        if raw.endswith("```"):
            raw = raw[:-3]
    
    try:
        data = json.loads(raw.strip())
        return data
    except Exception as e:
        logger.error(f"Failed to parse LLM output: {raw}")
        raise e

# ─── Pexels ────────────────────────────────────────────────────────────────────

async def search_pexels_video(
    keyword: str,
    pexels_key: str,
) -> Optional[VideoCandidate]:
    if not pexels_key:
        return None
        
    url = f"https://api.pexels.com/videos/search?query={keyword}&per_page=1&orientation=landscape"
    headers = {"Authorization": pexels_key}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            videos = data.get("videos", [])
            if videos:
                video = videos[0]
                video_files = video.get("video_files", [])
                hd_files = [f for f in video_files if f.get("quality") in ("hd", "uhd")]
                best_file = hd_files[0] if hd_files else (video_files[0] if video_files else None)
                if not best_file:
                    return None
                    
                video_id = video.get("id", 0)
                return VideoCandidate(
                    source="pexels",
                    video_id=video_id,
                    video_url=best_file.get("link", ""),
                    thumbnail_url=video.get("image", ""),
                    duration=video.get("duration", 0),
                    width=best_file.get("width", 0),
                    height=best_file.get("height", 0),
                    source_url=f"https://www.pexels.com/video/{video_id}/",
                )
        except Exception as e:
            logger.error(f"Pexels API error for keyword '{keyword}': {e}")
    return None

# ─── Pixabay ───────────────────────────────────────────────────────────────────

async def search_pixabay_video(
    keyword: str,
    pixabay_key: str,
) -> Optional[VideoCandidate]:
    if not pixabay_key:
        return None
    
    encoded_kw = quote_plus(keyword)
    url = f"https://pixabay.com/api/videos/?key={pixabay_key}&q={encoded_kw}&per_page=3"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            hits = data.get("hits", [])
            logger.info(f"Pixabay search '{keyword}': {len(hits)} hits")
            if hits:
                video = hits[0]
                videos_dict = video.get("videos", {})
                # Prefer large > medium > small, but skip entries with empty URL
                best = None
                for quality in ("large", "medium", "small", "tiny"):
                    entry = videos_dict.get(quality, {})
                    if entry.get("url"):
                        best = entry
                        break
                
                if not best:
                    logger.warning(f"Pixabay: no valid video URL found for '{keyword}'")
                    return None
                    
                # Pixabay thumbnail: use the thumbnail from medium or small
                thumb = ""
                for q in ("medium", "small", "tiny"):
                    t = videos_dict.get(q, {}).get("thumbnail", "")
                    if t:
                        thumb = t
                        break
                
                video_id = video.get("id", 0)
                return VideoCandidate(
                    source="pixabay",
                    video_id=video_id,
                    video_url=best.get("url", ""),
                    thumbnail_url=thumb,
                    duration=video.get("duration", 0),
                    width=best.get("width", 0),
                    height=best.get("height", 0),
                    source_url=f"https://pixabay.com/videos/id-{video_id}/",
                )
            else:
                logger.info(f"Pixabay: no hits for '{keyword}'")
        except Exception as e:
            logger.error(f"Pixabay API error for keyword '{keyword}': {e}")
    return None

# ─── Pexels Photos ───────────────────────────────────────────────────────────

async def search_pexels_photo(
    keyword: str,
    pexels_key: str,
) -> Optional[MediaCandidate]:
    if not pexels_key:
        return None
        
    url = f"https://api.pexels.com/v1/search?query={keyword}&per_page=1&orientation=landscape"
    headers = {"Authorization": pexels_key}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            photos = data.get("photos", [])
            if photos:
                photo = photos[0]
                src = photo.get("src", {})
                # Prefer landscape or large size
                photo_url = src.get("landscape") or src.get("large") or src.get("original", "")
                photo_id = photo.get("id", 0)
                return MediaCandidate(
                    source="pexels",
                    media_type="photo",
                    media_id=str(photo_id),
                    media_url=photo_url,
                    source_url=f"https://www.pexels.com/photo/{photo_id}/",
                    thumbnail_url=src.get("medium") or src.get("small", ""),
                    duration=0,
                    width=photo.get("width", 0),
                    height=photo.get("height", 0),
                )
        except Exception as e:
            logger.error(f"Pexels photo API error for keyword '{keyword}': {e}")
    return None

# ─── Pixabay Photos ──────────────────────────────────────────────────────────

async def search_pixabay_photo(
    keyword: str,
    pixabay_key: str,
) -> Optional[MediaCandidate]:
    if not pixabay_key:
        return None

    encoded_kw = quote_plus(keyword)
    url = f"https://pixabay.com/api/?key={pixabay_key}&q={encoded_kw}&per_page=3&image_type=photo&orientation=horizontal"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            hits = data.get("hits", [])
            logger.info(f"Pixabay photo search '{keyword}': {len(hits)} hits")
            if hits:
                photo = hits[0]
                photo_id = photo.get("id", 0)
                return MediaCandidate(
                    source="pixabay",
                    media_type="photo",
                    media_id=str(photo_id),
                    media_url=photo.get("largeImageURL") or photo.get("webformatURL", ""),
                    source_url=f"https://pixabay.com/photos/id-{photo_id}/",
                    thumbnail_url=photo.get("previewURL") or photo.get("webformatURL", ""),
                    duration=0,
                    width=photo.get("imageWidth", 0),
                    height=photo.get("imageHeight", 0),
                )
            else:
                logger.info(f"Pixabay photo: no hits for '{keyword}'")
        except Exception as e:
            logger.error(f"Pixabay photo API error for keyword '{keyword}': {e}")
    return None

# ─── Unsplash Photos ─────────────────────────────────────────────────────────

async def search_unsplash_photo(
    keyword: str,
    unsplash_key: str,
) -> Optional[MediaCandidate]:
    """Search Unsplash photos using Unsplash API."""
    if not unsplash_key:
        return None

    encoded_kw = quote_plus(keyword)
    url = f"https://api.unsplash.com/search/photos?query={encoded_kw}&per_page=1&orientation=landscape"
    headers = {"Authorization": f"Client-ID {unsplash_key}"}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            logger.info(f"Unsplash photo search '{keyword}': {len(results)} results")
            if results:
                photo = results[0]
                photo_id = photo.get("id", "")
                urls = photo.get("urls", {})
                # Prefer regular size for media_url, small for thumbnail
                photo_url = urls.get("regular") or urls.get("small") or urls.get("full", "")
                thumb_url = urls.get("small") or urls.get("thumb") or urls.get("regular", "")
                width = photo.get("width", 0)
                height = photo.get("height", 0)

                return MediaCandidate(
                    source="unsplash",
                    media_type="photo",
                    media_id=str(photo_id),
                    media_url=photo_url,
                    source_url=photo.get("links", {}).get("html", f"https://unsplash.com/photos/{photo_id}"),
                    thumbnail_url=thumb_url,
                    duration=0,
                    width=width,
                    height=height,
                )
            else:
                logger.info(f"Unsplash: no results for '{keyword}'")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                logger.error(f"Unsplash API error for keyword '{keyword}': Rate limit exceeded or invalid Access Key")
            else:
                logger.error(f"Unsplash API error for keyword '{keyword}': {e}")
        except Exception as e:
            logger.error(f"Unsplash API error for keyword '{keyword}': {e}")
    return None

# ─── Video to MediaCandidate converters ──────────────────────────────────────

def video_to_media_candidate(video: VideoCandidate) -> MediaCandidate:
    return MediaCandidate(
        source=video.source,
        media_type="video",
        media_url=video.video_url,
        source_url=video.source_url,
        media_id=str(video.video_id),
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        width=video.width,
        height=video.height,
    )

# ─── YouTube ───────────────────────────────────────────────────────────────────

async def search_youtube_video(
    keyword: str,
    youtube_key: str,
) -> Optional[MediaCandidate]:
    """Search YouTube videos using YouTube Data API v3."""
    if not youtube_key:
        return None
    
    # YouTube Data API v3 search endpoint
    # Using videoEmbeddable=true to ensure videos can be embedded
    # Using videoLicense=creativeCommon to only return CC-licensed videos (remix-friendly)
    url = (
        f"https://www.googleapis.com/youtube/v3/search"
        f"?part=snippet"
        f"&q={quote_plus(keyword)}"
        f"&type=video"
        f"&videoEmbeddable=true"
        f"&videoLicense=creativeCommon"
        f"&maxResults=1"
        f"&key={youtube_key}"
    )
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            
            items = data.get("items", [])
            if not items:
                logger.info(f"YouTube: no results for '{keyword}'")
                return None
            
            video = items[0]
            snippet = video.get("snippet", {})
            video_id = video.get("id", {}).get("videoId", "")
            
            if not video_id:
                return None
            
            # Get thumbnail (prefer high quality)
            thumbnails = snippet.get("thumbnails", {})
            thumbnail_url = (
                thumbnails.get("high", {}).get("url", "")
                or thumbnails.get("medium", {}).get("url", "")
                or thumbnails.get("default", {}).get("url", "")
            )
            
            # Construct YouTube embed URL (for preview) and watch URL
            # Using embed URL as media_url since it's more useful for preview
            embed_url = f"https://www.youtube.com/embed/{video_id}"
            watch_url = f"https://www.youtube.com/watch?v={video_id}"
            
            return MediaCandidate(
                source="youtube",
                media_type="video",
                media_url=embed_url,  # Embed URL for preview
                source_url=watch_url,  # Original YouTube page for attribution
                media_id=video_id,
                thumbnail_url=thumbnail_url,
                duration=0,  # YouTube search API doesn't return duration, would need additional call
                width=0,     # Not provided by search API
                height=0,    # Not provided by search API
            )
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                logger.error(f"YouTube API error for keyword '{keyword}': Quota exceeded or invalid API key")
            else:
                logger.error(f"YouTube API error for keyword '{keyword}': {e}")
        except Exception as e:
            logger.error(f"YouTube API error for keyword '{keyword}': {e}")
    
    return None

# ─── Combined search ──────────────────────────────────────────────────────────

async def search_all_sources(
    keyword: str,
    pexels_key: str,
    pixabay_key: str,
    youtube_key: str = "",
    unsplash_key: str = "",
    media_type: MediaType = "video",
) -> List[MediaCandidate]:
    """Search Pexels, Pixabay, YouTube, and Unsplash concurrently and return all found candidates."""
    tasks = []
    if media_type == "video":
        if pexels_key:
            tasks.append(search_pexels_video(keyword, pexels_key))
        if pixabay_key:
            tasks.append(search_pixabay_video(keyword, pixabay_key))
        if youtube_key:
            tasks.append(search_youtube_video(keyword, youtube_key))
        # Unsplash doesn't support videos
    else:  # photo
        if pexels_key:
            tasks.append(search_pexels_photo(keyword, pexels_key))
        if pixabay_key:
            tasks.append(search_pixabay_photo(keyword, pixabay_key))
        if unsplash_key:
            tasks.append(search_unsplash_photo(keyword, unsplash_key))
        # YouTube doesn't support photos

    if not tasks:
        return []

    results = await asyncio.gather(*tasks)
    if media_type == "video":
        # Convert VideoCandidate to MediaCandidate for pexels/pixabay
        candidates = []
        for r in results:
            if r is not None:
                if isinstance(r, VideoCandidate):
                    candidates.append(video_to_media_candidate(r))
                else:
                    candidates.append(r)  # Already MediaCandidate (from YouTube)
        return candidates
    else:
        return [r for r in results if r is not None]

async def match_videos(
    text: str,
    llm_url: str,
    llm_token: str,
    llm_model: str,
    pexels_key: str,
    pixabay_key: str = "",
    youtube_key: str = "",
    unsplash_key: str = "",
    media_type: MediaType = "video",
) -> List[SegmentMatch]:
    # 1. Extract keywords via LLM
    logger.info(f"Starting match_videos with media_type={media_type}, keys: pexels={'SET' if pexels_key else 'NO'}, pixabay={'SET' if pixabay_key else 'NO'}, youtube={'SET' if youtube_key else 'NO'}, unsplash={'SET' if unsplash_key else 'NO'}")
    
    segments_data = await extract_keywords(text, llm_url, llm_token, llm_model)
    logger.info(f"LLM extracted {len(segments_data)} segments")
    
    if not segments_data:
        logger.warning("No segments extracted from text")
        return []

    # 2. Search all sources concurrently for each segment
    async def process_segment(item: Dict[str, str]) -> SegmentMatch:
        segment = item.get("segment", "")
        keyword = item.get("keyword", "")
        logger.info(f"Processing segment: '{segment[:30]}...' with keyword: '{keyword}'")
        
        if not segment or not keyword:
            error_msg = "无法提取关键词" if not keyword else "片段内容为空"
            logger.warning(f"Segment processing failed: {error_msg}")
            return SegmentMatch(
                segment=segment or "(empty)",
                keyword=keyword or "(none)",
                media_type=media_type,
                candidates=[],
                error=error_msg
            )

        candidates = await search_all_sources(keyword, pexels_key, pixabay_key, youtube_key, unsplash_key, media_type)
        logger.info(f"Search for keyword '{keyword}' returned {len(candidates)} candidates")
        
        if not candidates:
            # Return segment with error instead of discarding it
            error_msg = f"未找到匹配的{('视频' if media_type == 'video' else '图片')}素材，请尝试修改关键词"
            logger.warning(f"No candidates found for keyword '{keyword}' - returning error segment")
            return SegmentMatch(
                segment=segment,
                keyword=keyword,
                media_type=media_type,
                candidates=[],
                error=error_msg
            )

        return SegmentMatch(
            segment=segment,
            keyword=keyword,
            media_type=media_type,
            candidates=candidates,
        )

    tasks = [process_segment(item) for item in segments_data]
    matched_results = await asyncio.gather(*tasks)

    logger.info(f"Total segments returned: {len(matched_results)} out of {len(segments_data)} segments")
    
    return matched_results
