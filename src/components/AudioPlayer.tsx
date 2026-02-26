"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Download, Volume2, Loader2, Package, Clock, BarChart3, AlertCircle, RefreshCw } from "lucide-react";
import JSZip from "jszip";
import { AudioSegmentResult, ScriptSegment, audioUrl } from "@/lib/api";

interface FailedSegment {
    segment: ScriptSegment;
    error: string;
    retryCount: number;
}

interface SynthesisProgress {
    total: number;
    current: number;
    segmentTimes: number[];
    startTime: number | null;
    failed: FailedSegment[];
}

interface Props {
    segments: AudioSegmentResult[];
    loading?: boolean;
    projectName?: string;
    synthesisProgress?: SynthesisProgress;
    onRetryFailed?: () => void;
    onPlayStateChange?: (index: number | null, isPlaying: boolean) => void;
    currentPlayingIndex?: number | null;
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

// 格式化毫秒为可读时间
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}分${secs}秒`;
}

// 进度显示组件
function ProgressDisplay({ progress, onRetryFailed }: { progress: SynthesisProgress; onRetryFailed?: () => void }) {
    const { total, current, segmentTimes, startTime, failed } = progress;
    const failedCount = failed.length;
    // current 代表已尝试的段数（成功 + 失败）
    const attemptedCount = current;
    const successCount = attemptedCount - failedCount;
    const percentage = total > 0 ? (successCount / total) * 100 : 0;
    
    // 用于强制重新渲染以实时更新时间
    const [, forceUpdate] = useState({});
    
    // 计算统计数据
    const totalElapsed = startTime ? Date.now() - startTime : 0;
    const avgTime = segmentTimes.length > 0 
        ? segmentTimes.reduce((a, b) => a + b, 0) / segmentTimes.length 
        : 0;
    const remainingSegments = total - successCount;
    const estimatedRemaining = avgTime > 0 ? avgTime * remainingSegments : 0;
    
    // 当前段耗时（最后一段）
    const currentSegmentTime = segmentTimes.length > 0 
        ? segmentTimes[segmentTimes.length - 1] 
        : 0;

    // 实时更新时间显示 - 每100ms更新一次
    useEffect(() => {
        if (!startTime) return;
        
        const timer = setInterval(() => {
            forceUpdate({});
        }, 100);
        
        return () => clearInterval(timer);
    }, [startTime]);

    const isComplete = successCount === total && total > 0 && failedCount === 0;

    return (
        <div className="relative rounded-xl p-4 space-y-3 overflow-hidden ai-glow-card">
            {/* AI 跑马灯边框效果 */}
            <div className="absolute inset-0 rounded-xl ai-border-glow" />
            
            {/* 背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/90 to-blue-50/90 rounded-xl" />
            
            {/* 内容 */}
            <div className="relative z-10">
                {/* 标题和总体进度 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center shadow-sm">
                            <BarChart3 className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">合成进度</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                        <Clock className="w-3 h-3" />
                        <span>已用 {formatDuration(totalElapsed)}</span>
                    </div>
                </div>

                {/* 进度条 */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-cyan-700">
                                成功 {successCount} / {total} 段
                            </span>
                            {failedCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                                    {failedCount} 段失败
                                </span>
                            )}
                        </div>
                        <span className="text-slate-500">{percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 bg-white/80 rounded-full overflow-hidden border border-cyan-100/50 shadow-inner relative">
                        {/* 背景光效 */}
                        <div className="absolute inset-0 ai-progress-shimmer" />
                        <div 
                            className="h-full rounded-full transition-all duration-300 ease-out shadow-sm relative overflow-hidden ai-progress-gradient"
                            style={{ width: `${percentage}%` }}
                        >
                            {/* 进度条内光效 */}
                            <div className="absolute inset-0 ai-progress-glow" />
                        </div>
                    </div>
                </div>

                {/* 统计信息网格 */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-white/70 rounded-lg p-2 border border-cyan-100/50">
                        <p className="text-[10px] text-slate-500 mb-0.5">本段耗时</p>
                        <p className="text-xs font-semibold text-cyan-700 tabular-nums">
                            {currentSegmentTime > 0 ? formatDuration(currentSegmentTime) : "--"}
                        </p>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 border border-cyan-100/50">
                        <p className="text-[10px] text-slate-500 mb-0.5">平均耗时</p>
                        <p className="text-xs font-semibold text-blue-700 tabular-nums">
                            {avgTime > 0 ? formatDuration(avgTime) : "--"}
                        </p>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 border border-cyan-100/50">
                        <p className="text-[10px] text-slate-500 mb-0.5">预计剩余</p>
                        <p className="text-xs font-semibold text-emerald-600 tabular-nums">
                            {estimatedRemaining > 0 && failedCount === 0 ? formatDuration(estimatedRemaining) : "--"}
                        </p>
                    </div>
                </div>

                {/* 失败段落信息 */}
                {failedCount > 0 && (
                    <div className="bg-red-50/70 rounded-lg p-3 border border-red-200/50 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="font-medium">{failedCount} 段合成失败</span>
                        </div>
                        <div className="space-y-1 max-h-20 overflow-y-auto custom-scroll">
                            {failed.map((f) => (
                                <div key={f.segment.index} className="text-[10px] text-red-500 truncate flex items-center gap-1">
                                    <span className="font-mono text-red-400">#{f.segment.index}</span>
                                    <span className="truncate flex-1">{f.segment.text.slice(0, 20)}...</span>
                                </div>
                            ))}
                        </div>
                        {onRetryFailed && (
                            <button
                                onClick={onRetryFailed}
                                className="w-full py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <RefreshCw className="w-3 h-3" />
                                重试失败段落
                            </button>
                        )}
                    </div>
                )}

                {/* 已完成提示 */}
                {isComplete && (
                    <div className="text-center py-1">
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                            ✓ 全部分段合成完成
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// 批量下载所有音频为压缩包
async function downloadAllAudiosAsZip(segments: AudioSegmentResult[], projectName?: string) {
    const zip = new JSZip();
    const folderName = projectName?.trim() || "audio_segments";
    const folder = zip.folder(folderName);

    if (!folder) return;

    // 添加每个音频文件到zip
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const filename = `segment_${String(i + 1).padStart(2, '0')}.wav`;
        try {
            const response = await fetch(audioUrl(seg.audio_url));
            const blob = await response.blob();
            folder.file(filename, blob);
        } catch (error) {
            console.error(`下载第 ${i + 1} 段失败:`, error);
        }
    }

    // 生成并下载zip文件
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const downloadUrl = window.URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}

interface SegmentPlayerProps {
    seg: AudioSegmentResult;
    index: number;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    onToggle: () => void;
    onSeek: (time: number) => void;
    audioRef: React.RefObject<HTMLAudioElement | null>;
}

function SegmentPlayer({ seg, index, isPlaying, currentTime, duration, onToggle, onSeek, audioRef }: SegmentPlayerProps) {
    const progressRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localProgress, setLocalProgress] = useState(0);

    // 计算进度百分比
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const seekTo = useCallback((clientX: number) => {
        const progressBar = progressRef.current;
        if (!progressBar || !duration) return;

        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = percent * duration;
        onSeek(newTime);
        setLocalProgress(percent * 100);
    }, [duration, onSeek]);

    // 处理进度条拖拽
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        seekTo(e.clientX);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const progressBar = progressRef.current;
            if (!progressBar || !duration) return;
            const rect = progressBar.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setLocalProgress(percent * 100);
        };

        const handleMouseUp = (e: MouseEvent) => {
            setIsDragging(false);
            const progressBar = progressRef.current;
            if (!progressBar || !duration) return;
            const rect = progressBar.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onSeek(percent * duration);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, duration, onSeek]);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 拖拽时显示本地进度，否则显示实际进度
    const displayProgress = isDragging ? localProgress : progress;

    return (
        <div className={`flex items-center gap-3 rounded-xl bg-white/80 border shadow-sm hover:shadow-md hover:border-cyan-300 px-3 py-2.5 transition-all duration-200 ${isPlaying ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'}`}>
            <audio ref={audioRef} src={audioUrl(seg.audio_url)} preload="metadata" />

            <button
                onClick={onToggle}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isPlaying ? "bg-cyan-500 shadow-md shadow-cyan-500/30 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-cyan-300 hover:text-cyan-600 shadow-sm"}`}
            >
                {isPlaying ? (
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
                            style={{ width: `${displayProgress}%`, transitionDuration: isDragging ? '0ms' : '100ms' }}
                        />
                        {/* 拖拽手柄 */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-cyan-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                            style={{ left: `calc(${displayProgress}% - 6px)` }}
                        />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono w-14 text-right tabular-nums">
                        {formatTime(currentTime)} / {formatTime(duration)}
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

export default function AudioPlayer({ 
    segments, 
    loading, 
    projectName, 
    synthesisProgress, 
    onRetryFailed,
    onPlayStateChange,
    currentPlayingIndex: externalPlayingIndex
}: Props) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [internalPlayingIndex, setInternalPlayingIndex] = useState<number | null>(null);
    const [currentTimes, setCurrentTimes] = useState<Map<number, number>>(new Map());
    const [durations, setDurations] = useState<Map<number, number>>(new Map());
    const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
    const animationFrameRef = useRef<number | null>(null);
    
    // 使用外部或内部的播放索引
    const currentPlayingIndex = externalPlayingIndex !== undefined ? externalPlayingIndex : internalPlayingIndex;
    const setCurrentPlayingIndex = (index: number | null) => {
        if (externalPlayingIndex === undefined) {
            setInternalPlayingIndex(index);
        }
        onPlayStateChange?.(index, index !== null);
    };

    // 统一更新当前播放时间 - 使用 requestAnimationFrame 实现平滑进度
    useEffect(() => {
        const updateProgress = () => {
            if (currentPlayingIndex !== null) {
                const audio = audioRefs.current.get(currentPlayingIndex);
                if (audio) {
                    setCurrentTimes(prev => new Map(prev).set(currentPlayingIndex, audio.currentTime));
                }
            }
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        };
        
        animationFrameRef.current = requestAnimationFrame(updateProgress);
        
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [currentPlayingIndex]);

    const handleToggle = (index: number) => {
        const audio = audioRefs.current.get(index);
        if (!audio) return;

        if (currentPlayingIndex === index) {
            // 暂停当前播放
            audio.pause();
            setCurrentPlayingIndex(null);
        } else {
            // 停止其他正在播放的音频
            if (currentPlayingIndex !== null) {
                const otherAudio = audioRefs.current.get(currentPlayingIndex);
                if (otherAudio) {
                    otherAudio.pause();
                    otherAudio.currentTime = 0;
                }
            }
            // 播放选中的音频
            setCurrentPlayingIndex(index);
            audio.play().catch(err => {
                console.error('播放失败:', err);
                setCurrentPlayingIndex(null);
            });
        }
    };

    const handleSeek = (index: number, time: number) => {
        const audio = audioRefs.current.get(index);
        if (!audio) return;
        
        audio.currentTime = time;
        setCurrentTimes(prev => new Map(prev).set(index, time));
    };

    const handleBatchDownload = async () => {
        if (segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        await downloadAllAudiosAsZip(segments, projectName);
        setIsDownloading(false);
    };

    // 为每个音频设置事件监听
    useEffect(() => {
        const cleanupFns: (() => void)[] = [];

        segments.forEach((seg, idx) => {
            const audio = audioRefs.current.get(idx);
            if (!audio) return;

            const handleLoadedMetadata = () => {
                setDurations(prev => new Map(prev).set(idx, audio.duration || 0));
            };

            const handleTimeUpdate = () => {
                setCurrentTimes(prev => new Map(prev).set(idx, audio.currentTime));
            };

            const handleAudioEnded = () => {
                setCurrentTimes(prev => new Map(prev).set(idx, 0));
                // 自动播放下一段
                const nextIndex = idx + 1;
                if (nextIndex < segments.length) {
                    setTimeout(() => {
                        handleToggle(nextIndex);
                    }, 100);
                } else {
                    setCurrentPlayingIndex(null);
                }
            };

            audio.addEventListener('loadedmetadata', handleLoadedMetadata);
            audio.addEventListener('durationchange', handleLoadedMetadata);
            audio.addEventListener('timeupdate', handleTimeUpdate);
            audio.addEventListener('ended', handleAudioEnded);

            cleanupFns.push(() => {
                audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audio.removeEventListener('durationchange', handleLoadedMetadata);
                audio.removeEventListener('timeupdate', handleTimeUpdate);
                audio.removeEventListener('ended', handleAudioEnded);
            });
        });

        return () => {
            cleanupFns.forEach(fn => fn());
        };
    }, [segments]);

    if (loading && synthesisProgress && synthesisProgress.total > 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">音频输出</label>
                <ProgressDisplay progress={synthesisProgress} onRetryFailed={onRetryFailed} />
            </div>
        );
    }

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
                    <SegmentPlayer 
                        key={seg.segment_index} 
                        seg={seg} 
                        index={idx}
                        isPlaying={currentPlayingIndex === idx}
                        currentTime={currentTimes.get(idx) || 0}
                        duration={durations.get(idx) || 0}
                        onToggle={() => handleToggle(idx)}
                        onSeek={(time) => handleSeek(idx, time)}
                        audioRef={{ 
                            current: audioRefs.current.get(idx) || null,
                            get current() { return audioRefs.current.get(idx) || null; },
                            set current(val) { if (val) audioRefs.current.set(idx, val); }
                        } as React.RefObject<HTMLAudioElement | null>}
                    />
                ))}
            </div>
        </div>
    );
}
