"""PDF to Image conversion API router."""

import base64
import logging
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException, Query
from fastapi.responses import Response

from services import pdf_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


@router.post("/convert")
async def convert_pdf(
    file: UploadFile = File(..., description="PDF file to convert"),
    scale: float = Form(2.0, description="Resolution scale factor (1-4)"),
    format: str = Form("png", description="Output format: png, jpeg, webp"),
    quality: float = Form(0.92, description="JPEG/WebP quality (0.1-1.0)"),
    pages: Optional[str] = Form(None, description="Comma-separated page numbers (1-indexed), e.g. '1,3,5'. Empty = all pages"),
    return_type: str = Form("zip", description="Return type: 'zip' for archive, 'base64' for JSON with base64 images"),
):
    """
    Convert PDF to images.
    
    **Parameters:**
    - `file`: PDF file to convert
    - `scale`: Resolution multiplier (1-4, default 2)
    - `format`: Output format - png, jpeg, or webp (default png)
    - `quality`: Image quality for JPEG/WebP, 0.1-1.0 (default 0.92)
    - `pages`: Optional comma-separated page numbers to convert (1-indexed). Example: "1,3,5-7"
    - `return_type`: "zip" returns a ZIP archive, "base64" returns JSON with base64-encoded images
    
    **Returns:**
    - If `return_type=zip`: ZIP file containing all images
    - If `return_type=base64`: JSON with array of {page, image_base64, width, height}
    """
    # Validate format
    format = format.lower()
    if format not in ("png", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail=f"Invalid format: {format}. Must be png, jpeg, or webp.")
    
    # Validate scale
    if not 0.5 <= scale <= 4:
        raise HTTPException(status_code=400, detail=f"Scale must be between 0.5 and 4, got {scale}")
    
    # Validate quality
    if not 0.1 <= quality <= 1.0:
        raise HTTPException(status_code=400, detail=f"Quality must be between 0.1 and 1.0, got {quality}")
    
    # Parse pages
    page_list = None
    if pages:
        try:
            page_list = parse_page_range(pages)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid page range: {e}")
    
    # Read PDF
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    
    # Convert
    try:
        images = pdf_service.convert_pdf_to_images(
            pdf_bytes=pdf_bytes,
            scale=scale,
            fmt=format,
            quality=quality,
            pages=page_list,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    if not images:
        raise HTTPException(status_code=400, detail="No pages were converted")
    
    # Return based on type
    if return_type == "zip":
        zip_bytes = pdf_service.create_zip_archive(images, format)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{file.filename or "pdf"}_images.zip"'
            }
        )
    else:
        # Return as JSON with base64 images
        result = {
            "format": format,
            "pages": [
                {
                    "page": page_num,
                    "image_base64": base64.b64encode(img_bytes).decode("utf-8"),
                    "width": width,
                    "height": height,
                }
                for page_num, img_bytes, width, height in images
            ]
        }
        return result


@router.post("/info")
async def get_pdf_info(
    file: UploadFile = File(..., description="PDF file to analyze"),
):
    """
    Get PDF file information (page count, dimensions, metadata).
    
    **Returns:**
    - JSON with page_count, metadata, and per-page dimensions
    """
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    
    try:
        info = pdf_service.get_pdf_info(pdf_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    return info


def parse_page_range(page_str: str) -> list[int]:
    """
    Parse page range string like '1,3,5-7' into list of page numbers.
    
    Examples:
    - '1' -> [1]
    - '1,3,5' -> [1, 3, 5]
    - '1-3' -> [1, 2, 3]
    - '1,3-5,8' -> [1, 3, 4, 5, 8]
    """
    pages = set()
    
    for part in page_str.split(','):
        part = part.strip()
        if not part:
            continue
        
        if '-' in part:
            # Range like '1-5'
            start, end = part.split('-', 1)
            start = int(start.strip())
            end = int(end.strip())
            if start > end:
                raise ValueError(f"Invalid range: {part}")
            pages.update(range(start, end + 1))
        else:
            # Single page
            pages.add(int(part))
    
    return sorted(pages)
