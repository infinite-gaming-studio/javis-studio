"use client";
import { useState } from "react";
import {
  type VoiceSettings as TVoiceSettings,
  ScriptSegment,
  AudioSegmentResult,
  generateScript,
  generateFull,
} from "@/lib/api";

import ImageUploader from "@/components/ImageUploader";
import PromptEditor from "@/components/PromptEditor";
import ScriptPreview from "@/components/ScriptPreview";
import VoiceSettingsPanel from "@/components/VoiceSettings";
import AudioPlayer from "@/components/AudioPlayer";

const DEFAULT_VOICE: TVoiceSettings = {
  spk_audio_prompt: "",
  emotion_mode: "none",
  emo_alpha: 1.0,
  use_random: false,
};

type Step = "idle" | "scripting" | "synthesizing" | "done" | "error";

export default function StudioPage() {
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [voiceSettings, setVoiceSettings] = useState<TVoiceSettings>(DEFAULT_VOICE);

  const [script, setScript] = useState<ScriptSegment[]>([]);
  const [segments, setSegments] = useState<AudioSegmentResult[]>([]);
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | undefined>();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");

  const canGenScript = prompt.trim().length > 0;
  const canGenAudio = script.length > 0 && voiceSettings.spk_audio_prompt;

  const handleGenerateScript = async () => {
    setError("");
    setStep("scripting");
    setScript([]);
    setSegments([]);
    setFinalAudioUrl(undefined);
    try {
      const res = await generateScript(images, prompt);
      setScript(res.script);
      setStep("idle");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "脚本生成失败");
      setStep("error");
    }
  };

  const handleGenerateAudio = async () => {
    setError("");
    setStep("synthesizing");
    setSegments([]);
    setFinalAudioUrl(undefined);
    try {
      const res = await generateFull(images, prompt, voiceSettings, script, true);
      setScript(res.script);
      setSegments(res.segments);
      setFinalAudioUrl(res.final_audio_url);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "音频合成失败");
      setStep("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#0d0f14]/90 backdrop-blur">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3 h-14 px-6">
          <span className="text-xl">🎙️</span>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Javis Studio
          </span>
          <span className="text-xs text-slate-600 ml-1">AI 旁白生成工作台</span>
          <div className="ml-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${step === "error" ? "bg-red-400" : step === "done" ? "bg-emerald-400" : step === "idle" ? "bg-slate-600" : "bg-violet-400 animate-pulse"}`} />
            <span className="text-xs text-slate-500">
              {step === "idle" && "就绪"}
              {step === "scripting" && "AI 生成脚本中…"}
              {step === "synthesizing" && "语音合成中…"}
              {step === "done" && "完成"}
              {step === "error" && "出错了"}
            </span>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-screen-xl mx-auto px-6 py-6 grid grid-cols-12 gap-5">

        {/* ── Left Panel: Inputs ── */}
        <aside className="col-span-3 space-y-5">
          <div className="sticky top-[72px] space-y-5">
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-4">
              <ImageUploader images={images} onChange={setImages} />
            </div>
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-4">
              <PromptEditor value={prompt} onChange={setPrompt} />
              <button
                onClick={handleGenerateScript}
                disabled={!canGenScript || step === "scripting"}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                           bg-gradient-to-r from-violet-600 to-indigo-600
                           hover:from-violet-500 hover:to-indigo-500
                           disabled:opacity-40 disabled:cursor-not-allowed
                           shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40"
              >
                {step === "scripting" ? "生成中…" : "✨ 生成旁白脚本"}
              </button>
            </div>
          </div>
        </aside>

        {/* ── Middle Panel: Script ── */}
        <section className="col-span-5">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-4">
            <ScriptPreview
              segments={script}
              onChange={setScript}
              loading={step === "scripting"}
            />

            {/* Generate audio CTA */}
            {script.length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                {!canGenAudio && (
                  <p className="text-xs text-amber-400 mb-2">⚠️ 请先在右侧上传参考说话人音频</p>
                )}
                <button
                  onClick={handleGenerateAudio}
                  disabled={!canGenAudio || step === "synthesizing"}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200
                             bg-gradient-to-r from-emerald-600 to-teal-600
                             hover:from-emerald-500 hover:to-teal-500
                             disabled:opacity-40 disabled:cursor-not-allowed
                             shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                  {step === "synthesizing" ? "合成中…" : "🔊 合成全部语音"}
                </button>
              </div>
            )}

            {/* Error */}
            {step === "error" && error && (
              <div className="rounded-xl bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-300">
                ❌ {error}
              </div>
            )}
          </div>
        </section>

        {/* ── Right Panel: Voice & Audio ── */}
        <aside className="col-span-4 space-y-4">
          <div className="sticky top-[72px] space-y-4">
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
              <VoiceSettingsPanel value={voiceSettings} onChange={setVoiceSettings} />
            </div>
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
              <AudioPlayer
                segments={segments}
                finalAudioUrl={finalAudioUrl}
                loading={step === "synthesizing"}
              />
            </div>
          </div>
        </aside>

      </main>
    </div>
  );
}
