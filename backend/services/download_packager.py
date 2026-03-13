"""
Media download and packaging service.
Downloads multiple media files and packages them into a ZIP archive.
"""
import asyncio
import io
import logging
import os
import re
import tempfile
import zipfile
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path
import httpx

logger = logging.getLogger(__name__)


@dataclass
class MediaItem:
    """Represents a media item to download."""
    index: int
    segment: str
    keyword: str
    source: str
    media_type: str  # "video" or "photo"
    media_url: str
    source_url: str
    media_id: str


@dataclass
class DownloadResult:
    """Result of a single media download."""
    success: bool
    item: MediaItem
    filename: Optional[str] = None
    data: Optional[bytes] = None
    error: Optional[str] = None
    size: int = 0


def sanitize_filename(name: str, max_length: int = 30) -> str:
    """Sanitize a string to be safe for use as a filename."""
    # Replace special characters with underscore
    sanitized = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fa5_-]', '_', name)
    # Limit length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    # Remove trailing underscores
    sanitized = sanitized.strip('_')
    return sanitized if sanitized else "media"


async def download_youtube_video(
    item: MediaItem,
    temp_dir: str,
    timeout: float = 300.0  # YouTube downloads need more time
) -> DownloadResult:
    """
    Download a YouTube video using yt-dlp.
    
    Args:
        item: Media item with YouTube video
        temp_dir: Temporary directory for download
        timeout: Timeout in seconds
    
    Returns:
        DownloadResult with success status and data or error message
    """
    from services.ytdlp_service import download_video, YTDLPError
    
    safe_keyword = sanitize_filename(item.keyword)
    filename = f"{item.index:02d}_{safe_keyword}.mp4"
    
    try:
        logger.info(f"Downloading YouTube video for '{item.keyword}' (ID: {item.media_id})")
        
        # Run yt-dlp in executor to not block the event loop
        loop = asyncio.get_event_loop()
        video_path = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: download_video(item.media_id, temp_dir, resolution="1080")
            ),
            timeout=timeout
        )
        
        # Read the downloaded file
        video_file = Path(video_path)
        if not video_file.exists():
            raise FileNotFoundError(f"Downloaded file not found: {video_path}")
        
        data = video_file.read_bytes()
        
        logger.info(f"Successfully downloaded YouTube video {filename} ({len(data)} bytes)")
        
        return DownloadResult(
            success=True,
            item=item,
            filename=filename,
            data=data,
            size=len(data)
        )
        
    except asyncio.TimeoutError:
        return DownloadResult(
            success=False,
            item=item,
            filename=filename,
            error=f"YouTube download timeout after {timeout}s"
        )
    except YTDLPError as e:
        return DownloadResult(
            success=False,
            item=item,
            filename=filename,
            error=f"YouTube download failed: {e.message}"
        )
    except Exception as e:
        logger.error(f"Error downloading YouTube video {item.media_id}: {e}")
        return DownloadResult(
            success=False,
            item=item,
            filename=filename,
            error=f"YouTube download error: {str(e)[:200]}"
        )


async def download_single_media(
    item: MediaItem,
    temp_dir: Optional[str] = None,
    timeout: float = 60.0,
    max_retries: int = 2
) -> DownloadResult:
    """
    Download a single media file with retry logic.
    
    Args:
        item: Media item to download
        temp_dir: Temporary directory for YouTube downloads
        timeout: Timeout in seconds for each attempt
        max_retries: Maximum number of retry attempts
    
    Returns:
        DownloadResult with success status and data or error message
    """
    ext = "mp4" if item.media_type == "video" else "jpg"
    safe_keyword = sanitize_filename(item.keyword)
    filename = f"{item.index:02d}_{safe_keyword}.{ext}"
    
    # Handle YouTube videos separately using yt-dlp
    if item.source == "youtube":
        if not temp_dir:
            return DownloadResult(
                success=False,
                item=item,
                filename=filename,
                error="Temp directory required for YouTube downloads"
            )
        return await download_youtube_video(item, temp_dir, timeout=300.0)
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Downloading {item.source} {item.media_type} for '{item.keyword}' (attempt {attempt + 1}/{max_retries})")
            
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "video/*,image/*,*/*;q=0.8" if item.media_type == "video" else "image/*,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": item.source_url,
                }
                
                response = await client.get(item.media_url, headers=headers)
                response.raise_for_status()
                
                data = response.content
                
                if len(data) == 0:
                    raise ValueError("Downloaded file is empty")
                
                # Validate content type if available
                content_type = response.headers.get("content-type", "").lower()
                if item.media_type == "video":
                    if content_type and not (content_type.startswith("video/") or content_type == "application/octet-stream"):
                        logger.warning(f"Unexpected content type for video: {content_type}")
                else:
                    if content_type and not (content_type.startswith("image/") or content_type == "application/octet-stream"):
                        logger.warning(f"Unexpected content type for image: {content_type}")
                
                logger.info(f"Successfully downloaded {filename} ({len(data)} bytes)")
                
                return DownloadResult(
                    success=True,
                    item=item,
                    filename=filename,
                    data=data,
                    size=len(data)
                )
                
        except httpx.TimeoutException as e:
            last_error = f"Download timeout after {timeout}s"
            logger.warning(f"Timeout downloading {filename} (attempt {attempt + 1}): {e}")
        except httpx.HTTPStatusError as e:
            last_error = f"HTTP error {e.response.status_code}"
            logger.warning(f"HTTP error downloading {filename} (attempt {attempt + 1}): {e}")
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Error downloading {filename} (attempt {attempt + 1}): {e}")
        
        # Wait before retry (exponential backoff)
        if attempt < max_retries - 1:
            wait_time = 2 ** attempt  # 1s, 2s
            logger.info(f"Waiting {wait_time}s before retry...")
            await asyncio.sleep(wait_time)
    
    # All retries failed
    return DownloadResult(
        success=False,
        item=item,
        filename=filename,
        error=last_error or "Unknown error"
    )


async def download_all_media(
    items: List[MediaItem],
    temp_dir: str,
    max_concurrent: int = 3,  # Reduced for YouTube downloads
    timeout: float = 60.0
) -> List[DownloadResult]:
    """
    Download all media files with concurrency control.
    YouTube videos are downloaded using yt-dlp, others via HTTP.
    
    Args:
        items: List of media items to download
        temp_dir: Temporary directory for YouTube downloads
        max_concurrent: Maximum number of concurrent downloads
        timeout: Timeout in seconds for each download
    
    Returns:
        List of DownloadResult for each item
    """
    # Separate YouTube videos (need temp_dir) from direct downloads
    youtube_items = [item for item in items if item.source == "youtube"]
    direct_items = [item for item in items if item.source != "youtube"]
    
    results = []
    
    # Download YouTube videos (with lower concurrency due to yt-dlp)
    if youtube_items:
        logger.info(f"Downloading {len(youtube_items)} YouTube videos")
        youtube_semaphore = asyncio.Semaphore(2)  # Max 2 concurrent YouTube downloads
        
        async def download_youtube_with_limit(item: MediaItem) -> DownloadResult:
            async with youtube_semaphore:
                return await download_single_media(item, temp_dir=temp_dir, timeout=300.0)
        
        youtube_tasks = [download_youtube_with_limit(item) for item in youtube_items]
        youtube_results = await asyncio.gather(*youtube_tasks, return_exceptions=True)
        
        for i, result in enumerate(youtube_results):
            if isinstance(result, Exception):
                logger.error(f"Exception downloading YouTube item {youtube_items[i].index}: {result}")
                results.append(DownloadResult(
                    success=False,
                    item=youtube_items[i],
                    error=str(result)
                ))
            else:
                results.append(result)
    
    # Download direct HTTP media
    if direct_items:
        logger.info(f"Downloading {len(direct_items)} direct media files")
        direct_semaphore = asyncio.Semaphore(max_concurrent)
        
        async def download_direct_with_limit(item: MediaItem) -> DownloadResult:
            async with direct_semaphore:
                return await download_single_media(item, timeout=timeout)
        
        direct_tasks = [download_direct_with_limit(item) for item in direct_items]
        direct_results = await asyncio.gather(*direct_tasks, return_exceptions=True)
        
        for i, result in enumerate(direct_results):
            if isinstance(result, Exception):
                logger.error(f"Exception downloading direct item {direct_items[i].index}: {result}")
                results.append(DownloadResult(
                    success=False,
                    item=direct_items[i],
                    error=str(result)
                ))
            else:
                results.append(result)
    
    return results


def generate_readme(
    project_name: str,
    items: List[MediaItem],
    results: List[DownloadResult],
    youtube_failed: List[MediaItem]
) -> str:
    """Generate README.md content for the package."""
    from datetime import datetime
    
    readme = f"""# {project_name}

导出时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 配图说明文档

"""
    
    # Add each item
    for item in items:
        is_video = item.media_type == "video"
        ext = "mp4" if is_video else "jpg"
        safe_keyword = sanitize_filename(item.keyword)
        filename = f"{item.index:02d}_{safe_keyword}.{ext}"
        
        readme += f"""### 镜头 {item.index}
- **解说文案**: {item.segment}
- **搜索关键词**: {item.keyword}
- **素材类型**: {"视频" if is_video else "图片"}
- **素材来源**: {item.source}
- **文件**: {filename}
- **原素材链接**: {item.source_url}\n
"""
    
    # Add failed YouTube downloads section if applicable
    if youtube_failed:
        readme += """---

## ⚠️ YouTube 视频下载失败说明

以下 YouTube 视频由于反爬虫限制未能自动下载，请使用 yt-dlp 手动下载：

```bash
# 安装 yt-dlp
pip install yt-dlp

"""
        for item in youtube_failed:
            safe_keyword = sanitize_filename(item.keyword)
            readme += f"""# 镜头 {item.index} - {item.keyword}
yt-dlp "{item.source_url}" -o "{item.index:02d}_{safe_keyword}.mp4"

"""
        readme += """```

或者在页面上点击每个 YouTube 视频的「下载视频」按钮单独下载。

"""
    
    # Add other failed downloads section
    failed = [r for r in results if not r.success and r.item.source != "youtube"]
    if failed:
        readme += """---

## ❌ 其他下载失败的素材

以下素材下载失败，请手动下载：

"""
        for result in failed:
            readme += f"- **镜头 {result.item.index}** ({result.item.source} - {result.item.keyword}): {result.error}\n"
        readme += "\n"
    
    # Add statistics
    successful = [r for r in results if r.success]
    youtube_results = [r for r in results if r.item.source == "youtube"]
    youtube_successful = [r for r in youtube_results if r.success]
    
    readme += f"""---

## 📊 下载统计

- **成功**: {len(successful)} 个
  - YouTube: {len(youtube_successful)} 个
  - 其他来源: {len(successful) - len(youtube_successful)} 个
- **失败**: {len(failed) + len(youtube_failed)} 个
- **总计**: {len(items)} 个镜头

"""
    
    return readme


async def create_media_package(
    project_name: str,
    items: List[MediaItem],
    max_concurrent: int = 3,
    timeout: float = 60.0
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Create a ZIP package with all downloadable media (including YouTube).
    
    Args:
        project_name: Name of the project
        items: List of media items to include
        max_concurrent: Maximum concurrent downloads
        timeout: Download timeout in seconds
    
    Returns:
        Tuple of (zip_bytes, summary_info)
    """
    logger.info(f"Creating media package for '{project_name}' with {len(items)} items")
    
    # Create temp directory for YouTube downloads
    with tempfile.TemporaryDirectory() as temp_dir:
        # Download all media (including YouTube)
        results = await download_all_media(
            items,
            temp_dir=temp_dir,
            max_concurrent=max_concurrent,
            timeout=timeout
        )
        
        # Separate YouTube results for reporting
        youtube_results = [r for r in results if r.item.source == "youtube"]
        youtube_failed = [r for r in youtube_results if not r.success]
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add successful downloads (including successful YouTube downloads)
            for result in results:
                if result.success and result.data:
                    # Use ZipInfo with UTF-8 flag to support Chinese filenames
                    zip_info = zipfile.ZipInfo(result.filename)
                    zip_info.flag_bits = 0x800  # UTF-8 encoding
                    zip_file.writestr(zip_info, result.data)
                    logger.info(f"Added {result.filename} to ZIP ({result.size} bytes)")

            # Generate and add README
            # YouTube items that failed are documented in README for manual download
            youtube_items_for_readme = [r.item for r in youtube_failed]
            readme_content = generate_readme(project_name, items, results, youtube_items_for_readme)
            readme_info = zipfile.ZipInfo("README.md")
            readme_info.flag_bits = 0x800  # UTF-8 encoding
            zip_file.writestr(readme_info, readme_content.encode('utf-8'))
    
    zip_bytes = zip_buffer.getvalue()
    
    # Generate summary
    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]
    youtube_successful = [r for r in youtube_results if r.success]
    
    summary = {
        "total_items": len(items),
        "successful_downloads": len(successful),
        "youtube_downloads": len(youtube_successful),
        "youtube_failed": len(youtube_failed),
        "failed_downloads": len(failed),
        "total_bytes": sum(r.size for r in successful),
        "zip_bytes": len(zip_bytes),
        "failed_items": [
            {
                "index": r.item.index,
                "keyword": r.item.keyword,
                "source": r.item.source,
                "error": r.error
            }
            for r in failed
        ]
    }
    
    logger.info(f"Package created: {len(zip_bytes)} bytes, {summary['successful_downloads']} successful ({summary['youtube_downloads']} YouTube), {summary['failed_downloads']} failed")
    
    return zip_bytes, summary
