"""
Video Matcher Workflow Router - Human-in-the-loop API

基于第一性原理设计的三步工作流 API：
1. POST /workflow/step1 - AI 分段+提取关键词
2. POST /workflow/step2 - AI 搜索素材（基于人工确认后的关键词）
3. POST /workflow/research - 重新搜索单个分段

优势：
- 每一步都可独立调试
- 错误可精准定位
- 支持人工干预
"""

import logging
from typing import List, Optional, Literal
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services.video_matcher_workflow import (
    VideoMatcherWorkflow,
    MediaType,
    SegmentData,
    SegmentWithMedia,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workflow", tags=["video-matcher-workflow"])

# ═══════════════════════════════════════════════════════════════════════════════
# 请求/响应模型
# ═══════════════════════════════════════════════════════════════════════════════

class Step1Request(BaseModel):
    """Step 1 请求：分段和关键词提取"""
    text: str

class Step1Response(BaseModel):
    """Step 1 响应"""
    success: bool
    segments: List[dict] = []
    error: Optional[str] = None
    debug_info: dict = {}

class Step2Request(BaseModel):
    """Step 2 请求：搜索素材"""
    segments: List[dict]  # 前端确认后的分段（包含 user_keyword）
    media_type: MediaType = "video"

class Step2Response(BaseModel):
    """Step 2 响应"""
    success: bool
    segments_with_media: List[dict] = []
    error: Optional[str] = None
    stats: dict = {}

class ReSearchRequest(BaseModel):
    """重新搜索请求"""
    segment: dict
    new_keyword: str
    media_type: MediaType = "video"

class ReSearchResponse(BaseModel):
    """重新搜索响应"""
    success: bool
    segment_id: str
    keyword: str
    media_type: MediaType
    candidates: List[dict] = []
    error: Optional[str] = None

# ═══════════════════════════════════════════════════════════════════════════════
# API Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/step1", response_model=Step1Response)
async def workflow_step1(
    req: Step1Request,
    x_llm_url: str = Header(...),
    x_llm_token: str = Header(...),
    x_llm_model: str = Header(default="gpt-3.5-turbo"),
):
    """
    Step 1: AI 分段 + 关键词提取
    
    输入：原始字幕文本
    输出：分段列表（包含 AI 提取的关键词）
    
    前端展示这些分段，让用户确认或修改关键词
    """
    logger.info(f"Workflow Step 1: text length={len(req.text)}")
    
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")
    
    workflow = VideoMatcherWorkflow(
        llm_url=x_llm_url,
        llm_token=x_llm_token,
        llm_model=x_llm_model,
    )
    
    result = await workflow.step1_segment(req.text)
    
    if not result["success"]:
        logger.error(f"Step 1 failed: {result.get('error')}")
        # 仍然返回 200，让前端处理错误
    
    return Step1Response(**result)


@router.post("/step2", response_model=Step2Response)
async def workflow_step2(
    req: Step2Request,
    x_pexels_key: str = Header(default=""),
    x_pixabay_key: str = Header(default=""),
    x_youtube_key: str = Header(default=""),
    x_unsplash_key: str = Header(default=""),
):
    """
    Step 2: 搜索素材
    
    输入：用户确认后的分段列表（包含可能修改过的关键词）
    输出：每个分段对应的素材候选
    
    前端展示素材候选，让用户选择最终使用的素材
    """
    logger.info(f"Workflow Step 2: {len(req.segments)} segments, type={req.media_type}")
    
    if not req.segments:
        raise HTTPException(status_code=400, detail="分段列表不能为空")
    
    # 检查至少有一个 API Key
    if not any([x_pexels_key, x_pixabay_key, x_youtube_key, x_unsplash_key]):
        raise HTTPException(status_code=400, detail="请至少配置一个素材源 API Key")
    
    workflow = VideoMatcherWorkflow(
        llm_url="",  # Step 2 不需要 LLM
        llm_token="",
        llm_model="",
        pexels_key=x_pexels_key,
        pixabay_key=x_pixabay_key,
        youtube_key=x_youtube_key,
        unsplash_key=x_unsplash_key,
    )
    
    result = await workflow.step2_search(
        segments=req.segments,
        media_type=req.media_type,
    )
    
    return Step2Response(**result)


@router.post("/research", response_model=ReSearchResponse)
async def workflow_research(
    req: ReSearchRequest,
    x_pexels_key: str = Header(default=""),
    x_pixabay_key: str = Header(default=""),
    x_youtube_key: str = Header(default=""),
    x_unsplash_key: str = Header(default=""),
):
    """
    重新搜索单个分段的素材
    
    用于用户在 Step 2 后修改某个关键词，需要重新搜索素材的场景
    """
    logger.info(f"Re-search: segment_id={req.segment.get('id')}, keyword={req.new_keyword}")
    
    workflow = VideoMatcherWorkflow(
        llm_url="",
        llm_token="",
        llm_model="",
        pexels_key=x_pexels_key,
        pixabay_key=x_pixabay_key,
        youtube_key=x_youtube_key,
        unsplash_key=x_unsplash_key,
    )
    
    result = await workflow.re_search_single(
        segment=req.segment,
        new_keyword=req.new_keyword,
        media_type=req.media_type,
    )
    
    return ReSearchResponse(**result)


# ═══════════════════════════════════════════════════════════════════════════════
# 调试/健康检查
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health")
async def workflow_health():
    """工作流健康检查"""
    return {
        "status": "ok",
        "workflow": "human-in-the-loop",
        "steps": ["step1", "step2", "research"],
    }
