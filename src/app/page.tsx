"use client";
import { useState, useRef } from "react";
import {
  type VoiceSettings as TVoiceSettings,
  ScriptSegment,
  AudioSegmentResult,
  generateScript,
  ttsSingle,
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
  const [topic, setTopic] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [voiceSettings, setVoiceSettings] = useState<TVoiceSettings>(DEFAULT_VOICE);

  const [script, setScript] = useState<ScriptSegment[]>([]);
  const [segments, setSegments] = useState<AudioSegmentResult[]>([]);
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | undefined>();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const canGenScript = topic.trim().length > 0 || prompt.trim().length > 0;
  const canGenAudio = script.length > 0 && voiceSettings.spk_audio_prompt;

  const handleGenerateScript = async () => {
    setError("");
    setStep("scripting");
    setScript([]);
    setSegments([]);
    setFinalAudioUrl(undefined);
    try {
      const fullPrompt = topic ? `主题：${topic}\n\n${prompt}` : prompt;
      const res = await generateScript(images, fullPrompt);
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

    // Create an abort controller to support cancellation
    abortControllerRef.current = new AbortController();
    const newSegments = [...segments];

    try {
      for (const seg of script) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }

        const existing = newSegments.find(s => s.segment_index === seg.index);
        if (existing && existing.text === seg.text) {
          continue; // Already generated this text
        }

        const res = await ttsSingle(seg.text, voiceSettings);

        const generated: AudioSegmentResult = {
          segment_index: seg.index,
          text: seg.text,
          audio_url: res.audio_url,
          duration_secs: res.duration_secs
        };

        const eIdx = newSegments.findIndex(s => s.segment_index === seg.index);
        if (eIdx >= 0) {
          newSegments[eIdx] = generated;
        } else {
          newSegments.push(generated);
        }

        // Progressively update state
        setSegments([...newSegments]);
      }

      if (abortControllerRef.current.signal.aborted) {
        setStep("idle");
        return;
      }

      // Concatenate local audio files
      if (newSegments.length > 0) {
        newSegments.sort((a, b) => a.segment_index - b.segment_index);
        const urls = newSegments.map(s => s.audio_url);

        const concatRes = await fetch("/api/studio/concat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls })
        });

        if (!concatRes.ok) {
          throw new Error("拼接音频失败");
        }
        const { url } = await concatRes.json();
        setFinalAudioUrl(url);
      }

      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "音频合成失败");
      setStep("error");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-800 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3 h-14 px-6">
          <span className="text-xl">🎙️</span>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Javis Studio
          </span>
          <span className="text-xs text-slate-500 ml-1">AI 旁白生成工作台</span>
          <div className="ml-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${step === "error" ? "bg-red-400" : step === "done" ? "bg-emerald-400" : step === "idle" ? "bg-slate-400" : "bg-violet-500 animate-pulse"}`} />
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
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-slate-200/40 p-4 space-y-4">
              <ImageUploader images={images} onChange={setImages} />
            </div>
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-slate-200/40 p-4 space-y-4">
              <PromptEditor topic={topic} onTopicChange={setTopic} value={prompt} onChange={setPrompt} />
              <button
                onClick={handleGenerateScript}
                disabled={!canGenScript || step === "scripting"}
                className="w-full py-2.5 rounded-xl text-sm text-white font-semibold transition-all duration-200
                           bg-gradient-to-r from-violet-500 to-indigo-500
                           hover:from-violet-600 hover:to-indigo-600
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/40"
              >
                {step === "scripting" ? "生成中…" : "✨ 生成旁白脚本"}
              </button>
            </div>
          </div>
        </aside>

        {/* ── Middle Panel: Script ── */}
        <section className="col-span-5">
          <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-slate-200/40 p-4 space-y-4">
            <ScriptPreview
              segments={script}
              onChange={setScript}
              loading={step === "scripting"}
            />

            {/* Generate audio CTA */}
            {script.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                {!canGenAudio && (
                  <p className="text-xs text-amber-400 mb-2">⚠️ 请先在右侧上传参考说话人音频</p>
                )}
                {step === "synthesizing" ? (
                  <button
                    onClick={handleCancelGeneration}
                    className="w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-200
                               bg-gradient-to-r from-red-500 to-rose-500
                               hover:from-red-600 hover:to-rose-600
                               shadow-md shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/40 animate-pulse"
                  >
                    ⏹ 取消生成
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAudio}
                    disabled={!canGenAudio}
                    className="w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-200
                               bg-gradient-to-r from-emerald-500 to-teal-500
                               hover:from-emerald-600 hover:to-teal-600
                               disabled:opacity-50 disabled:cursor-not-allowed
                               shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/40"
                  >
                    🔊 {segments.length > 0 && segments.length < script.length ? "继续合成语音" : "合成全部语音"}
                  </button>
                )}
              </div>
            )}

            {/* Error */}
            {step === "error" && error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                ❌ {error}
              </div>
            )}
          </div>
        </section>

        {/* ── Right Panel: Voice & Audio ── */}
        <aside className="col-span-4 space-y-4">
          <div className="sticky top-[72px] space-y-4">
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-slate-200/40 p-4">
              <VoiceSettingsPanel value={voiceSettings} onChange={setVoiceSettings} />
            </div>
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-slate-200/40 p-4">
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
