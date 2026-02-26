"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Download, Volume2, Loader2, Package, Clock, BarChart3, AlertCircle, RefreshCw } from "lucide-react";
import JSZip from "jszip";
import WaveSurfer from "wavesurfer.js";
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

// 格式化秒数为时间字符串
function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 进度显示组件
function ProgressDisplay({ progress, onRetryFailed }: { progress: SynthesisProgress; onRetryFailed?: () => void }) {
    const { total, current, segmentTimes, startTime, failed } = progress;
    const failedCount = failed.length;
    const attemptedCount = current;
    const successCount = attemptedCount - failedCount;
    const percentage = total > 0 ? (successCount / total) * 100 : 0;
    
    const [, forceUpdate] = useState({});
    
    const totalElapsed = startTime ? Date.now() - startTime : 0;
    const avgTime = segmentTimes.length > 0 
        ? segmentTimes.reduce((a, b) => a + b, 0) / segmentTimes.length 
        : 0;
    const remainingSegments = total - successCount;
    const estimatedRemaining = avgTime > 0 ? avgTime * remainingSegments : 0;
    
    const currentSegmentTime = segmentTimes.length > 0 
        ? segmentTimes[segmentTimes.length - 1] 
        : 0;

    useEffect(() => {
        if (!startTime) return;
        const timer = setInterval(() => forceUpdate({}), 100);
        return () => clearInterval(timer);
    }, [startTime]);

    const isComplete = successCount === total && total > 0 && failedCount === 0;

    return (
        <div className="relative rounded-xl p-4 space-y-3 overflow-hidden ai-glow-card">
            <div className="absolute inset-0 rounded-xl ai-border-glow" />
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/90 to-blue-50/90 rounded-xl" />
            <div className="relative z-10">
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
                        <div className="absolute inset-0 ai-progress-shimmer" />
                        <div 
                            className="h-full rounded-full transition-all duration-300 ease-out shadow-sm relative overflow-hidden ai-progress-gradient"
                            style={{ width: `${percentage}%` }}
                        >
                            <div className="absolute inset-0 ai-progress-glow" />
                        </div>
                    </div>
                </div>

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
    onFinish?: () => void;
    audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

function SegmentPlayer({ seg, index, isPlaying, currentTime, duration, onToggle, onSeek, onFinish, audioRef }: SegmentPlayerProps) {
    const waveformRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [wsDuration, setWsDuration] = useState(0);
    const onFinishRef = useRef(onFinish);
    
    // 保持最新的 onFinish 回调引用
    useEffect(() => {
        onFinishRef.current = onFinish;
    }, [onFinish]);

    // 初始化 WaveSurfer
    useEffect(() => {
        if (!waveformRef.current) return;

        const ws = WaveSurfer.create({
            container: waveformRef.current,
            url: audioUrl(seg.audio_url),
            waveColor: '#cbd5e1',
            progressColor: '#06b6d4',
            cursorColor: '#06b6d4',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 40,
            normalize: true,
            interact: true,
        });

        wavesurferRef.current = ws;

        ws.on('ready', () => {
            setIsReady(true);
            setWsDuration(ws.getDuration());
        });

        ws.on('audioprocess', (time: number) => {
            onSeek(time);
        });

        ws.on('seeking', (time: number) => {
            onSeek(time);
        });

        ws.on('finish', () => {
            console.log(`[WaveSurfer] Audio ${index} finished, calling onFinish`);
            onFinishRef.current?.();
        });

        return () => {
            ws.destroy();
            wavesurferRef.current = null;
        };
    }, [seg.audio_url, index]); // 移除 onFinish 依赖

    // 同步播放状态
    useEffect(() => {
        const ws = wavesurferRef.current;
        if (!ws || !isReady) return;

        if (isPlaying) {
            ws.play();
        } else {
            ws.pause();
        }
    }, [isPlaying, isReady]);

    // 同步当前时间（外部控制）
    useEffect(() => {
        const ws = wavesurferRef.current;
        if (!ws || !isReady || isPlaying) return;

        const currentWsTime = ws.getCurrentTime();
        if (Math.abs(currentWsTime - currentTime) > 0.5) {
            ws.setTime(currentTime);
        }
    }, [currentTime, isReady, isPlaying]);

    const handlePlayClick = () => {
        onToggle();
    };

    return (
        <div className={`
            rounded-xl border bg-white/90 backdrop-blur-sm 
            transition-all duration-300 ease-out overflow-hidden
            ${isPlaying 
                ? 'border-cyan-400 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-100' 
                : 'border-slate-200 hover:border-cyan-300 hover:shadow-md'
            }
        `}>
            <div className={`transition-all duration-300 ${isPlaying ? 'py-4' : 'py-2.5'}`}>
                <div className={`flex items-center gap-3 px-3 transition-all duration-300 ${isPlaying ? 'gap-4' : ''}`}>
                    {/* 播放按钮 */}
                    <button
                        onClick={handlePlayClick}
                        className={`
                            rounded-full flex items-center justify-center flex-shrink-0 
                            transition-all duration-300
                            ${isPlaying 
                                ? "w-10 h-10 bg-cyan-500 shadow-lg shadow-cyan-500/30 text-white" 
                                : "w-8 h-8 bg-white border border-slate-200 text-slate-500 hover:border-cyan-300 hover:text-cyan-600 shadow-sm"
                            }
                        `}
                    >
                        {isPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                        ) : (
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                        )}
                    </button>

                    {/* 内容区域 */}
                    <div className="flex-1 min-w-0 space-y-2">
                        {/* 文本 */}
                        <p className={`text-slate-600 truncate transition-all duration-300 ${isPlaying ? 'text-sm font-medium' : 'text-xs'}`}>
                            {seg.text}
                        </p>
                        
                        {/* 波形图 */}
                        <div 
                            ref={waveformRef}
                            className={`
                                w-full transition-all duration-300
                                ${isPlaying ? 'h-10 opacity-100' : 'h-0 opacity-0'}
                            `}
                        />
                        
                        {/* 时间显示 */}
                        <div className={`flex items-center justify-between transition-all duration-300 ${isPlaying ? 'opacity-100' : 'opacity-70'}`}>
                            <span className={`
                                text-slate-400 font-mono tabular-nums
                                transition-all duration-300
                                ${isPlaying ? 'text-xs' : 'text-[10px]'}
                            `}>
                                {formatTime(currentTime)}
                            </span>
                            <span className={`
                                text-slate-400 font-mono tabular-nums
                                transition-all duration-300
                                ${isPlaying ? 'text-xs' : 'text-[10px]'}
                            `}>
                                {formatTime(wsDuration || duration)}
                            </span>
                        </div>
                    </div>

                    {/* 序号和下载 */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`
                            font-mono text-center text-slate-400
                            transition-all duration-300
                            ${isPlaying ? 'text-xs w-8' : 'text-[10px] w-6'}
                        `}>
                            #{index + 1}
                        </span>
                        <button
                            onClick={() => downloadAudio(seg.audio_url, `segment_${String(index + 1).padStart(2, '0')}.wav`)}
                            className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                            title="下载此段"
                        >
                            <Download className={`transition-all duration-300 ${isPlaying ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
                        </button>
                    </div>
                </div>
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
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const playerRefs = useRef<(HTMLDivElement | null)[]>([]);

    const currentPlayingIndex = externalPlayingIndex !== undefined ? externalPlayingIndex : internalPlayingIndex;
    
    const setCurrentPlayingIndex = (index: number | null) => {
        if (externalPlayingIndex === undefined) {
            setInternalPlayingIndex(index);
        }
        onPlayStateChange?.(index, index !== null);
    };

    const handleToggle = (index: number) => {
        if (currentPlayingIndex === index) {
            setCurrentPlayingIndex(null);
        } else {
            setCurrentPlayingIndex(index);
        }
    };

    const handleSeek = (index: number, time: number) => {
        setCurrentTimes(prev => new Map(prev).set(index, time));
    };

    const handleFinish = (index: number) => {
        const nextIndex = index + 1;
        if (nextIndex < segments.length) {
            // 自动播放下一段
            setCurrentPlayingIndex(nextIndex);
        } else {
            // 已经是最后一段，停止播放
            setCurrentPlayingIndex(null);
        }
    };

    // 滚动到当前播放项
    useEffect(() => {
        if (currentPlayingIndex === null) return;

        const container = scrollContainerRef.current;
        const playerEl = playerRefs.current[currentPlayingIndex];

        if (container && playerEl) {
            const containerRect = container.getBoundingClientRect();
            const playerRect = playerEl.getBoundingClientRect();

            // 检查元素是否在可视区域内
            const isAbove = playerRect.top < containerRect.top;
            const isBelow = playerRect.bottom > containerRect.bottom;

            if (isAbove || isBelow) {
                playerEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [currentPlayingIndex]);

    const handleBatchDownload = async () => {
        if (segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        await downloadAllAudiosAsZip(segments, projectName);
        setIsDownloading(false);
    };

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

            <div 
                ref={scrollContainerRef}
                className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scroll"
            >
                {segments.map((seg, idx) => (
                    <div 
                        key={seg.segment_index}
                        ref={el => { playerRefs.current[idx] = el; }}
                    >
                        <SegmentPlayer 
                            seg={seg} 
                            index={idx}
                            isPlaying={currentPlayingIndex === idx}
                            currentTime={currentTimes.get(idx) || 0}
                            duration={durations.get(idx) || 0}
                            onToggle={() => handleToggle(idx)}
                            onSeek={(time) => handleSeek(idx, time)}
                            onFinish={() => handleFinish(idx)}
                            audioRef={{ current: null }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
