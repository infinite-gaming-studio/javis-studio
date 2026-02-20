// API client for Javis Studio backend

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmotionMode = "none" | "audio" | "vector" | "text" | "text_from_script";

export interface VoiceSettings {
  spk_audio_prompt: string; // base64 data URI or URL
  emotion_mode: EmotionMode;
  emo_audio_prompt?: string;
  emo_alpha: number; // 0.0–1.0
  emo_vector?: number[]; // 8 floats
  emo_text?: string;
  use_random: boolean;
}

export interface ScriptSegment {
  index: number;
  text: string;
  emotion_hint?: string;
  speaker?: string;
}

export interface AudioSegmentResult {
  segment_index: number;
  text: string;
  audio_url: string;
  duration_secs?: number;
}

export interface StudioGenerateResponse {
  script: ScriptSegment[];
  segments: AudioSegmentResult[];
  final_audio_url?: string;
}

export interface ScriptOnlyResponse {
  script: ScriptSegment[];
}

export interface TTSSingleResponse {
  audio_url: string;
  duration_secs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

export function audioUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function generateScript(
  images: string[],
  prompt: string,
  language = "zh"
): Promise<ScriptOnlyResponse> {
  return post<ScriptOnlyResponse>("/api/studio/script", { images, prompt, language });
}

export async function generateFull(
  images: string[],
  prompt: string,
  voiceSettings: VoiceSettings,
  overrideScript?: ScriptSegment[],
  concatFinal = true
): Promise<StudioGenerateResponse> {
  return post<StudioGenerateResponse>("/api/studio/generate", {
    images,
    prompt,
    voice_settings: voiceSettings,
    override_script: overrideScript,
    concat_final: concatFinal,
  });
}

export async function ttsSingle(
  text: string,
  voiceSettings: VoiceSettings
): Promise<TTSSingleResponse> {
  return post<TTSSingleResponse>("/api/studio/tts", {
    text,
    voice_settings: voiceSettings,
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
