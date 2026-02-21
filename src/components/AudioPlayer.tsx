"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Volume2, Music, Loader2 } from "lucide-react";
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
        <div className="flex items-center gap-3 rounded-xl bg-white/80 border border-slate-200 shadow-sm hover:shadow-md hover:border-cyan-300 px-3 py-2.5 transition-all duration-200">
            <audio ref={audioRef} src={audioUrl(seg.audio_url)} preload="metadata" />

            <button
                onClick={toggle}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${playing ? "bg-cyan-500 shadow-md shadow-cyan-500/30 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-cyan-300 hover:text-cyan-600 shadow-sm"}`}
            >
                {playing ? (
                    <Pause className="w-3 h-3 fill-current" />
                ) : (
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                )}
            </button>

            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-slate-500 truncate">{seg.text}</p>
                <div className="relative w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full bg-cyan-500 rounded-full transition-all duration-100"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <div className="text-right flex-shrink-0">
                <span className="text-xs text-slate-500 font-mono">#{seg.segment_index + 1}</span>
                {seg.duration_secs && (
                    <p className="text-xs text-slate-500 font-mono">{seg.duration_secs.toFixed(1)}s</p>
                )}
            </div>
        </div>
    );
}

export default function AudioPlayer({ segments, finalAudioUrl, loading }: Props) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">音频输出</label>
                <div className="flex items-center gap-3 py-8 justify-center">
                    <div className="flex gap-1 items-end h-6">
                        {[0, 1, 2, 3].map((i) => (
                            <span key={i} className="w-1 bg-cyan-400 rounded-full animate-bounce" style={{ height: `${12 + i * 4}px`, animationDelay: `${i * 0.15}s` }} />
                        ))}
                    </div>
                    <span className="text-slate-500 text-sm font-medium">正在合成语音…</span>
                </div>
            </div>
        );
    }

    if (segments.length === 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">音频输出</label>
                <div className="rounded-xl border border-dashed border-slate-300 py-10 bg-slate-50/50 flex flex-col items-center gap-2 text-slate-400">
                    <Volume2 className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm font-medium">生成音频后在这里播放</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                音频输出 ({segments.length} 段)
            </label>

            {/* Final combined audio */}
            {finalAudioUrl && (
                <div className="rounded-xl bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 border border-cyan-100 p-4 space-y-3 shadow-md">
                    <div className="flex items-center gap-2">
                        <Music className="w-4 h-4 text-cyan-600" />
                        <p className="text-xs font-bold text-cyan-700 uppercase tracking-tight">完整合并音频</p>
                    </div>
                    <audio
                        controls
                        src={audioUrl(finalAudioUrl)}
                        className="w-full h-9"
                    />
                    <a
                        href={audioUrl(finalAudioUrl)}
                        download="javis-studio-output.mp3"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-cyan-100 text-[11px] font-bold text-cyan-600 hover:bg-cyan-50 hover:border-cyan-200 transition-all shadow-sm"
                    >
                        <Download className="w-3 h-3" />
                        下载 MP3
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
