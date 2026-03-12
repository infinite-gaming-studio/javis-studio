"""PDF to Image conversion service using PyMuPDF (fitz)."""

import io
import logging
import zipfile
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


# Format mapping
FORMAT_MAP = {
    "png": ("png", 1),
    "jpeg": ("jpeg", 0.92),
    "webp": ("webp", 0.92),
}


def convert_pdf_to_images(
    pdf_bytes: bytes,
    scale: float = 2.0,
    fmt: str = "png",
    quality: float = 0.92,
    pages: Optional[list[int]] = None,
) -> list[tuple[int, bytes, int, int]]:
    """
    Convert PDF bytes to a list of image bytes.
    
    Args:
        pdf_bytes: Raw PDF file bytes
        scale: Resolution scale factor (1-4)
        fmt: Output format (png, jpeg, webp)
        quality: JPEG/WebP quality (0.1-1.0)
        pages: Optional list of 1-indexed page numbers to convert. None = all pages.
    
    Returns:
        List of tuples: (page_number, image_bytes, width, height)
    """
    results = []
    
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        # Determine which pages to process
        if pages:
            page_indices = [p - 1 for p in pages if 1 <= p <= doc.page_count]  # Convert to 0-indexed
        else:
            page_indices = range(doc.page_count)
        
        img_format, default_quality = FORMAT_MAP.get(fmt.lower(), ("png", 1))
        actual_quality = quality if fmt.lower() != "png" else 1
        
        for page_idx in page_indices:
            page = doc[page_idx]
            
            # Calculate zoom matrix for resolution
            mat = fitz.Matrix(scale, scale)
            
            # Render page to pixmap
            pix = page.get_pixmap(matrix=mat, alpha=False)
            
            # Convert to bytes
            if img_format == "png":
                img_bytes = pix.tobytes(img_format)
            else:
                img_bytes = pix.tobytes(img_format, jpg_quality=int(actual_quality * 100))
            
            results.append((
                page_idx + 1,  # 1-indexed page number
                img_bytes,
                pix.width,
                pix.height,
            ))
        
        doc.close()
        
    except Exception as e:
        logger.exception("PDF conversion failed")
        raise RuntimeError(f"PDF conversion error: {e}")
    
    return results


def create_zip_archive(
    images: list[tuple[int, bytes, int, int]],
    fmt: str = "png",
) -> bytes:
    """
    Create a ZIP archive containing all images.
    
    Args:
        images: List of (page_number, image_bytes, width, height)
        fmt: Image format extension
    
    Returns:
        ZIP file bytes
    """
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for page_num, img_bytes, width, height in images:
            filename = f"page_{page_num:03d}.{fmt.lower()}"
            zf.writestr(filename, img_bytes)
    
    return zip_buffer.getvalue()


def get_pdf_info(pdf_bytes: bytes) -> dict:
    """
    Get PDF file information.
    
    Args:
        pdf_bytes: Raw PDF file bytes
    
    Returns:
        Dict with page_count, metadata, etc.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        info = {
            "page_count": doc.page_count,
            "metadata": doc.metadata,
            "pages": [],
        }
        
        for i in range(doc.page_count):
            page = doc[i]
            rect = page.rect
            info["pages"].append({
                "number": i + 1,
                "width": rect.width,
                "height": rect.height,
            })
        
        doc.close()
        return info
        
    except Exception as e:
        logger.exception("Failed to get PDF info")
        raise RuntimeError(f"PDF info error: {e}")
