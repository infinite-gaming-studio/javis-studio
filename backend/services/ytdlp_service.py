"""
YouTube download service using yt-dlp.
Simplified version without cookies - uses basic yt-dlp configuration.
"""
import os
import sys
import re
import subprocess
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Callable

logger = logging.getLogger(__name__)


def update_ytdlp() -> bool:
    """
    Update yt-dlp to the latest version.
    Returns True if update was successful or not needed, False on error.
    """
    try:
        logger.info("Checking for yt-dlp updates...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-U", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            logger.info("yt-dlp is up to date")
            return True
        else:
            logger.warning(f"yt-dlp update returned non-zero: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        logger.warning("yt-dlp update timed out")
        return False
    except Exception as e:
        logger.error(f"Failed to update yt-dlp: {e}")
        return False


def get_cookies_path() -> Optional[str]:
    """
    Get the path to YouTube cookies file if configured.
    Checks environment variable YOUTUBE_COOKIES_PATH.
    """
    cookies_path = os.environ.get("YOUTUBE_COOKIES_PATH")
    if cookies_path and os.path.exists(cookies_path):
        logger.info(f"Using YouTube cookies from: {cookies_path}")
        return cookies_path
    
    # Also check for cookies.txt in common locations
    possible_paths = [
        "cookies.txt",
        "youtube_cookies.txt",
        "/app/cookies.txt",
        "/tmp/cookies.txt",
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            logger.info(f"Found cookies file: {path}")
            return path
    
    return None


def sanitize_filename(filename: str) -> str:
    """Remove or replace illegal characters in filename."""
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    filename = filename.strip('. ')
    return filename if filename else 'video'


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
    Supports cookies if YOUTUBE_COOKIES_PATH is set.
    """
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Simple format string - just use best available format
    format_str = "best/bestvideo+bestaudio"
    
    # Basic yt-dlp options - minimal configuration for reliability
    ydl_opts: Dict[str, Any] = {
        "format": format_str,
        "outtmpl": os.path.join(output_dir, "%(title)s_%(id)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        "retries": 3,
        "fragment_retries": 3,
        "file_access_retries": 3,
        # Add some headers to appear more like a browser
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    }
    
    # Add cookies if available
    cookies_path = get_cookies_path()
    if cookies_path:
        ydl_opts["cookiefile"] = cookies_path
        logger.info(f"Using cookies file: {cookies_path}")
    
    # Add progress hook if provided
    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]
    
    try:
        # Import yt-dlp
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
                "YouTube is blocking this download. Please try a different video.",
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
        elif "Requested format is not available" in error_msg:
            raise YTDLPError("This video format is not available. Try another video.", "format_unavailable")
        elif "network" in error_msg.lower() or "connection" in error_msg.lower():
            raise YTDLPError("Network connection error", "network")
        elif "No video formats found" in error_msg:
            raise YTDLPError("No downloadable formats found", "no_formats")
        else:
            raise YTDLPError(f"Download failed: {error_msg[:200]}", "unknown")


def get_video_info(video_id: str) -> Dict[str, Any]:
    """
    Get video information without downloading.
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
