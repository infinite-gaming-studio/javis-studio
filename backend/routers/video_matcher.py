from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import os
import re
import tempfile
import subprocess
from urllib.parse import quote
from config import get_settings

from services.video_matcher import (
    match_videos, search_all_sources,
    SegmentMatch, VideoCandidate, VideoMatchResult,
    MediaCandidate, MediaType, search_youtube_video, search_unsplash_photo
)

router = APIRouter(prefix="/api/v1/tools", tags=["Tools"])
logger = logging.getLogger(__name__)

class VideoMatcherRequest(BaseModel):
    text: str
    media_type: str = "video"  # "video" or "photo"

class VideoMatcherResponse(BaseModel):
    matches: List[SegmentMatch]

@router.post("/video-matcher", response_model=VideoMatcherResponse)
async def video_matcher_api(
    req: VideoMatcherRequest,
    request: Request,
    x_llm_url: Optional[str] = Header(None),
    x_llm_token: Optional[str] = Header(None),
    x_llm_model: Optional[str] = Header(None),
    x_pexels_key: Optional[str] = Header(None),
    x_pixabay_key: Optional[str] = Header(None),
    x_youtube_key: Optional[str] = Header(None),
    x_unsplash_key: Optional[str] = Header(None),
):
    settings = get_settings()

    llm_url = x_llm_url or settings.openai_base_url
    llm_token = x_llm_token or settings.openai_api_key
    llm_model = x_llm_model or settings.openai_model
    pexels_key = x_pexels_key or settings.pexels_api_key
    pixabay_key = x_pixabay_key or settings.pixabay_api_key
    youtube_key = x_youtube_key or settings.youtube_api_key
    unsplash_key = x_unsplash_key or settings.unsplash_api_key

    logger.info(f"Video matcher called: pexels_key={'SET' if pexels_key else 'EMPTY'}, pixabay_key={'SET' if pixabay_key else 'EMPTY'}, youtube_key={'SET' if youtube_key else 'EMPTY'}, unsplash_key={'SET' if unsplash_key else 'EMPTY'}, media_type={req.media_type}")

    if not pexels_key and not pixabay_key and not youtube_key and not unsplash_key:
        raise HTTPException(
            status_code=400,
            detail="Missing video API keys. Please configure at least one of Pexels, Pixabay, YouTube, or Unsplash API Key in settings."
        )

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text payload cannot be empty.")

    # Validate LLM API Key
    if not llm_token or llm_token.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="Missing LLM API Key. Please configure your OpenAI API Key in settings (点击右上角设置图标)."
        )

    # Validate media_type
    if req.media_type not in ("video", "photo"):
        raise HTTPException(status_code=400, detail="media_type must be 'video' or 'photo'")

    # Note: YouTube only supports video, not photos
    if req.media_type == "photo" and youtube_key and not pexels_key and not pixabay_key and not unsplash_key:
        raise HTTPException(
            status_code=400,
            detail="YouTube API only supports video search. Please configure Pexels, Pixabay, or Unsplash API Key for photo search."
        )

    # Note: Unsplash only supports photos, not videos
    if req.media_type == "video" and unsplash_key and not pexels_key and not pixabay_key and not youtube_key:
        raise HTTPException(
            status_code=400,
            detail="Unsplash API only supports photo search. Please configure Pexels, Pixabay, or YouTube API Key for video search."
        )

    try:
        results = await match_videos(
            text=req.text,
            llm_url=llm_url,
            llm_token=llm_token,
            llm_model=llm_model,
            pexels_key=pexels_key,
            pixabay_key=pixabay_key,
            youtube_key=youtube_key,
            unsplash_key=unsplash_key,
            media_type=req.media_type,
        )
        return VideoMatcherResponse(matches=results)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in video matcher: {e}")
        error_msg = str(e)
        # Provide user-friendly error messages for common issues
        if "401" in error_msg or "Incorrect API key" in error_msg or "invalid_api_key" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="LLM API Key 无效或已过期。请在设置中检查您的 OpenAI API Key (点击右上角设置图标)。"
            )
        elif "429" in error_msg or "rate limit" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="API 调用过于频繁，请稍后再试。"
            )
        elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail="请求超时，请检查网络连接或稍后重试。"
            )
        else:
            raise HTTPException(status_code=500, detail=f"处理失败: {error_msg}")

class VideoSearchRequest(BaseModel):
    keyword: str
    segment: str
    media_type: str = "video"  # "video" or "photo"

class VideoSearchResponse(BaseModel):
    segment: str
    keyword: str
    media_type: str
    candidates: List[MediaCandidate]

@router.post("/video-matcher/search", response_model=VideoSearchResponse)
async def video_search_api(
    req: VideoSearchRequest,
    x_pexels_key: Optional[str] = Header(None),
    x_pixabay_key: Optional[str] = Header(None),
    x_youtube_key: Optional[str] = Header(None),
    x_unsplash_key: Optional[str] = Header(None),
):
    settings = get_settings()
    pexels_key = x_pexels_key or settings.pexels_api_key
    pixabay_key = x_pixabay_key or settings.pixabay_api_key
    youtube_key = x_youtube_key or settings.youtube_api_key
    unsplash_key = x_unsplash_key or settings.unsplash_api_key

    if not pexels_key and not pixabay_key and not youtube_key and not unsplash_key:
        raise HTTPException(
            status_code=400,
            detail="Missing video API keys. Please configure at least one of Pexels, Pixabay, YouTube, or Unsplash API Key in settings."
        )

    if not req.keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword cannot be empty.")

    # Validate media_type
    if req.media_type not in ("video", "photo"):
        raise HTTPException(status_code=400, detail="media_type must be 'video' or 'photo'")

    # Note: YouTube only supports video, not photos
    if req.media_type == "photo" and youtube_key and not pexels_key and not pixabay_key and not unsplash_key:
        raise HTTPException(
            status_code=400,
            detail="YouTube API only supports video search. Please configure Pexels, Pixabay, or Unsplash API Key for photo search."
        )

    # Note: Unsplash only supports photos, not videos
    if req.media_type == "video" and unsplash_key and not pexels_key and not pixabay_key and not youtube_key:
        raise HTTPException(
            status_code=400,
            detail="Unsplash API only supports photo search. Please configure Pexels, Pixabay, or YouTube API Key for video search."
        )

    try:
        candidates = await search_all_sources(req.keyword, pexels_key, pixabay_key, youtube_key, unsplash_key, req.media_type)
        if not candidates:
            raise HTTPException(status_code=404, detail=f"No {req.media_type} found for keyword: {req.keyword}")

        return VideoSearchResponse(
            segment=req.segment,
            keyword=req.keyword,
            media_type=req.media_type,
            candidates=candidates,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching {req.media_type} for keyword {req.keyword}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BatchDownloadRequest(BaseModel):
    """Request for batch media download and packaging."""
    project_name: str
    items: List[Dict[str, Any]]


@router.post("/video-matcher/download/batch")
async def batch_download_media(req: BatchDownloadRequest):
    """
    Download multiple media files and package them into a ZIP archive.
    Returns the ZIP file as a streaming response.
    """
    from services.download_packager import MediaItem, create_media_package
    import asyncio
    
    if not req.items:
        raise HTTPException(status_code=400, detail="No items to download")
    
    try:
        # Convert request items to MediaItem objects
        media_items = []
        for i, item_data in enumerate(req.items, 1):
            media_items.append(MediaItem(
                index=item_data.get("index", i),
                segment=item_data.get("segment", ""),
                keyword=item_data.get("keyword", ""),
                source=item_data.get("source", ""),
                media_type=item_data.get("media_type", "video"),
                media_url=item_data.get("media_url", ""),
                source_url=item_data.get("source_url", ""),
                media_id=str(item_data.get("media_id", ""))
            ))
        
        logger.info(f"Batch download requested for {len(media_items)} items")
        
        # Create the package
        zip_bytes, summary = await create_media_package(
            project_name=req.project_name,
            items=media_items,
            max_concurrent=5,
            timeout=60.0
        )
        
        if summary["successful_downloads"] == 0:
            raise HTTPException(
                status_code=500,
                detail="所有素材下载失败，请检查网络连接或重试"
            )
        
        # Sanitize project name for filename - use ASCII only for compatibility
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', req.project_name).strip('_')[:50]
        if not safe_name:
            safe_name = "media_package"

        filename = f"{safe_name}.zip"

        # Encode filename for Content-Disposition header (RFC 5987)
        # Use both filename (ASCII) and filename* (UTF-8) for compatibility
        encoded_filename = quote(req.project_name, safe='')
        content_disposition = f'attachment; filename="{filename}"; filename*=UTF-8\'{encoded_filename}.zip'

        # Return as streaming response
        def iterfile():
            yield zip_bytes

        logger.info(f"Returning ZIP package: {filename} ({len(zip_bytes)} bytes)")

        return StreamingResponse(
            iterfile(),
            media_type="application/zip",
            headers={
                "Content-Disposition": content_disposition,
                "Content-Length": str(len(zip_bytes)),
                "X-Download-Summary": str(summary).replace("'", '"')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch download: {e}")
        raise HTTPException(status_code=500, detail=f"打包下载失败: {str(e)[:200]}")


@router.get("/video-matcher/download/youtube/{video_id}/formats")
async def get_youtube_video_formats(video_id: str):
    """
    Get available quality formats for a YouTube video.
    Returns a list of available quality options.
    """
    import asyncio
    from services.ytdlp_service import get_video_formats
    
    try:
        formats = await asyncio.get_event_loop().run_in_executor(
            None, lambda: get_video_formats(video_id)
        )
        return {"video_id": video_id, "formats": formats}
    except Exception as e:
        logger.error(f"Failed to get video formats for {video_id}: {e}")
        # Return default options on error
        return {
            "video_id": video_id,
            "formats": [
                {"label": "高清 (1080p)", "value": "1080"},
                {"label": "高清 (720p)", "value": "720"},
                {"label": "标清 (480p)", "value": "480"},
                {"label": "流畅 (360p)", "value": "360"},
                {"label": "最佳质量", "value": "best"},
            ]
        }


@router.get("/video-matcher/download/youtube/{video_id}")
async def download_youtube_video(video_id: str, quality: str = "best"):
    """
    Download a YouTube video using yt-dlp (VideoLingo-compatible implementation).
    Returns the video file as a streaming response.
    
    Args:
        video_id: YouTube video ID
        quality: Video quality/resolution (360, 480, 720, 1080, 1440, 2160, best). Default: best
    """
    import asyncio
    from pathlib import Path
    from services.ytdlp_service import download_video, update_ytdlp, YTDLPError, get_cookies_path

    # Validate quality parameter
    valid_qualities = ["360", "480", "720", "1080", "1440", "2160", "best"]
    if quality not in valid_qualities:
        quality = "best"

    # Try to update yt-dlp first (like VideoLingo does)
    await asyncio.get_event_loop().run_in_executor(None, update_ytdlp)

    # Create temp directory for download (use mkdtemp to avoid auto-cleanup during streaming)
    temp_dir = tempfile.mkdtemp()
    try:
        # Check if cookies are configured
        cookies_path = get_cookies_path()
        if not cookies_path:
            logger.warning("No YouTube cookies configured. Download may fail due to bot detection.")
        
        # Download using VideoLingo-style implementation
        logger.info(f"Downloading YouTube video {video_id} with quality: {quality}")
        video_file_path = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: download_video(video_id, temp_dir, resolution=quality)
        )
        
        video_file = Path(video_file_path)
        filename = video_file.name

        logger.info(f"Successfully downloaded: {filename}")

        # Sanitize filename for Content-Disposition header (must be latin-1 compatible)
        # Replace full-width and special characters that are not allowed in HTTP headers
        import re
        safe_filename = re.sub(r'[^\x00-\x7F]', '_', filename)  # Replace non-ASCII chars
        safe_filename = re.sub(r'[<>"/\\|?*]', '_', safe_filename)  # Replace filesystem unsafe chars

        # Use FileResponse which properly handles cleanup after transfer
        return FileResponse(
            path=video_file,
            media_type="video/mp4",
            filename=safe_filename
        )

    except YTDLPError as e:
        logger.error(f"yt-dlp error ({e.error_type}): {e.message}")
        
        # Map YTDLPError to HTTP exceptions
        error_mapping = {
            "bot_detection": (
                503,
                "YouTube 检测到异常访问。解决方案（按推荐顺序）：\n\n"
                "1. 【推荐】优先使用 Pexels/Pixabay 的免费素材（无需登录，下载稳定）\n"
                "2. 在浏览器中登录 YouTube 账号后，导出 cookies 文件到项目目录\n"
                "3. 设置 YOUTUBE_COOKIES_PATH 环境变量指向 cookies 文件\n"
                "4. 使用家用网络/更换 IP 后重试"
            ),
            "unavailable": (404, "该视频已被删除或无法访问"),
            "private": (403, "该视频是私有的，无法下载"),
            "copyright": (403, "该视频受版权保护，无法下载"),
            "age_restricted": (403, "该视频有年龄限制，无法下载"),
            "network": (503, "网络连接问题，请稍后重试"),
            "no_formats": (404, "无法获取视频下载链接"),
        }
        
        status_code, detail = error_mapping.get(e.error_type, (500, f"下载失败: {e.message}"))
        raise HTTPException(status_code=status_code, detail=detail)
        
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="下载超时（超过5分钟），请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading YouTube video: {e}")
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)[:200]}")
