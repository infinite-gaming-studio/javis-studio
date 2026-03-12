"""
YouTube download service using yt-dlp.
Reference: VideoLingo project (https://github.com/Huanshere/VideoLingo)
"""
import os
import sys
import re
import subprocess
import logging
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, Callable

logger = logging.getLogger(__name__)


def update_ytdlp() -> bool:
    """Update yt-dlp to the latest version."""
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=60
        )
        # Clear cached module if exists
        if 'yt_dlp' in sys.modules:
            del sys.modules['yt_dlp']
        logger.info("yt-dlp updated successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.warning(f"Failed to update yt-dlp: {e}")
        return False
    except Exception as e:
        logger.warning(f"Error updating yt-dlp: {e}")
        return False


def get_ytdlp_version() -> Optional[str]:
    """Get current yt-dlp version."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception as e:
        logger.debug(f"Could not get yt-dlp version: {e}")
    return None


def sanitize_filename(filename: str) -> str:
    """Remove or replace illegal characters in filename."""
    # Remove illegal characters
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    # Ensure filename doesn't start or end with dot or space
    filename = filename.strip('. ')
    # Use default name if empty
    return filename if filename else 'video'


def get_cookies_path() -> Optional[str]:
    """Get YouTube cookies file path from config."""
    # Check config settings first
    try:
        from config import get_settings
        settings = get_settings()
        if settings.youtube_cookies_path and os.path.exists(settings.youtube_cookies_path):
            return settings.youtube_cookies_path
    except Exception:
        pass
    
    # Check environment variable
    cookies_path = os.getenv("YOUTUBE_COOKIES_PATH", "")
    if cookies_path and os.path.exists(cookies_path):
        return cookies_path
    
    # Check common locations
    possible_paths = [
        Path.home() / ".config" / "javis-studio" / "cookies.txt",
        Path.home() / ".javis-studio" / "cookies.txt",
        Path("/app/config/cookies.txt"),  # Docker common path
        Path("/app/cookies.txt"),  # Docker alternative
        Path("cookies.txt"),  # Current directory
    ]
    
    for path in possible_paths:
        if path.exists():
            logger.info(f"Found cookies file at: {path}")
            return str(path)
    
    return None


class YTDLPError(Exception):
    """Custom exception for yt-dlp errors."""
    def __init__(self, message: str, error_type: str = "unknown"):
        self.message = message
        self.error_type = error_type
        super().__init__(self.message)


def download_video(
    video_id: str,
    output_dir: str,
    resolution: str = "1080",
    progress_hook: Optional[Callable[[Dict[str, Any]], None]] = None
) -> str:
    """
    Download a YouTube video using yt-dlp Python API.
    
    Args:
        video_id: YouTube video ID
        output_dir: Directory to save the video
        resolution: Target resolution (e.g., "1080", "720", "best")
        progress_hook: Optional callback for download progress
    
    Returns:
        Path to the downloaded file
    
    Raises:
        YTDLPError: If download fails
    """
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Build format string
    if resolution == "best":
        format_str = "bestvideo+bestaudio/best"
    else:
        try:
            res_num = int(resolution)
            format_str = f"bestvideo[height<={res_num}][ext=mp4]+bestaudio[ext=m4a]/best[height<={res_num}]/best"
        except ValueError:
            format_str = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best"
    
    # Configure yt-dlp options
    ydl_opts: Dict[str, Any] = {
        "format": format_str,
        "outtmpl": os.path.join(output_dir, "%(title)s_%(id)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        "retries": 5,
        "fragment_retries": 5,
        "skip_unavailable_fragments": True,
        "no_cache_dir": True,
        # Anti-detection options
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "extractor_args": {
            "youtube": {
                "player_client": ["web"],
                "player_skip": ["webpage", "configs", "js"],
            }
        },
    }
    
    # Add cookies if available
    cookies_path = get_cookies_path()
    if cookies_path:
        logger.info(f"Using cookies from: {cookies_path}")
        ydl_opts["cookiefile"] = cookies_path
    else:
        # Try to extract cookies from browser as fallback
        ydl_opts["cookiesfrombrowser"] = ("chrome",)  # tuple format for yt-dlp
    
    # Add progress hook if provided
    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]
    
    try:
        # Import yt-dlp (may need to update first)
        try:
            from yt_dlp import YoutubeDL
        except ImportError:
            logger.info("yt-dlp not found, attempting to install...")
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "yt-dlp"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            from yt_dlp import YoutubeDL
        
        # Perform download
        logger.info(f"Starting download for video: {video_id}")
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            if not info:
                raise YTDLPError("Failed to extract video info", "extract_error")
            
            # Get the downloaded file path
            filename = ydl.prepare_filename(info)
            # Handle merged output format
            if ydl_opts.get("merge_output_format"):
                base, _ = os.path.splitext(filename)
                filename = f"{base}.{ydl_opts['merge_output_format']}"
            
            # Sanitize filename if needed
            dir_name = os.path.dirname(filename)
            base_name = os.path.basename(filename)
            sanitized = sanitize_filename(os.path.splitext(base_name)[0])
            ext = os.path.splitext(base_name)[1]
            new_filename = os.path.join(dir_name, f"{sanitized}{ext}")
            
            if new_filename != filename and os.path.exists(filename):
                os.rename(filename, new_filename)
                filename = new_filename
            
            if not os.path.exists(filename):
                # Try to find the file with different extensions
                for ext in [".mp4", ".webm", ".mkv", ".mov"]:
                    alt_filename = os.path.join(dir_name, f"{sanitized}{ext}")
                    if os.path.exists(alt_filename):
                        filename = alt_filename
                        break
            
            logger.info(f"Successfully downloaded: {filename}")
            return filename
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"yt-dlp error: {error_msg}")
        
        # Classify errors
        if "Sign in to confirm" in error_msg or "not a bot" in error_msg:
            raise YTDLPError(
                "YouTube detected automated access. Please use cookies from a logged-in browser.",
                "bot_detection"
            )
        elif "Video unavailable" in error_msg or "removed" in error_msg:
            raise YTDLPError("Video has been removed or is unavailable", "unavailable")
        elif "Private video" in error_msg or "private" in error_msg.lower():
            raise YTDLPError("This video is private", "private")
        elif "copyright" in error_msg.lower():
            raise YTDLPError("Video blocked due to copyright", "copyright")
        elif "age-restricted" in error_msg.lower():
            raise YTDLPError("Video is age-restricted", "age_restricted")
        elif "network" in error_msg.lower() or "connection" in error_msg.lower():
            raise YTDLPError("Network connection error", "network")
        elif "No video formats found" in error_msg:
            raise YTDLPError("No downloadable formats found", "no_formats")
        else:
            raise YTDLPError(f"Download failed: {error_msg[:200]}", "unknown")


def get_video_info(video_id: str) -> Dict[str, Any]:
    """
    Get video information without downloading.
    
    Args:
        video_id: YouTube video ID
    
    Returns:
        Dictionary with video info
    """
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    
    try:
        from yt_dlp import YoutubeDL
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            return {
                "title": info.get("title", ""),
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", ""),
                "upload_date": info.get("upload_date", ""),
                "view_count": info.get("view_count", 0),
                "formats_count": len(info.get("formats", [])),
            }
    except Exception as e:
        logger.error(f"Failed to get video info: {e}")
        return {}
