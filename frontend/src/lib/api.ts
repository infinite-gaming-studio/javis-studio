// API client for Javis Studio backend

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmotionMode = "none" | "audio" | "vector" | "text";

export interface VoiceSettings {
  spk_audio_prompt: string; // base64 data URI or URL
  emotion_mode: EmotionMode;
  emo_audio_prompt?: string;
  emo_alpha: number; // 0.0–1.0
  emo_vector?: number[]; // 8 floats
  emo_text?: string;
  use_random: boolean;
  speed?: number; // 0.5–2.0, default 1.0
  do_sample?: boolean;
  top_p?: number;
  top_k?: number;
  temperature?: number;
  length_penalty?: number;
  num_beams?: number;
  repetition_penalty?: number;
  max_mel_tokens?: number;
  max_text_tokens_per_segment?: number;
}

export interface ScriptSegment {
  index: number;
  text: string;
  emotion_hint?: string;
  speaker?: string;
  emo_mode?: EmotionMode;
  emo_alpha?: number;
  emo_vector?: number[];
  emo_text?: string;
}

/** A single generated audio version for one script segment. */
export interface AudioVersion {
  /** UUID assigned by the backend path e.g. "single/abc123.wav" */
  audio_url: string;
  duration_secs?: number;
  /** When this version was generated (ISO string) */
  createdAt: string;
  /** Optional label, e.g. "版本 1", "版本 2" */
  label?: string;
}

export interface AudioSegmentResult {
  segment_index: number;
  text: string;
  /** Legacy single URL kept for backward-compat */
  audio_url: string;
  duration_secs?: number;
  /** All generated audio versions for this segment */
  versions: AudioVersion[];
  /** Index into `versions` that is the currently selected/active version */
  selectedVersionIndex: number;
}

export interface StudioGenerateResponse {
  script: ScriptSegment[];
  segments: AudioSegmentResult[];
  final_audio_url?: string;
}

// ─── New Architecture Types ───────────────────────────────────────────────────

export interface CustomEmotion {
  id: string;
  name: string;
  mode: EmotionMode;
  alpha: number;
  vector?: number[];
  text?: string;
  speed?: number; // 0.5–2.0, undefined = follow global
}export interface AudioClip {
  id: string;             // unique ID
  text: string;           // script text
  emotion_hint?: string;  // user selected emotion
  // Results
  audio_url?: string;
  duration_secs?: number;
}

export interface ProjectPage {
  id: string;
  pageIndex: number;
  image?: string;         // base64 or URL
  title?: string;         // user defined page title / notes
  clips: AudioClip[];     // The M audio segments for this page
}

export interface ScriptOnlyResponse {
  script: ScriptSegment[];
}

export interface TTSSingleResponse {
  audio_url: string;
  duration_secs?: number;
}

export interface GlobalSettings {
  llmApiUrl: string;
  llmToken: string;
  llmModel: string;
  ttsApiUrl: string;
  ttsToken: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
  youtubeApiKey: string;
  youtubeCookiesPath: string;
  unsplashApiKey: string;
  customEmotions: CustomEmotion[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getSettings(): GlobalSettings {
  if (typeof window === "undefined") return { llmApiUrl: "", llmToken: "", llmModel: "", ttsApiUrl: "", ttsToken: "", pexelsApiKey: "", pixabayApiKey: "", youtubeApiKey: "", youtubeCookiesPath: "", unsplashApiKey: "", customEmotions: [] };
  const saved = localStorage.getItem("javis_studio_settings");
  if (!saved) return { llmApiUrl: "", llmToken: "", llmModel: "gpt-3.5-turbo", ttsApiUrl: "", ttsToken: "", pexelsApiKey: "", pixabayApiKey: "", youtubeApiKey: "", youtubeCookiesPath: "", unsplashApiKey: "", customEmotions: [] };
  try {
    const parsed = JSON.parse(saved);
    if (!parsed.customEmotions) parsed.customEmotions = [];
    return parsed;
  } catch {
    return { llmApiUrl: "", llmToken: "", llmModel: "gpt-3.5-turbo", ttsApiUrl: "", ttsToken: "", pexelsApiKey: "", pixabayApiKey: "", youtubeApiKey: "", youtubeCookiesPath: "", unsplashApiKey: "", customEmotions: [] };
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const settings = getSettings();

  // Use local proxy for all /api/studio calls
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-llm-url": settings.llmApiUrl,
      "x-llm-token": settings.llmToken,
      "x-llm-model": settings.llmModel,
      "x-tts-url": settings.ttsApiUrl,
      "x-tts-token": settings.ttsToken,
      "x-pexels-key": settings.pexelsApiKey || "",
      "x-pixabay-key": settings.pixabayApiKey || "",
      "x-youtube-key": settings.youtubeApiKey || "",
      "x-unsplash-key": settings.unsplashApiKey || "",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }));
    throw new Error(err.error || err.detail || err.message || "Request failed");
  }
  return res.json();
}

export function audioUrl(path: string): string {
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (path.startsWith("/audio/")) return path;
  // Backend audio paths like /api/studio/audio/single/{uuid}.wav
  // are proxied through the Next.js API route
  if (path.startsWith("/api/studio/audio/")) return path;

  const settings = getSettings();
  const base = settings.ttsApiUrl || "http://localhost:8000";
  const baseUrl = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
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

/**
 * Generate one new audio version for a segment and return an AudioVersion object.
 * Callers should push the returned value into `segment.versions`.
 */
export async function ttsSingleVersion(
  text: string,
  voiceSettings: VoiceSettings,
  label?: string
): Promise<AudioVersion> {
  const res = await ttsSingle(text, voiceSettings);
  return {
    audio_url: res.audio_url,
    duration_secs: res.duration_secs,
    createdAt: new Date().toISOString(),
    label: label ?? "",
  };
}

/** Helper: create a fresh AudioSegmentResult from a first-version response. */
export function makeSegmentResult(
  segmentIndex: number,
  text: string,
  version: AudioVersion
): AudioSegmentResult {
  return {
    segment_index: segmentIndex,
    text,
    audio_url: version.audio_url,
    duration_secs: version.duration_secs,
    versions: [version],
    selectedVersionIndex: 0,
  };
}

/** Helper: append a new version to an existing segment result (immutable). */
export function appendVersion(
  seg: AudioSegmentResult,
  version: AudioVersion
): AudioSegmentResult {
  const versions = [...seg.versions, version];
  return {
    ...seg,
    versions,
    selectedVersionIndex: versions.length - 1, // auto-select newest
    audio_url: version.audio_url,
    duration_secs: version.duration_secs,
  };
}

/** Helper: select a specific version of a segment (immutable). */
export function selectVersion(
  seg: AudioSegmentResult,
  versionIndex: number
): AudioSegmentResult {
  const version = seg.versions[versionIndex];
  if (!version) return seg;
  return {
    ...seg,
    selectedVersionIndex: versionIndex,
    audio_url: version.audio_url,
    duration_secs: version.duration_secs,
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
