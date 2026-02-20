"use client";
import { useEffect, useRef, useState } from "react";
import { AudioSegmentResult, audioUrl } from "@/lib/api";

interface Props {
    segments: AudioSegmentResult[];
    finalAudioUrl?: string;
    loading?: boolean;
}

function SegmentPlayer({ seg }: { seg: AudioSegmentResult }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) { audio.pause(); setPlaying(false); }
        else { audio.play(); setPlaying(true); }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onTime = () => setProgress((audio.currentTime / (audio.duration || 1)) * 100);
        const onEnd = () => { setPlaying(false); setProgress(0); };
        audio.addEventListener("timeupdate", onTime);
        audio.addEventListener("ended", onEnd);
        return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("ended", onEnd); };
    }, []);

    return (
        <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-slate-500 px-3 py-2.5 transition-colors">
            <audio ref={audioRef} src={audioUrl(seg.audio_url)} preload="metadata" />

            <button
                onClick={toggle}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${playing ? "bg-violet-600 shadow-lg shadow-violet-500/30" : "bg-slate-700 hover:bg-violet-600/50"}`}
            >
                {playing ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                ) : (
                    <svg className="w-3 h-3 text-white pl-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-slate-400 truncate">{seg.text}</p>
                <div className="relative w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full bg-violet-500 rounded-full transition-all duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <div className="text-right flex-shrink-0">
                <span className="text-xs text-slate-600 font-mono">#{seg.segment_index + 1}</span>
                {seg.duration_secs && (
                    <p className="text-xs text-slate-600 font-mono">{seg.duration_secs.toFixed(1)}s</p>
                )}
            </div>
        </div>
    );
}

export default function AudioPlayer({ segments, finalAudioUrl, loading }: Props) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">音频输出</label>
                <div className="flex items-center gap-3 py-8 justify-center">
                    <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="w-1 bg-violet-400 rounded-full animate-pulse" style={{ height: `${12 + i * 6}px`, animationDelay: `${i * 0.1}s` }} />
                        ))}
                    </div>
                    <span className="text-slate-400 text-sm">正在合成语音…</span>
                </div>
            </div>
        );
    }

    if (segments.length === 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">音频输出</label>
                <div className="rounded-xl border border-dashed border-slate-700 py-10 flex flex-col items-center gap-2 text-slate-600">
                    <span className="text-3xl">🔊</span>
                    <p className="text-sm">生成音频后在这里播放</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                音频输出 ({segments.length} 段)
            </label>

            {/* Final combined audio */}
            {finalAudioUrl && (
                <div className="rounded-xl bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border border-violet-500/40 p-3 space-y-2">
                    <p className="text-xs font-semibold text-violet-300">🎵 完整合并音频</p>
                    <audio
                        controls
                        src={audioUrl(finalAudioUrl)}
                        className="w-full h-9"
                        style={{ colorScheme: "dark" }}
                    />
                    <a
                        href={audioUrl(finalAudioUrl)}
                        download="javis-studio-output.mp3"
                        className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                        ⬇️ 下载 MP3
                    </a>
                </div>
            )}

            {/* Per-segment players */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scroll">
                {segments.map((seg) => (
                    <SegmentPlayer key={seg.segment_index} seg={seg} />
                ))}
            </div>
        </div>
    );
}
