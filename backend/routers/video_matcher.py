from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import logging
import os
import tempfile
import subprocess
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


@router.get("/video-matcher/download/youtube/{video_id}")
async def download_youtube_video(video_id: str):
    """
    Download a YouTube video using yt-dlp.
    Returns the video file as a streaming response.
    """
    import asyncio
    from pathlib import Path

    youtube_url = f"https://www.youtube.com/watch?v={video_id}"

    # Check if yt-dlp is available
    try:
        result = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="yt-dlp is not installed or not working properly")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="yt-dlp is not installed. Please install it with: pip install yt-dlp"
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="yt-dlp check timed out")

    # Create temp directory for download
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        output_template = str(temp_path / "%(title)s_%(id)s.%(ext)s")

        try:
            # Run yt-dlp to download the video
            # Using best quality up to 1080p for reasonable file sizes
            cmd = [
                "yt-dlp",
                "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best",
                "--merge-output-format", "mp4",
                "-o", output_template,
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                # Options to bypass YouTube bot detection
                "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "--extractor-args", "youtube:player_client=web",
                "--extractor-args", "youtube:player_skip=webpage,configs,js",
                "--no-check-certificates",
                # Additional options to handle common errors
                "--retries", "3",
                "--fragment-retries", "3",
                "--skip-unavailable-fragments",
                youtube_url
            ]

            logger.info(f"Starting yt-dlp download for video: {video_id}")

            # Run yt-dlp in executor to not block the event loop
            loop = asyncio.get_event_loop()
            process = await loop.run_in_executor(
                None,
                lambda: subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            )

            if process.returncode != 0:
                logger.error(f"yt-dlp failed: {process.stderr}")
                error_msg = process.stderr or "Unknown error"
                
                # Provide user-friendly messages for common errors
                if "Sign in to confirm" in error_msg or "not a bot" in error_msg:
                    raise HTTPException(
                        status_code=500, 
                        detail="YouTube 检测到异常访问。请尝试以下方法：\n1. 在浏览器中登录 YouTube 账号后重试\n2. 或者使用 Pexels/Pixabay 的免费素材"
                    )
                elif "Video unavailable" in error_msg or "removed" in error_msg:
                    raise HTTPException(
                        status_code=404,
                        detail="该视频已被删除或无法访问"
                    )
                elif "Private video" in error_msg or "private" in error_msg.lower():
                    raise HTTPException(
                        status_code=403,
                        detail="该视频是私有的，无法下载"
                    )
                elif "copyright" in error_msg.lower() or "restricted" in error_msg.lower():
                    raise HTTPException(
                        status_code=403,
                        detail="该视频受版权保护，无法下载"
                    )
                elif "confirm your age" in error_msg.lower() or "age-restricted" in error_msg.lower():
                    raise HTTPException(
                        status_code=403,
                        detail="该视频有年龄限制，无法下载"
                    )
                elif "network" in error_msg.lower() or "connection" in error_msg.lower():
                    raise HTTPException(
                        status_code=503,
                        detail="网络连接问题，请稍后重试"
                    )
                else:
                    raise HTTPException(status_code=500, detail=f"下载失败: {error_msg[:200]}")

            # Find the downloaded file
            downloaded_files = list(temp_path.glob("*.mp4"))
            if not downloaded_files:
                # Check for other video formats
                downloaded_files = list(temp_path.glob("*.*"))
                video_files = [f for f in downloaded_files if f.suffix.lower() in ['.mp4', '.webm', '.mkv', '.mov']]
                if not video_files:
                    raise HTTPException(status_code=500, detail="Download completed but file not found")
                downloaded_files = video_files

            video_file = downloaded_files[0]
            filename = video_file.name

            logger.info(f"Successfully downloaded: {filename}")

            # Return the file as streaming response
            def iterfile():
                with open(video_file, "rb") as f:
                    yield from f

            return StreamingResponse(
                iterfile(),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Length": str(video_file.stat().st_size)
                }
            )

        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="下载超时（超过5分钟），请稍后重试")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error downloading YouTube video: {e}")
            raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")
