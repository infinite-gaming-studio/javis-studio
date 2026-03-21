import asyncio
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

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
            out = await tts_service.synthesize(
                text=seg.text,
                voice_settings=req.voice_settings,
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

import tempfile
import subprocess
from fastapi.background import BackgroundTasks

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
            "ffmpeg",
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
