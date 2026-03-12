# IndexTTS2 API Reference for Javis Studio

Javis Studio utilizes the **IndexTTS2 Gradio API** (specifically the `/gen_single` endpoint) for speech synthesis.

## Core Parameters

When synthesizing audio, Javis Studio sends the following context to the remote IndexTTS (default `http://localhost:7860`):

### 1. Voice Cloning (Zero-Shot)
* `prompt` (File): The speaker reference audio to clone.
* `input_text` (String): The text segment to synthesize.
* `infer_mode` (String): Determines behavior mode. Default for pure cloning is `预训练音色`.

### 2. Emotion via Reference Audio
* `emo_audio` (File): Secondary reference audio carrying the desired emotion.
* `emo_alpha` (Float): Emotion strength constraint, typical range `0.0 - 1.0`.
* `infer_mode`: Switches to `情感复刻`.

### 3. Emotion via Multi-dimensional Vector
IndexTTS2 supports an 8-float emotional coordinate space. Order is fixed:
`[Happy, Angry, Sad, Afraid, Disgusted, Melancholic, Surprised, Calm]`
* These 8 parameters are supplied individually in the Gradio API as `emo_happy`, `emo_angry`, etc.
* `infer_mode`: Switches to `情感控制`.

### 4. Text-Guided Emotion (prompt-based)
* `emo_text` (String): Custom textual description of emotion.
* `use_emo_text` (Boolean): Enable text-guided emotion.
* `emo_alpha` (Float): Mixing weight.
* `infer_mode`: `情感控制`.

## Supported Backend Environment Variables
Ensure the following exist in your `.env`:
* `INDEXTTS_API_URL`=http://localhost:7860
* `INDEXTTS_MODE`=gradio
