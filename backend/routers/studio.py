import asyncio
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from config import get_settings
from models.schemas import (
    StudioRequest,
    StudioGenerateResponse,
    ScriptOnlyRequest,
    ScriptOnlyResponse,
    TTSSingleRequest,
    TTSSingleResponse,
    AudioSegmentResult,
    VoiceSettings,
    ScriptSegment,
)
from services import llm_service, tts_service, audio_service
from services import render_video_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/studio", tags=["studio"])


def _audio_url(filename: str) -> str:
    """Build public URL for a stored audio file."""
    return f"/api/studio/audio/{filename}"


@router.post("/generate", response_model=StudioGenerateResponse)
async def generate_full(req: StudioRequest):
    """
    Full pipeline: images + prompt → LLM script → TTS per segment → optional concat.
    """
    storage = Path(settings.storage_dir)
    session_id = uuid.uuid4().hex
    session_dir = str(storage / session_id)
    os.makedirs(session_dir, exist_ok=True)

    # 1. Generate (or use override) script
    if req.override_script:
        script = req.override_script
    else:
        try:
            script = await llm_service.generate_script(req.images, req.prompt)
        except Exception as e:
            logger.exception("LLM generation failed")
            raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # 2. TTS per segment (concurrently)
    async def synth_segment(seg: ScriptSegment) -> AudioSegmentResult:
        fname = f"seg_{seg.index:03d}.wav"
        try:
            # Apply segment-specific custom emotion overrides
            seg_vs = req.voice_settings.model_copy()
            if seg.emo_mode is not None:
                seg_vs.emotion_mode = seg.emo_mode
            if seg.emo_alpha is not None:
                seg_vs.emo_alpha = seg.emo_alpha
            if seg.emo_vector is not None:
                seg_vs.emo_vector = seg.emo_vector
            if seg.emo_text is not None:
                seg_vs.emo_text = seg.emo_text

            out = await tts_service.synthesize(
                text=seg.text,
                voice_settings=seg_vs,
                output_dir=session_dir,
                filename=fname,
                emotion_hint=seg.emotion_hint,
            )
            duration = audio_service.get_audio_duration(out)
            return AudioSegmentResult(
                segment_index=seg.index,
                text=seg.text,
                audio_url=_audio_url(f"{session_id}/{fname}"),
                duration_secs=duration,
            )
        except Exception as e:
            logger.exception("TTS failed for segment %d", seg.index)
            raise HTTPException(status_code=502, detail=f"TTS error on segment {seg.index}: {e}")

    segment_results = await asyncio.gather(*[synth_segment(s) for s in script])
    segment_results = sorted(segment_results, key=lambda x: x.segment_index)

    # 3. Concatenate
    final_audio_url = None
    if req.concat_final:
        ordered_paths = [
            str(Path(session_dir) / f"seg_{r.segment_index:03d}.wav")
            for r in segment_results
        ]
        try:
            final_path = audio_service.concatenate_segments(
                ordered_paths, session_dir, output_filename="final"
            )
            final_fname = Path(final_path).name
            final_audio_url = _audio_url(f"{session_id}/{final_fname}")
        except Exception as e:
            logger.exception("Audio concatenation failed")
            raise HTTPException(status_code=500, detail=f"Audio concat error: {e}")

    return StudioGenerateResponse(
        script=script,
        segments=segment_results,
        final_audio_url=final_audio_url,
    )


@router.post("/script", response_model=ScriptOnlyResponse)
async def generate_script_only(req: ScriptOnlyRequest):
    """Generate narration script from images + prompt (no TTS)."""
    try:
        script = await llm_service.generate_script(req.images, req.prompt, req.language)
    except Exception as e:
        logger.exception("LLM generation failed")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return ScriptOnlyResponse(script=script)


@router.post("/tts", response_model=TTSSingleResponse)
async def tts_single(req: TTSSingleRequest):
    """Synthesize TTS for a single text segment."""
    storage = Path(settings.storage_dir) / "single"
    fname = f"{uuid.uuid4().hex}.wav"
    try:
        out = await tts_service.synthesize(
            text=req.text,
            voice_settings=req.voice_settings,
            output_dir=str(storage),
            filename=fname,
        )
        duration = audio_service.get_audio_duration(out)
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    return TTSSingleResponse(
        audio_url=_audio_url(f"single/{fname}"),
        duration_secs=duration,
    )


@router.get("/audio/{session_id}/{filename}")
async def serve_audio(session_id: str, filename: str):
    """Serve a generated audio file."""
    audio_path = Path(settings.storage_dir) / session_id / filename
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    media_type = "audio/mpeg" if filename.endswith(".mp3") else "audio/wav"
    return FileResponse(str(audio_path), media_type=media_type)

import subprocess

@router.post("/video/convert")
async def convert_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Convert WebM video to MP4 using ffmpeg."""
    if not file.filename.endswith(".webm"):
        raise HTTPException(status_code=400, detail="Only .webm files are supported")

    # Create temporary directory for the conversion
    temp_dir = tempfile.mkdtemp()
    input_path = os.path.join(temp_dir, "input.webm")
    output_path = os.path.join(temp_dir, "output.mp4")

    try:
        # Save uploaded file
        content = await file.read()
        with open(input_path, "wb") as f:
            f.write(content)

        # Run ffmpeg conversion
        # Use simple copy if possible, but libx264 ensures maximum compatibility for browser-recorded WebMs
        cmd = [
            render_video_service.FFMPEG_BIN,
            "-y",
            "-i", input_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        process = subprocess.run(cmd, capture_output=True, text=True)
        if process.returncode != 0:
            logger.error(f"FFmpeg conversion failed: {process.stderr}")
            raise HTTPException(status_code=500, detail="Video conversion failed")

        # Cleanup background task
        def cleanup(dir_path):
            import shutil
            try:
                shutil.rmtree(dir_path)
            except Exception as e:
                logger.error(f"Error cleaning up {dir_path}: {e}")

        background_tasks.add_task(cleanup, temp_dir)

        return FileResponse(
            path=output_path,
            media_type="video/mp4",
            filename=file.filename.replace(".webm", ".mp4")
        )

    except Exception as e:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.exception("Video conversion error")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models for video rendering requests
# ─────────────────────────────────────────────────────────────────────────────

class AudioClipInfo(BaseModel):
    """A single audio clip belonging to one page."""
    audio_url: str        # e.g. "/api/studio/audio/single/abc.wav"
    duration_secs: Optional[float] = None


class PageRenderRequest(BaseModel):
    """Request body for rendering a single page's video."""
    page_index: int
    page_title: Optional[str] = None
    image: str            # base64 data-URI  OR  http URL
    clips: List[AudioClipInfo]


class ProjectRenderRequest(BaseModel):
    """Request body for rendering ALL pages and merging into one video."""
    project_name: Optional[str] = "Javis_Studio_Project"
    pages: List[PageRenderRequest]
    merge: bool = True    # if False, returns a ZIP of per-page MP4s


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_audio_path(audio_url_str: str) -> str:
    """
    Convert a frontend audio_url like "/audio/tts_abc.wav"
    to an absolute filesystem path.
    """
    if audio_url_str.startswith("/audio/"):
        # This is a frontend-saved audio file
        frontend_dir = Path(__file__).parent.parent.parent / "frontend" / "public"
        rel_path = audio_url_str.lstrip("/")
        return str(frontend_dir / rel_path)

    # Legacy support if anything was saved to backend storage directly
    prefix = "/api/studio/audio/"
    if audio_url_str.startswith(prefix):
        storage = Path(settings.storage_dir)
        rel = audio_url_str[len(prefix):]
        return str(storage / rel)
        
    return audio_url_str


async def _render_one_page(
    page: PageRenderRequest,
    work_dir: str,
) -> str:
    """Render a single page to MP4 inside *work_dir*. Returns the mp4 path."""
    label = f"page{page.page_index + 1:02d}"
    audio_paths = [_resolve_audio_path(c.audio_url) for c in page.clips]

    # Validate audio files exist
    for p in audio_paths:
        if not Path(p).exists():
            raise HTTPException(
                status_code=404,
                detail=f"Audio file not found: {p}"
            )

    out_path = os.path.join(work_dir, f"{label}.mp4")
    await render_video_service.async_render_page_mp4(
        image_src=page.image,
        audio_paths=audio_paths,
        output_path=out_path,
        work_dir=work_dir,
        page_label=label,
    )
    return out_path


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint: render a SINGLE page to MP4
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/render-video/page")
async def render_page_video(
    req: PageRenderRequest,
    background_tasks: BackgroundTasks,
):
    """
    Render one PPT page (image + audio clips) to a high-quality MP4.
    Returns the MP4 file directly as a download.
    """
    import shutil
    if not req.image:
        raise HTTPException(status_code=400, detail="Page image is required")
    if not req.clips:
        raise HTTPException(status_code=400, detail="At least one audio clip is required")

    work_dir = tempfile.mkdtemp(prefix="javis_page_video_")
    try:
        mp4_path = await _render_one_page(req, work_dir)
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.exception("Page video render failed")
        raise HTTPException(status_code=500, detail=str(e))

    safe_title = (req.page_title or f"第{req.page_index + 1}页").replace("/", "_").replace("\\", "_")
    filename = f"{safe_title}.mp4"

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=mp4_path,
        media_type="video/mp4",
        filename=filename,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint: render ALL pages and return merged MP4 or ZIP
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/render-video/project")
async def render_project_video(
    req: ProjectRenderRequest,
    background_tasks: BackgroundTasks,
):
    """
    Render every page and:
    - if merge=True  → return one single merged MP4
    - if merge=False → return a ZIP file with per-page MP4s
    """
    import shutil, zipfile, io

    if not req.pages:
        raise HTTPException(status_code=400, detail="No pages provided")

    work_dir = tempfile.mkdtemp(prefix="javis_project_video_")
    try:
        # Render pages concurrently with a concurrency limit (e.g., 4)
        # This prevents HTTP timeouts on large PDFs while avoiding CPU/RAM exhaustion
        sem = asyncio.Semaphore(4)

        async def _render_with_sem(p: PageRenderRequest) -> Optional[str]:
            if not p.image or not p.clips:
                logger.warning("Skipping page %d: missing image or clips", p.page_index)
                return None
            async with sem:
                return await _render_one_page(p, work_dir)

        tasks = [_render_with_sem(page) for page in req.pages]
        results = await asyncio.gather(*tasks)
        mp4_paths = [path for path in results if path is not None]

        if not mp4_paths:
            raise HTTPException(status_code=400, detail="No renderable pages (each page needs an image AND at least one audio clip)")

        safe_name = (req.project_name or "Javis_Studio_Project").replace("/", "_").replace("\\", "_")

        if req.merge:
            # ── Merge into one MP4 ──────────────────────────────────────
            merged_path = os.path.join(work_dir, f"{safe_name}.mp4")
            await render_video_service.async_merge_mp4s(mp4_paths, merged_path, work_dir)
            background_tasks.add_task(shutil.rmtree, work_dir, True)
            return FileResponse(
                path=merged_path,
                media_type="video/mp4",
                filename=f"{safe_name}.mp4",
            )
        else:
            # ── Pack per-page MP4s into ZIP ──────────────────────────────
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_STORED) as zf:
                for page, mp4_path in zip(req.pages, mp4_paths):
                    page_title = (page.page_title or f"第{page.page_index + 1}页").replace("/", "_")
                    arcname = f"{page.page_index + 1:02d}_{page_title}.mp4"
                    zf.write(mp4_path, arcname)
            zip_bytes = zip_buf.getvalue()
            background_tasks.add_task(shutil.rmtree, work_dir, True)
            return StreamingResponse(
                io.BytesIO(zip_bytes),
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}_视频.zip"'},
            )

    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.exception("Project video render failed")
        raise HTTPException(status_code=500, detail=str(e))
