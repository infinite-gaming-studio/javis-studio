from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class EmotionMode(str, Enum):
    """How to control emotion for TTS synthesis. Matches Index-TTS API."""
    none = "none"                  # No emotion control (voice clone only)
    audio = "audio"                # Use emo_audio_prompt reference audio (情感复刻)
    vector = "vector"              # Use 8-float emo_vector directly (情感控制 via vector)
    text = "text"                  # Use emo_text description (情感控制 via text)


class VoiceSettings(BaseModel):
    """Per-request TTS voice and emotion settings."""
    # Reference speaker audio — base64-encoded WAV, or a URL, or a server-side filename
    spk_audio_prompt: str = Field(..., description="Reference speaker audio (base64 WAV data URI, URL, or filename)")

    # Emotion
    emotion_mode: EmotionMode = EmotionMode.none
    emo_audio_prompt: Optional[str] = Field(None, description="Emotional reference audio (base64, URL, or filename)")
    emo_alpha: float = Field(1.0, ge=0.0, le=2.0, description="Emotion influence (0.0-2.0, higher values = stronger expression)")
    # [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]
    emo_vector: Optional[list[float]] = Field(None, min_length=8, max_length=8, description="8-element emotion vector")
    emo_text: Optional[str] = Field(None, description="Text emotion description (used when emotion_mode=text)")
    use_random: bool = Field(False, description="Enable stochastic inference (reduces voice fidelity)")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed ratio (0.5=slow, 1.0=normal, 2.0=fast)")

    # New sampling and control parameters
    do_sample: bool = Field(True, description="Whether to perform sampling")
    top_p: float = Field(0.8, description="Top-p sampling parameter")
    top_k: int = Field(30, description="Top-k sampling parameter")
    temperature: float = Field(0.8, description="Temperature parameter")
    length_penalty: float = Field(0.0, description="Length penalty")
    num_beams: int = Field(3, description="Beam search width")
    repetition_penalty: float = Field(10.0, description="Repetition penalty")
    max_mel_tokens: int = Field(1500, description="Max generated mel tokens")
    max_text_tokens_per_segment: int = Field(120, description="Max text tokens per sub-segment")


class ScriptSegment(BaseModel):
    """A single narration segment from the LLM."""
    index: int
    text: str
    emotion_hint: Optional[str] = None    # e.g. "excited", "calm", "sad", or custom ID
    speaker: Optional[str] = None         # future: multi-speaker

    # Optional fields for segment-level custom emotion overrides
    emo_mode: Optional[EmotionMode] = None
    emo_alpha: Optional[float] = None
    emo_vector: Optional[list[float]] = None
    emo_text: Optional[str] = None


class StudioRequest(BaseModel):
    """Request to the full studio pipeline (image → script → TTS)."""
    # Images: list of base64 data URIs or public URLs
    images: list[str] = Field(default_factory=list, description="Image inputs (base64 data URIs or URLs)")
    # Prompt context / narrative direction
    prompt: str = Field(..., description="User prompt / context for the LLM")
    # Optional: provide pre-written script to skip LLM step
    override_script: Optional[list[ScriptSegment]] = None

    voice_settings: VoiceSettings
    # If True, also concatenate all segments into a final combined audio
    concat_final: bool = True


class ScriptOnlyRequest(BaseModel):
    """Request to only generate a narration script from images + prompt."""
    images: list[str] = Field(default_factory=list)
    prompt: str
    language: str = "zh"     # output script language hint


class TTSSingleRequest(BaseModel):
    """Request to synthesize TTS for a single text segment."""
    text: str
    voice_settings: VoiceSettings


class AudioSegmentResult(BaseModel):
    segment_index: int
    text: str
    audio_url: str
    duration_secs: Optional[float] = None


class StudioGenerateResponse(BaseModel):
    """Full pipeline response."""
    script: list[ScriptSegment]
    segments: list[AudioSegmentResult]
    final_audio_url: Optional[str] = None   # only if concat_final=True


class ScriptOnlyResponse(BaseModel):
    script: list[ScriptSegment]


class TTSSingleResponse(BaseModel):
    audio_url: str
    duration_secs: Optional[float] = None


# PDF to Image schemas
class PDFPageImage(BaseModel):
    """Single converted page image."""
    page: int = Field(..., description="Page number (1-indexed)")
    image_base64: str = Field(..., description="Base64-encoded image data")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")


class PDFConvertResponse(BaseModel):
    """Response for PDF conversion with base64 images."""
    format: str = Field(..., description="Image format (png, jpeg, webp)")
    pages: list[PDFPageImage] = Field(..., description="List of converted pages")


class PDFPageInfo(BaseModel):
    """Information about a single PDF page."""
    number: int
    width: float
    height: float


class PDFInfoResponse(BaseModel):
    """Response for PDF info endpoint."""
    page_count: int
    metadata: dict
    pages: list[PDFPageInfo]
