"""
render_video_service.py
=======================
Renders a high-quality MP4 for one or more project pages.

Each page MP4:
  - Static image (from base-64 data-URI or HTTP URL) as the video track
  - All audio clips for that page concatenated as the audio track
  - Duration == total audio duration
  - Resolution: max 1920×1080, original aspect ratio preserved

A "merge" helper concatenates per-page MP4s into one final MP4.

Dependencies: ffmpeg must be on PATH (standard on macOS / Docker Ubuntu).
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ffmpeg binary resolution
# ---------------------------------------------------------------------------

def _find_ffmpeg() -> str:
    """
    Return an absolute path to a working ffmpeg binary.

    Priority order:
      1. FFMPEG_BIN env var (user override)
      2. /opt/homebrew/bin/ffmpeg  (Homebrew on Apple Silicon – avoids broken Anaconda builds)
      3. /usr/local/bin/ffmpeg     (Homebrew on Intel Mac / Linux brew)
      4. ffmpeg on PATH
    """
    # Allow explicit override via env
    env_path = os.environ.get("FFMPEG_BIN", "").strip()
    if env_path and Path(env_path).exists():
        logger.info("Using ffmpeg from FFMPEG_BIN: %s", env_path)
        return env_path

    candidates = [
        "/opt/homebrew/bin/ffmpeg",   # Apple Silicon Homebrew
        "/usr/local/bin/ffmpeg",      # Intel Homebrew / Linux
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            # Quick sanity check – run -version, if it crashes skip it
            try:
                result = subprocess.run(
                    [candidate, "-version"],
                    capture_output=True, timeout=5
                )
                if result.returncode == 0:
                    logger.info("Using ffmpeg: %s", candidate)
                    return candidate
            except Exception:
                pass

    # Fallback: whatever is on PATH
    logger.info("Using ffmpeg from PATH")
    return "ffmpeg"


FFMPEG_BIN: str = _find_ffmpeg()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run(cmd: List[str], timeout: int = 300) -> None:
    """Run an ffmpeg subprocess, raise RuntimeError on failure."""
    logger.info("ffmpeg cmd: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        logger.error("ffmpeg stderr:\n%s", result.stderr[-3000:])
        raise RuntimeError(f"ffmpeg failed (rc={result.returncode}): {result.stderr[-500:]}")


def _save_image(image_src: str, dest_path: str) -> None:
    """
    Decode a base64 data-URI  OR  copy a local file  OR  download HTTP URL
    and write raw bytes to *dest_path*.
    """
    if image_src.startswith("data:"):
        # data:image/png;base64,<payload>
        header, b64data = image_src.split(",", 1)
        raw = base64.b64decode(b64data)
        with open(dest_path, "wb") as f:
            f.write(raw)
    elif image_src.startswith("http://") or image_src.startswith("https://"):
        import urllib.request
        urllib.request.urlretrieve(image_src, dest_path)
    else:
        # Treat as local filesystem path
        shutil.copy2(image_src, dest_path)


def _concat_wavs(wav_paths: List[str], out_path: str) -> None:
    """Concatenate one or more WAV files into *out_path*."""
    if len(wav_paths) == 1:
        shutil.copy2(wav_paths[0], out_path)
        return
    # Write a concat list file understood by ffmpeg
    list_file = out_path + ".list.txt"
    with open(list_file, "w", encoding="utf-8") as f:
        for p in wav_paths:
            f.write(f"file '{p}'\n")
    _run([
        FFMPEG_BIN, "-y",
        "-f", "concat", "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        out_path,
    ])
    os.unlink(list_file)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def render_page_mp4(
    *,
    image_src: str,
    audio_paths: List[str],
    output_path: str,
    work_dir: str,
    page_label: str = "page",
) -> str:
    """
    Render a single-page MP4.

    Parameters
    ----------
    image_src   : base64 data-URI or file path of the slide image
    audio_paths : ordered list of WAV file paths to concatenate
    output_path : destination .mp4 path
    work_dir    : scratch directory for temp files
    page_label  : used only for logging

    Returns
    -------
    output_path (same as input, for chaining)
    """
    if not audio_paths:
        raise ValueError(f"[{page_label}] No audio paths provided")
    if not image_src:
        raise ValueError(f"[{page_label}] No image source provided")

    img_path = os.path.join(work_dir, f"{page_label}_slide.png")
    audio_path = os.path.join(work_dir, f"{page_label}_audio.wav")

    # 1. Save image
    _save_image(image_src, img_path)

    # 2. Concatenate audio segments
    _concat_wavs(audio_paths, audio_path)

    # 3. Render MP4
    #    -loop 1          : loop the single image indefinitely until audio ends
    #    -shortest        : stop when audio ends
    #    -vf scale        : keep aspect ratio, pad to even dims ≤ 1920×1080
    #    -pix_fmt yuv420p : broadest player compatibility
    #    -crf 18          : high quality (lower = better)
    #    -preset fast     : reasonable encode speed
    scale_filter = (
        "scale='if(gt(iw,1920),1920,iw)':'if(gt(ih,1080),1080,ih)'"
        ":force_original_aspect_ratio=decrease"
        ",pad=ceil(iw/2)*2:ceil(ih/2)*2"
    )
    _run([
        FFMPEG_BIN, "-y",
        "-loop", "1",
        "-i", img_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",  # slightly higher CRF is fine for static slides
        "-pix_fmt", "yuv420p",
        "-vf", scale_filter,
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_path,
    ])

    logger.info("[%s] MP4 rendered → %s", page_label, output_path)
    return output_path


def merge_mp4s(mp4_paths: List[str], output_path: str, work_dir: str) -> str:
    """
    Concatenate multiple MP4 files (same codec / resolution) into one.

    We use the concat demuxer (no re-encode) so this is fast.
    All inputs must share the same video/audio codec and resolution;
    render_page_mp4 guarantees this when using the same settings.

    Returns output_path.
    """
    if not mp4_paths:
        raise ValueError("No MP4 paths provided for merge")
    if len(mp4_paths) == 1:
        shutil.copy2(mp4_paths[0], output_path)
        return output_path

    list_file = os.path.join(work_dir, "merge_list.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        for p in mp4_paths:
            f.write(f"file '{p}'\n")

    _run([
        FFMPEG_BIN, "-y",
        "-f", "concat", "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        output_path,
    ])
    os.unlink(list_file)
    logger.info("Merged %d MP4s → %s", len(mp4_paths), output_path)
    return output_path


# ---------------------------------------------------------------------------
# Async wrappers (run blocking ffmpeg in thread pool)
# ---------------------------------------------------------------------------

async def async_render_page_mp4(**kwargs) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: render_page_mp4(**kwargs))


async def async_merge_mp4s(mp4_paths: List[str], output_path: str, work_dir: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: merge_mp4s(mp4_paths, output_path, work_dir)
    )
