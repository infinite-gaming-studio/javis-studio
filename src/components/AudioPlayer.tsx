"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Download, Volume2, Music, Loader2, Package } from "lucide-react";
import { AudioSegmentResult, audioUrl } from "@/lib/api";

interface Props {
    segments: AudioSegmentResult[];
    loading?: boolean;
}

// 下载单个音频文件
async function downloadAudio(url: string, filename: string) {
    try {
        const response = await fetch(audioUrl(url));
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('下载失败:', error);
    }
}

// 批量下载所有音频
async function downloadAllAudios(segments: AudioSegmentResult[]) {
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const filename = `segment_${String(i + 1).padStart(2, '0')}.wav`;
        await downloadAudio(seg.audio_url, filename);
        // 添加小延迟避免浏览器阻塞
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

function SegmentPlayer({ seg, index }: { seg: AudioSegmentResult; index: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) { audio.pause(); setPlaying(false); }
        else { audio.play(); setPlaying(true); }
    };

    const seekTo = useCallback((clientX: number) => {
        const audio = audioRef.current;
        const progressBar = progressRef.current;
        if (!audio || !progressBar || !duration) return;

        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = percent * duration;
        audio.currentTime = newTime;
        setProgress(percent * 100);
    }, [duration]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTime = () => {
            if (!isDragging) {
                setProgress((audio.currentTime / (audio.duration || 1)) * 100);
            }
        };
        const onEnd = () => { setPlaying(false); setProgress(0); };
        const onLoaded = () => { setDuration(audio.duration || 0); };

        audio.addEventListener("timeupdate", onTime);
        audio.addEventListener("ended", onEnd);
        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("durationchange", onLoaded);

        return () => {
            audio.removeEventListener("timeupdate", onTime);
            audio.removeEventListener("ended", onEnd);
            audio.removeEventListener("loadedmetadata", onLoaded);
            audio.removeEventListener("durationchange", onLoaded);
        };
    }, [isDragging]);

    // 处理进度条拖拽
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        seekTo(e.clientX);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            seekTo(e.clientX);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, seekTo]);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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

            <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs text-slate-500 truncate">{seg.text}</p>
                <div className="flex items-center gap-2">
                    <div
                        ref={progressRef}
                        className="relative flex-1 h-2 rounded-full bg-slate-200 overflow-hidden cursor-pointer group"
                        onMouseDown={handleMouseDown}
                    >
                        <div
                            className="absolute left-0 top-0 h-full bg-cyan-500 rounded-full transition-all"
                            style={{ width: `${progress}%`, transitionDuration: isDragging ? '0ms' : '100ms' }}
                        />
                        {/* 拖拽手柄 */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-cyan-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ left: `calc(${progress}% - 6px)` }}
                        />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono w-14 text-right">
                        {formatTime(audioRef.current?.currentTime || 0)} / {formatTime(duration)}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] text-slate-400 font-mono w-6 text-center">#{index + 1}</span>
                <button
                    onClick={() => downloadAudio(seg.audio_url, `segment_${String(index + 1).padStart(2, '0')}.wav`)}
                    className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                    title="下载此段"
                >
                    <Download className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

export default function AudioPlayer({ segments, loading }: Props) {
    const [isDownloading, setIsDownloading] = useState(false);

    const handleBatchDownload = async () => {
        if (segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        await downloadAllAudios(segments);
        setIsDownloading(false);
    };

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
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    音频输出 ({segments.length} 段)
                </label>
                <button
                    onClick={handleBatchDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-[11px] font-semibold text-cyan-600 hover:bg-cyan-100 hover:border-cyan-300 transition-all disabled:opacity-50"
                    title="批量下载所有音频"
                >
                    {isDownloading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <Package className="w-3 h-3" />
                    )}
                    批量下载
                </button>
            </div>

            {/* Per-segment players */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scroll">
                {segments.map((seg, idx) => (
                    <SegmentPlayer key={seg.segment_index} seg={seg} index={idx} />
                ))}
            </div>
        </div>
    );
}
