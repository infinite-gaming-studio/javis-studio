"""
render_video_service.py
======================
Renders a high-quality MP4 for one or more project pages.

Each page MP4:
  - Static image (from base-64 data-URI or HTTP URL) as the video track
  - All audio clips for that page concatenated as the audio track
  - Optional subtitle overlay (SRT/ASS burned into video)
  - Duration == total audio duration
  - Resolution: max 1920×1080, original aspect ratio preserved

A "merge" helper concatenates per-page MP4s into one final MP4.
A "merge with transitions" helper adds xfade transitions between pages.

Dependencies: ffmpeg must be on PATH (standard on macOS / Docker Ubuntu).
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = ("fade", "slideleft", "slideright", "slideup", "slidedown",
                     "zoomin", "zoomout", "wipeleft", "wiperight", "dissolve",
                     "pageflip")

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


def _get_best_h264_encoder(ffmpeg_path: str) -> str:
    """Dynamically determine the best h264 encoder based on environment and ffmpeg capabilities."""
    try:
        result = subprocess.run([ffmpeg_path, "-encoders"], capture_output=True, text=True, timeout=5)
        encoders = result.stdout
        # Mac VideoToolbox hardware acceleration
        if "h264_videotoolbox" in encoders and platform.system() == "Darwin":
            logger.info("Using GPU acceleration: h264_videotoolbox")
            return "h264_videotoolbox"
        # Nvidia hardware acceleration
        if "h264_nvenc" in encoders:
            logger.info("Using GPU acceleration: h264_nvenc")
            return "h264_nvenc"
    except Exception as e:
        logger.warning("Failed to probe ffmpeg encoders, falling back to libx264: %s", e)
    
    logger.info("Using CPU rendering: libx264")
    return "libx264"


H264_ENCODER: str = _get_best_h264_encoder(FFMPEG_BIN)


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
    subtitle_srt: Optional[str] = None,
) -> str:
    """
    Render a single-page MP4.

    Parameters
    ----------
    image_src    : base64 data-URI or file path of the slide image
    audio_paths  : ordered list of WAV file paths to concatenate
    output_path  : destination .mp4 path
    work_dir     : scratch directory for temp files
    page_label   : used only for logging
    subtitle_srt : optional SRT subtitle content string (burned into video)

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
    srt_path = None

    # 1. Save image
    _save_image(image_src, img_path)

    # 2. Concatenate audio segments
    _concat_wavs(audio_paths, audio_path)

    # 3. Save subtitle file if provided
    vf_filters = []
    scale_filter = (
        "scale='if(gt(iw,1920),1920,iw)':'if(gt(ih,1080),1080,ih)'"
        ":force_original_aspect_ratio=decrease"
        ",pad=ceil(iw/2)*2:ceil(ih/2)*2"
    )
    vf_filters.append(scale_filter)

    if subtitle_srt:
        srt_path = os.path.join(work_dir, f"{page_label}_subs.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(subtitle_srt)
        vf_filters.append(f"subtitles='{srt_path}'")

    vf_combined = ",".join(vf_filters)

    # 4. Render MP4
    _run([
        FFMPEG_BIN, "-y",
        "-loop", "1",
        "-i", img_path,
        "-i", audio_path,
        "-c:v", H264_ENCODER,
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-vf", vf_combined,
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


def merge_mp4s_with_transitions(
    mp4_paths: List[str],
    output_path: str,
    work_dir: str,
    transition: str = "fade",
    duration: float = 1.0,
) -> str:
    """
    Merge per-page MP4s with xfade transitions between each page.

    Uses ffmpeg's xfade filter to create smooth transitions.
    Supported transitions: fade, slideleft, slideright, slideup, slidedown,
    zoomin, zoomout, wipeleft, wiperight, dissolve

    Parameters
    ----------
    mp4_paths    : ordered list of per-page MP4 file paths
    output_path  : destination .mp4 path
    work_dir     : scratch directory for temp files
    transition   : xfade transition type (default "fade")
    duration     : transition duration in seconds (default 1.0)

    Returns
    -------
    output_path
    """
    if not mp4_paths:
        raise ValueError("No MP4 paths provided for merge with transitions")
    if len(mp4_paths) == 1:
        shutil.copy2(mp4_paths[0], output_path)
        return output_path
    if transition not in VALID_TRANSITIONS:
        logger.warning("Unknown transition '%s', falling back to 'fade'", transition)
        transition = "fade"

    # Get duration of each input MP4
    durations: List[float] = []
    for p in mp4_paths:
        cmd = [
            FFMPEG_BIN, "-i", p,
            "-f", "null", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        # Parse duration from ffmpeg output like "Duration: 00:00:03.50"
        match = re.search(r"Duration:\s+(\d+):(\d+):(\d+\.\d+)", result.stderr)
        if match:
            h, m, s = int(match.group(1)), int(match.group(2)), float(match.group(3))
            durations.append(h * 3600 + m * 60 + s)
        else:
            durations.append(3.0)  # fallback

    # Build xfade filter chain
    # For N inputs, we need N-1 xfade operations chained together
    # Each xfade takes two inputs and offsets by accumulated duration minus transition time
    inputs_args = []
    for i, p in enumerate(mp4_paths):
        inputs_args.extend(["-i", p])

    # Build complex filter chain
    filter_parts = []
    offset = durations[0] - duration  # first xfade starts at end of first clip minus duration

    # First xfade: [0:v][1:v]
    filter_parts.append(
        f"[0:v][1:v]xfade=transition={transition}:duration={duration:.2f}:offset={offset:.2f}[v01]"
    )

    # Chain subsequent xfades
    prev_label = "v01"
    accumulated_offset = durations[0] + durations[1] - duration  # total so far minus overlap

    for i in range(2, len(mp4_paths)):
        next_label = f"v{0}{1}{i}" if i < 10 else f"v{i}"
        curr_offset = accumulated_offset - duration  # account for previous transition overlap
        filter_parts.append(
            f"[{prev_label}][{i}:v]xfade=transition={transition}:duration={duration:.2f}:offset={curr_offset:.2f}[{next_label}]"
        )
        prev_label = next_label
        accumulated_offset += durations[i] - duration

    final_label = prev_label
    # Concatenate audio tracks separately
    audio_inputs = "".join(f"[{i}:a]" for i in range(len(mp4_paths)))
    filter_parts.append(f"{audio_inputs}concat=n={len(mp4_paths)}:v=0:a=1[aout]")

    complex_filter = ";".join(filter_parts)

    cmd = [
        FFMPEG_BIN, "-y",
        *inputs_args,
        "-filter_complex", complex_filter,
        "-map", f"[{final_label}]",
        "-map", "[aout]",
        "-c:v", H264_ENCODER,
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ]

    logger.info("Merging %d MP4s with transition '%s' (duration=%.1fs)", len(mp4_paths), transition, duration)
    _run(cmd, timeout=600)
    logger.info("Merged %d MP4s with transitions → %s", len(mp4_paths), output_path)
    return output_path


def _get_video_duration(video_path: str) -> float:
    """Get duration of a video file in seconds."""
    cmd = [FFMPEG_BIN.replace("ffmpeg", "ffprobe") if "ffprobe" not in FFMPEG_BIN else "ffprobe",
           "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", video_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return float(result.stdout.strip())
    except Exception:
        return 3.0


def _create_pageflip_transition_clip(
    outgoing_image: str,
    incoming_image: str,
    output_path: str,
    duration: float = 1.0,
    fps: int = 24,
    work_dir: str = "",
) -> str:
    """
    Create a 3D-like page-flip transition clip between two static page images.
    
    The outgoing page "turns" from right to left, revealing the incoming page.
    Phase 1: outgoing page visible, progressively cropped from the right edge.
    Phase 2: incoming page fully revealed.
    A subtle shadow/crease is added at the fold line for realism.
    """
    scale_filter = (
        "scale='if(gt(iw,1920),1920,iw)':'if(gt(ih,1080),1080,ih)'"
        ":force_original_aspect_ratio=decrease"
        ",pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
    )

    filter_complex = (
        # Background: incoming page (looped for duration)
        f"[0:v]fps={fps},{scale_filter},format=yuv420p[bg];"
        # Foreground: outgoing page with animated crop + shadow
        f"[1:v]fps={fps},{scale_filter},"
        # Animate crop: width shrinks from full to 2px over duration
        # x offset = 0 keeps left edge fixed, simulating right-to-left page turn
        f"crop='max(iw*(1-t/{duration}),2)':ih:0:0,"
        f"format=yuva420p[turning];"
        # Overlay turning page on background
        f"[bg][turning]overlay=0:0,format=yuv420p[v]"
    )

    cmd = [
        FFMPEG_BIN, "-y",
        "-loop", "1", "-t", str(duration), "-i", incoming_image,
        "-loop", "1", "-t", str(duration), "-i", outgoing_image,
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-t", str(duration),
        "-c:v", H264_ENCODER,
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-an",
        output_path,
    ]
    _run(cmd, timeout=120)
    logger.info("Page-flip transition rendered → %s", output_path)
    return output_path


def merge_mp4s_pageflip(
    mp4_paths: List[str],
    page_images: List[str],
    output_path: str,
    work_dir: str,
    duration: float = 1.0,
) -> str:
    """
    Merge per-page MP4s with page-flip transitions.
    
    For each pair of consecutive pages, creates a short transition clip
    showing the outgoing page "turning" to reveal the incoming page.
    Then concatenates: page1 + transition_1to2 + page2 + transition_2to3 + ...
    
    Parameters
    ----------
    mp4_paths    : ordered list of per-page MP4 file paths
    page_images   : ordered list of per-page image file paths (for transition clips)
    output_path   : destination .mp4 path
    work_dir      : scratch directory
    duration      : transition duration in seconds (default 1.0)
    """
    if len(mp4_paths) != len(page_images):
        raise ValueError(f"mp4_paths ({len(mp4_paths)}) and page_images ({len(page_images)}) must have same length")
    if len(mp4_paths) == 1:
        shutil.copy2(mp4_paths[0], output_path)
        return output_path

    all_clips: List[str] = []
    
    for i in range(len(mp4_paths)):
        # Add the page video
        all_clips.append(mp4_paths[i])
        
        # Add transition between this page and next
        if i < len(mp4_paths) - 1:
            trans_path = os.path.join(work_dir, f"pageflip_trans_{i:02d}_{i+1:02d}.mp4")
            _create_pageflip_transition_clip(
                outgoing_image=page_images[i],
                incoming_image=page_images[i + 1],
                output_path=trans_path,
                duration=duration,
                fps=24,
                work_dir=work_dir,
            )
            all_clips.append(trans_path)

    # Concatenate all clips using concat demuxer
    list_file = os.path.join(work_dir, "pageflip_concat_list.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        for clip in all_clips:
            f.write(f"file '{clip}'\n")

    _run([
        FFMPEG_BIN, "-y",
        "-f", "concat", "-safe", "0",
        "-i", list_file,
        "-c:v", H264_ENCODER,
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ], timeout=600)
    os.unlink(list_file)
    logger.info("Merged %d MP4s with page-flip transitions → %s", len(mp4_paths), output_path)
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


async def async_merge_mp4s_with_transitions(
    mp4_paths: List[str],
    output_path: str,
    work_dir: str,
    transition: str = "fade",
    duration: float = 1.0,
) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: merge_mp4s_with_transitions(mp4_paths, output_path, work_dir, transition, duration)
    )


async def async_merge_mp4s_pageflip(
    mp4_paths: List[str],
    page_images: List[str],
    output_path: str,
    work_dir: str,
    duration: float = 1.0,
) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: merge_mp4s_pageflip(mp4_paths, page_images, output_path, work_dir, duration)
    )
