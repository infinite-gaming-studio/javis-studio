# Javis Studio

**Javis Studio** is an AI-powered voiceover studio. It takes product images and prompts, uses a Vision-Language Model (OpenAI GPT-4o or Google Gemini) to draft professional narration scripts, and synthesizes continuous highly-expressive audio using the **IndexTTS2 API**.

## Features

- **End-to-End Pipeline**: Image + Prompt → LLM Script → IndexTTS2 Audio.
- **Visual Editing**: Edit the drafted script segment-by-segment before synthesis.
- **Emotion Control**: Assign emotion hints (Happy, Calm, Sad, etc.) individually to segments.
- **Voice Cloning**: Provide a simple `<speaker>.wav` file to clone the speaker's voice.
- **Multiple Emotion Modes**: Use an audio prompt, a 8-dim vector, text prompts, or purely the script context to guide emotions.
- **Continuous Concatenation**: Auto-join synthesized segments into a single cohesive audio track.

## Architecture

* **Backend**: FastAPI (Python), `pydub` (Audio), `gradio_client` (IndexTTS API).
* **Frontend**: Next.js, Tailwind CSS.

## Getting Started

1. Set up the environment variables:
   ```bash
   cp .env.example .env
   # Edit .env and supply your LLM keys (OpenAI or Gemini)
   ```

2. Make sure you have a locally (or remotely) running IndexTTS2 Gradio WebUI instance. The app uses `http://localhost:7860` as the default endpoint.

3. Run locally via Docker Compose:
   ```bash
   docker-compose up --build
   ```
   **OR** run manually:
   ```bash
   # Backend
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload

   # Frontend
   cd frontend
   npm install
   npm run dev
   ```

4. Open your browser and go to `http://localhost:3000`.

## Audio Settings for IndexTTS2

When using Javis Studio, you must upload a **Speaker Reference Audio** (`.wav` or `.mp3`). IndexTTS2 uses this to perform zero-shot cloning.

You can then select how to control emotion:
- **Audio Mode**: Upload a reference audio and set an emotion strength alpha.
- **Vector Mode**: Manually tweak the 8-dim emotion space.
- **Text Mode**: Input an emotional descriptor (e.g. "excited and fast").
- **Script Mode**: Let IndexTTS infer emotions directly from the script context.
