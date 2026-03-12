from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
import logging
from config import get_settings

from services.video_matcher import (
    match_videos, search_all_sources,
    SegmentMatch, VideoCandidate, VideoMatchResult,
    MediaCandidate, MediaType, search_youtube_video
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
):
    settings = get_settings()
    
    llm_url = x_llm_url or settings.openai_base_url
    llm_token = x_llm_token or settings.openai_api_key
    llm_model = x_llm_model or settings.openai_model
    pexels_key = x_pexels_key or settings.pexels_api_key
    pixabay_key = x_pixabay_key or settings.pixabay_api_key
    youtube_key = x_youtube_key or settings.youtube_api_key
    
    logger.info(f"Video matcher called: pexels_key={'SET' if pexels_key else 'EMPTY'}, pixabay_key={'SET' if pixabay_key else 'EMPTY'}, youtube_key={'SET' if youtube_key else 'EMPTY'}, media_type={req.media_type}")
    
    if not pexels_key and not pixabay_key and not youtube_key:
        raise HTTPException(
            status_code=400,
            detail="Missing video API keys. Please configure at least one of Pexels, Pixabay, or YouTube API Key in settings."
        )
        
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text payload cannot be empty.")
    
    # Validate media_type
    if req.media_type not in ("video", "photo"):
        raise HTTPException(status_code=400, detail="media_type must be 'video' or 'photo'")
    
    # Note: YouTube only supports video, not photos
    if req.media_type == "photo" and youtube_key and not pexels_key and not pixabay_key:
        raise HTTPException(
            status_code=400,
            detail="YouTube API only supports video search. Please configure Pexels or Pixabay API Key for photo search."
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
            media_type=req.media_type,
        )
        return VideoMatcherResponse(matches=results)
    except Exception as e:
        logger.error(f"Error in video matcher: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
):
    settings = get_settings()
    pexels_key = x_pexels_key or settings.pexels_api_key
    pixabay_key = x_pixabay_key or settings.pixabay_api_key
    youtube_key = x_youtube_key or settings.youtube_api_key
    
    if not pexels_key and not pixabay_key and not youtube_key:
        raise HTTPException(
            status_code=400,
            detail="Missing video API keys. Please configure at least one of Pexels, Pixabay, or YouTube API Key in settings."
        )
        
    if not req.keyword.strip():
        raise HTTPException(status_code=400, detail="Keyword cannot be empty.")
    
    # Validate media_type
    if req.media_type not in ("video", "photo"):
        raise HTTPException(status_code=400, detail="media_type must be 'video' or 'photo'")
    
    # Note: YouTube only supports video, not photos
    if req.media_type == "photo" and youtube_key and not pexels_key and not pixabay_key:
        raise HTTPException(
            status_code=400,
            detail="YouTube API only supports video search. Please configure Pexels or Pixabay API Key for photo search."
        )
        
    try:
        candidates = await search_all_sources(req.keyword, pexels_key, pixabay_key, youtube_key, req.media_type)
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
