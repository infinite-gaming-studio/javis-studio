import asyncio
import base64
import json
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import httpx
from gradio_client import Client, handle_file

from config import get_settings
from models.schemas import EmotionMode, VoiceSettings

logger = logging.getLogger(__name__)
settings = get_settings()

# Emotion hint → emo_vector mapping
# Order: [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]
_EMOTION_HINT_VECTORS: dict[str, list[float]] = {
    "happy":        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "angry":        [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "sad":          [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "afraid":       [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
    "disgusted":    [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
    "melancholic":  [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
    "surprised":    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    "calm":         [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    "neutral":      [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
}


def _decode_audio_to_tmp(audio_str: str, suffix: str = ".wav") -> str:
    """
    Accepts a base64 data URI or a URL and returns a local temp file path.
    If already a local path, returns as-is.
    """
    if audio_str.startswith("data:"):
        _, b64 = audio_str.split(",", 1)
        data = base64.b64decode(b64)
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(data)
        tmp.close()
        return tmp.name

    if audio_str.startswith("http"):
        resp = httpx.get(audio_str, timeout=30)
        resp.raise_for_status()
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(resp.content)
        tmp.close()
        return tmp.name

    # Assume local path
    return audio_str


def _build_emo_vector(
    vs: VoiceSettings,
    emotion_hint: Optional[str] = None,
) -> Optional[list[float]]:
    """Build the emo_vector for IndexTTS2 if needed."""
    if vs.emotion_mode == EmotionMode.vector and vs.emo_vector:
        return vs.emo_vector
    if emotion_hint and emotion_hint.lower() in _EMOTION_HINT_VECTORS:
        return _EMOTION_HINT_VECTORS[emotion_hint.lower()]
    return None


def _emotion_mode_to_int(mode: EmotionMode) -> int:
    """Convert EmotionMode enum to IndexTTS2 API emo_mode integer."""
    mapping = {
        EmotionMode.none: 0,      # 与音色参考音频相同
        EmotionMode.audio: 1,     # 使用情感参考音频
        EmotionMode.vector: 2,    # 使用情感向量控制
        EmotionMode.text: 3,      # 使用情感描述文本控制
    }
    return mapping.get(mode, 0)


async def synthesize_rest(
    text: str,
    voice_settings: VoiceSettings,
    output_path: str,
    emotion_hint: Optional[str] = None,
) -> str:
    """
    Call IndexTTS2 via REST API (POST /api/tts).
    
    The REST API expects multipart/form-data with:
    - text: string (required)
    - spk_audio: file (required)
    - emo_mode: int (0-3)
    - emo_alpha: float (0.0-2.0)
    - emo_audio: file (for emo_mode=1)
    - emo_vector: JSON array (for emo_mode=2)
    - emo_text: string (for emo_mode=3)
    """
    spk_path = _decode_audio_to_tmp(voice_settings.spk_audio_prompt)
    
    try:
        # Build multipart form data
        files = {}
        data = {"text": text}
        
        # Speaker audio (required)
        spk_file = open(spk_path, "rb")
        files["spk_audio"] = (os.path.basename(spk_path), spk_file, "audio/wav")
        
        # Determine emotion mode
        emo_mode = _emotion_mode_to_int(voice_settings.emotion_mode)
        
        # Emotion alpha
        if voice_settings.emo_alpha != 1.0:
            data["emo_alpha"] = str(voice_settings.emo_alpha)
        
        # Emotion reference audio (mode 1)
        emo_file = None
        if voice_settings.emotion_mode == EmotionMode.audio and voice_settings.emo_audio_prompt:
            emo_path = _decode_audio_to_tmp(voice_settings.emo_audio_prompt)
            emo_file = open(emo_path, "rb")
            files["emo_audio"] = (os.path.basename(emo_path), emo_file, "audio/wav")
        
        # Emotion vector (mode 2)
        emo_vec = _build_emo_vector(voice_settings, emotion_hint)
        if emo_vec is not None:
            data["emo_vector"] = json.dumps(emo_vec)
            if emo_mode == 0:  # If mode was None, force Vector mode (2) to apply standard emotion vector
                emo_mode = 2
        
        # Emotion text (mode 3)
        if voice_settings.emotion_mode == EmotionMode.text and voice_settings.emo_text:
            data["emo_text"] = voice_settings.emo_text
            
        data["emo_mode"] = str(emo_mode)
        
        # Optional parameters for generation control
        if voice_settings.use_random:
            data["use_random"] = "true"
        if not voice_settings.do_sample:
            data["do_sample"] = "false"
        if voice_settings.top_p != 0.8:
            data["top_p"] = str(voice_settings.top_p)
        if voice_settings.top_k != 30:
            data["top_k"] = str(voice_settings.top_k)
        if voice_settings.temperature != 0.8:
            data["temperature"] = str(voice_settings.temperature)
        if voice_settings.length_penalty != 0.0:
            data["length_penalty"] = str(voice_settings.length_penalty)
        if voice_settings.num_beams != 3:
            data["num_beams"] = str(voice_settings.num_beams)
        if voice_settings.repetition_penalty != 10.0:
            data["repetition_penalty"] = str(voice_settings.repetition_penalty)
        if voice_settings.max_mel_tokens != 1500:
            data["max_mel_tokens"] = str(voice_settings.max_mel_tokens)
        if voice_settings.max_text_tokens_per_segment != 120:
            data["max_text_tokens_per_segment"] = str(voice_settings.max_text_tokens_per_segment)
        if voice_settings.speed != 1.0:
            data["speed"] = str(voice_settings.speed)

        # Build headers with optional auth
        headers = {}
        if settings.indextts_api_token:
            headers["Authorization"] = f"Bearer {settings.indextts_api_token}"
        
        # Make the API call
        api_url = f"{settings.indextts_api_url.rstrip('/')}/api/tts"
        
        # Log outgoing payload for debugging and verification
        safe_data = {k: v for k, v in data.items() if k != "spk_audio" and k != "emo_audio"}
        logger.info(f"[IndexTTS2 REST] Sending request to {api_url} with data: {safe_data}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                api_url,
                files=files,
                data=data,
                headers=headers,
            )
        
        # Close file handles
        spk_file.close()
        if emo_file:
            emo_file.close()
        
        # Check response
        if response.status_code == 503:
            raise RuntimeError("IndexTTS2 模型未加载，请稍后重试")
        
        if response.status_code == 400:
            error_msg = response.json().get("error", "请求参数错误")
            raise ValueError(f"IndexTTS2 参数错误: {error_msg}")
        
        if response.status_code == 401:
            raise PermissionError("IndexTTS2 API Token 无效")
        
        if response.status_code != 200:
            error_msg = response.text
            raise RuntimeError(f"IndexTTS2 合成失败 ({response.status_code}): {error_msg}")
        
        # Response is audio binary (WAV)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(response.content)
        
        logger.info("TTS synthesis done (REST) → %s", output_path)
        return output_path
        
    finally:
        # Cleanup temp files if we created them
        if spk_path != voice_settings.spk_audio_prompt and os.path.exists(spk_path):
            os.unlink(spk_path)


async def synthesize_gradio(
    text: str,
    voice_settings: VoiceSettings,
    output_path: str,
    emotion_hint: Optional[str] = None,
) -> str:
    """
    Call IndexTTS2 via Gradio client API (legacy mode).

    The Gradio API for IndexTTS2 WebUI exposes tts inference under the
    /gen_single endpoint (as identified from the webui source).
    We run this in a thread executor since gradio_client is synchronous.
    """

    def _call():
        client = Client(settings.indextts_api_url)

        spk_path = _decode_audio_to_tmp(voice_settings.spk_audio_prompt)
        try:
            # Build kwargs based on emotion mode
            kwargs: dict = {
                "prompt": handle_file(spk_path),
                "input_text": text,
                "infer_mode": "预训练音色",  # default mode: voice clone
            }

            if voice_settings.emotion_mode == EmotionMode.audio and voice_settings.emo_audio_prompt:
                emo_path = _decode_audio_to_tmp(voice_settings.emo_audio_prompt)
                kwargs["emo_audio"] = handle_file(emo_path)
                kwargs["infer_mode"] = "情感复刻"

            emo_vec = _build_emo_vector(voice_settings, emotion_hint)
            if emo_vec is not None:
                # Pass via emo_vector — map to individual float sliders if the API requires
                # IndexTTS Gradio API passes emo vector as a list of 8 floats
                kwargs["emo_happy"] = emo_vec[0]
                kwargs["emo_angry"] = emo_vec[1]
                kwargs["emo_sad"] = emo_vec[2]
                kwargs["emo_afraid"] = emo_vec[3]
                kwargs["emo_disgusted"] = emo_vec[4]
                kwargs["emo_melancholic"] = emo_vec[5]
                kwargs["emo_surprised"] = emo_vec[6]
                kwargs["emo_calm"] = emo_vec[7]
                kwargs["infer_mode"] = "情感控制"

            if voice_settings.emotion_mode == EmotionMode.text:
                kwargs["emo_text"] = voice_settings.emo_text or ""
                kwargs["use_emo_text"] = True
                kwargs["emo_alpha"] = voice_settings.emo_alpha
                kwargs["infer_mode"] = "情感控制"

            if voice_settings.emotion_mode == EmotionMode.audio:
                kwargs["emo_alpha"] = voice_settings.emo_alpha

            result = client.predict(**kwargs, api_name="/gen_single")
            # result is typically a file path or URL returned by Gradio
            return result

        finally:
            # Cleanup temp spk file if we created one
            if spk_path != voice_settings.spk_audio_prompt and os.path.exists(spk_path):
                os.unlink(spk_path)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _call)

    # Copy result to our output_path
    import shutil
    if isinstance(result, (list, tuple)):
        result = result[0]
    # result may be a dict like {"name": "/tmp/xxx.wav", ...} from Gradio
    if isinstance(result, dict):
        result = result.get("name") or result.get("path") or list(result.values())[0]

    shutil.copy2(str(result), output_path)
    logger.info("TTS synthesis done (Gradio) → %s", output_path)
    return output_path


async def synthesize(
    text: str,
    voice_settings: VoiceSettings,
    output_dir: str,
    filename: Optional[str] = None,
    emotion_hint: Optional[str] = None,
) -> str:
    """
    High-level synthesis entry point.
    Returns the absolute path to the generated WAV file.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    fname = filename or f"{uuid.uuid4().hex}.wav"
    output_path = str(Path(output_dir) / fname)

    mode = settings.indextts_mode.lower()
    if mode == "rest":
        return await synthesize_rest(text, voice_settings, output_path, emotion_hint)
    elif mode == "gradio":
        return await synthesize_gradio(text, voice_settings, output_path, emotion_hint)

    raise NotImplementedError(f"Unsupported indextts_mode: {mode}")
