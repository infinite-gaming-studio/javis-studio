"use client";
import { useState, useRef } from "react";
import {
  type VoiceSettings as TVoiceSettings,
  ScriptSegment,
  AudioSegmentResult,
  generateScript,
  ttsSingle,
} from "@/lib/api";

import {
  Sparkles,
  Settings,
  Mic2,
  Square,
  Play,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react";

import ImageUploader from "@/components/ImageUploader";
import PromptEditor from "@/components/PromptEditor";
import ScriptPreview from "@/components/ScriptPreview";
import VoiceSettingsPanel from "@/components/VoiceSettings";
import AudioPlayer from "@/components/AudioPlayer";
import SettingsModal from "@/components/SettingsModal";

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3 h-14 px-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Mic2 className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            Javis Studio
          </span>
          <span className="text-xs text-slate-400 font-medium ml-1">AI 旁白生成工作台</span>
          <div className="ml-auto flex items-center gap-3">
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all duration-300 ${step === "error" ? "bg-red-50 text-red-600 border-red-100" :
              step === "done" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                step === "idle" ? "bg-slate-50 text-slate-500 border-slate-100" :
                  "bg-cyan-50 text-cyan-600 border-cyan-100 animate-pulse shadow-sm shadow-cyan-500/10"
              }`}>
              {step === "error" ? <AlertCircle className="w-3 h-3" /> :
                step === "done" ? <CheckCircle2 className="w-3 h-3" /> :
                  step === "idle" ? <Clock className="w-3 h-3" /> :
                    <Sparkles className="w-3 h-3 animate-pulse" />}
              {step === "idle" && "就绪"}
              {step === "scripting" && "AI 生成脚本中…"}
              {step === "synthesizing" && "语音合成中…"}
              {step === "done" && "完成"}
              {step === "error" && "出错了"}
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all duration-200 border border-transparent hover:border-slate-200 shadow-none hover:shadow-sm"
              title="全局设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-screen-xl mx-auto px-6 py-6 grid grid-cols-12 gap-5 h-[calc(100vh-3.5rem)] overflow-hidden">

        <aside className="col-span-3 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-5 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-5">
              <ImageUploader images={images} onChange={setImages} />
              <PromptEditor topic={topic} onTopicChange={setTopic} value={prompt} onChange={setPrompt} />
            </div>
            <div className="pt-4 border-t border-slate-200/60">
              <button
                onClick={handleGenerateScript}
                disabled={!canGenScript || step === "scripting"}
                className="group w-full py-2.5 rounded-xl text-sm text-white font-semibold transition-all duration-300
                           bg-gradient-to-r from-cyan-500 to-blue-500
                           hover:from-cyan-600 hover:to-blue-600
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40
                           flex items-center justify-center gap-2"
              >
                {step === "scripting" ? (
                  <Sparkles className="w-4 h-4 animate-spin-slow" />
                ) : (
                  <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
                {step === "scripting" ? "生成中…" : "生成旁白脚本"}
              </button>
            </div>
          </div>
        </aside>

        <section className="col-span-5 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-4 min-h-0">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ScriptPreview
                segments={script}
                onChange={setScript}
                loading={step === "scripting"}
              />
            </div>

            {/* Generate audio CTA */}
            {script.length > 0 && (
              <div className="pt-2 border-t border-slate-200/60 mt-auto">
                {!canGenAudio && (
                  <div className="flex items-center gap-2 text-amber-500 mb-2 px-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <p className="text-[11px] font-bold uppercase tracking-tight">请先在右侧上传参考说话人音频</p>
                  </div>
                )}
                {step === "synthesizing" ? (
                  <button
                    onClick={handleCancelGeneration}
                    className="w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-300
                               bg-gradient-to-r from-red-500 to-rose-500
                               hover:from-red-600 hover:to-rose-600
                               shadow-md shadow-red-500/20 hover:shadow-lg hover-shadow-red-500/40 animate-pulse
                               flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    取消生成
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAudio}
                    disabled={!canGenAudio}
                    className="group w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-300
                               bg-gradient-to-r from-emerald-500 to-teal-500
                               hover:from-emerald-600 hover:to-teal-600
                               disabled:opacity-50 disabled:cursor-not-allowed
                               shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/40
                               flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 group-hover:scale-110 transition-transform fill-white" />
                    {segments.length > 0 && segments.length < script.length ? "继续合成语音" : "合成全部语音"}
                  </button>
                )}
              </div>
            )}

            {/* Error */}
            {step === "error" && error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </section>

        <aside className="col-span-4 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-4 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-4">
              <VoiceSettingsPanel value={voiceSettings} onChange={setVoiceSettings} />
              <AudioPlayer
                segments={segments}
                finalAudioUrl={finalAudioUrl}
                loading={step === "synthesizing"}
              />
            </div>
          </div>
        </aside>

      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
