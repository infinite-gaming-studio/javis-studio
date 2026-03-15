from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import os
import re
import tempfile
import asyncio
from pathlib import Path
from urllib.parse import quote
from config import get_settings

from services.video_matcher import (
    match_videos, search_all_sources,
    SegmentMatch, VideoCandidate, VideoMatchResult,
    MediaCandidate, MediaType, search_youtube_video, search_unsplash_photo
)
from services.task_service import task_manager
from services.ytdlp_service import download_video, update_ytdlp
from services.download_packager import MediaItem, create_media_package

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

    logger.info(f"Video matcher called: media_type={req.media_type}")

    if not pexels_key and not pixabay_key and not youtube_key and not unsplash_key:
        raise HTTPException(
            status_code=400,
            detail="Missing video API keys. Please configure at least one of Pexels, Pixabay, YouTube, or Unsplash API Key in settings."
        )

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text payload cannot be empty.")

    if not llm_token or llm_token.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="Missing LLM API Key. Please configure your OpenAI API Key in settings."
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
        raise HTTPException(status_code=500, detail=str(e))

class VideoSearchRequest(BaseModel):
    keyword: str
    segment: str
    media_type: str = "video"

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

    try:
        candidates = await search_all_sources(req.keyword, pexels_key, pixabay_key, youtube_key, unsplash_key, req.media_type)
        return VideoSearchResponse(
            segment=req.segment,
            keyword=req.keyword,
            media_type=req.media_type,
            candidates=candidates,
        )
    except Exception as e:
        logger.error(f"Error searching {req.media_type} for keyword {req.keyword}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class BatchDownloadRequest(BaseModel):
    project_name: str
    items: List[Dict[str, Any]]

@router.post("/video-matcher/download/batch")
async def batch_download_media(req: BatchDownloadRequest, background_tasks: BackgroundTasks):
    if not req.items:
        raise HTTPException(status_code=400, detail="No items to download")
    
    task_id = task_manager.create_task(f"Batch Download: {req.project_name}")
    
    async def run_batch_download():
        try:
            task_manager.update_task(task_id, status="running", message="Downloading and packaging media...")
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
            
            zip_bytes, summary = await create_media_package(
                project_name=req.project_name,
                items=media_items,
                max_concurrent=5,
                timeout=300.0
            )
            
            if summary["successful_downloads"] == 0:
                task_manager.update_task(task_id, status="failed", message="所有素材下载失败，请检查网络连接或重试")
                return

            # Save the ZIP to a temporary file
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix=".zip") as temp_zip:
                temp_zip.write(zip_bytes)
                temp_file_path = temp_zip.name
            
            task_manager.update_task(task_id, status="completed", message="Packaging complete", result_path=temp_file_path)
            logger.info(f"Task {task_id} completed: {temp_file_path}")

        except Exception as e:
            logger.error(f"Error in background batch download: {e}")
            task_manager.update_task(task_id, status="failed", message=str(e))

    background_tasks.add_task(run_batch_download)
    return {"task_id": task_id}

@router.get("/video-matcher/download/youtube/{video_id}")
async def download_youtube_video(video_id: str, background_tasks: BackgroundTasks, quality: str = "best"):
    task_id = task_manager.create_task(f"YouTube Download: {video_id}")

    async def run_youtube_download():
        try:
            task_manager.update_task(task_id, status="running", message="Updating yt-dlp and starting download...")
            await asyncio.get_event_loop().run_in_executor(None, update_ytdlp)

            temp_dir = tempfile.mkdtemp()
            # Wrap lambda to avoid closure issues if needed, but video_id is stable here
            f = lambda: download_video(video_id, temp_dir, resolution=quality)
            video_file_path = await asyncio.get_event_loop().run_in_executor(None, f)
            
            task_manager.update_task(task_id, status="completed", message="Download complete", result_path=video_file_path)
            logger.info(f"Task {task_id} completed: {video_file_path}")

        except Exception as e:
            logger.error(f"Error in background YouTube download: {e}")
            task_manager.update_task(task_id, status="failed", message=str(e))

    background_tasks.add_task(run_youtube_download)
    return {"task_id": task_id}

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.get("/tasks/{task_id}/download")
async def fetch_task_result(task_id: str):
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status != "completed" or not task.result_path:
        raise HTTPException(status_code=400, detail="Task result not ready")
    
    file_path = Path(task.result_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Result file not found")
    
    return FileResponse(path=file_path, filename=file_path.name)
