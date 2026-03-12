import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from pydub import AudioSegment

logger = logging.getLogger(__name__)


def get_audio_duration(filepath: str) -> float:
    """Return duration in seconds of a WAV/MP3 file."""
    audio = AudioSegment.from_file(filepath)
    return len(audio) / 1000.0


def concatenate_segments(
    segment_paths: list[str],
    output_dir: str,
    output_filename: Optional[str] = None,
    silence_ms: int = 300,
    output_format: str = "mp3",
) -> str:
    """
    Concatenate multiple audio segment files into one.

    Args:
        segment_paths: Ordered list of WAV file paths.
        output_dir: Directory to write the combined file.
        output_filename: Optional filename for the output (without extension).
        silence_ms: Milliseconds of silence to insert between segments.
        output_format: Output format: "mp3" or "wav".

    Returns:
        Absolute path of the combined audio file.
    """
    if not segment_paths:
        raise ValueError("No segment paths provided for concatenation.")

    combined = AudioSegment.empty()
    silence = AudioSegment.silent(duration=silence_ms)

    for i, path in enumerate(segment_paths):
        seg = AudioSegment.from_file(path)
        combined += seg
        if i < len(segment_paths) - 1:
            combined += silence

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    fname = (output_filename or uuid.uuid4().hex) + f".{output_format}"
    out_path = str(Path(output_dir) / fname)

    export_params: dict = {}
    if output_format == "mp3":
        export_params = {"bitrate": "192k"}

    combined.export(out_path, format=output_format, **export_params)
    logger.info("Concatenated %d segments → %s", len(segment_paths), out_path)
    return out_path
