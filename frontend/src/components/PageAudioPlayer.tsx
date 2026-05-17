"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Download, Volume2, Loader2, Package, Clock, BarChart3, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import JSZip from "jszip";
import WaveSurfer from "wavesurfer.js";
import { AudioClip, audioUrl } from "@/lib/api";

interface Props {
    clips: AudioClip[];
    loading?: boolean;
    generatingCount?: number;
    totalToGenerate?: number;
    finishedCount?: number;
    startTime?: number;
    pageTitle?: string;
    pageIndex?: number;
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

// 批量下载所有音频为压缩包
async function downloadAllAudiosAsZip(clips: AudioClip[], pageTitle?: string, pageIndex?: number) {
    const zip = new JSZip();
    const folderName = pageTitle?.trim() || "audio_clips";
    const folder = zip.folder(folderName);

    if (!folder) return;

    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (!clip.audio_url) continue;
        const filename = pageIndex !== undefined 
            ? `page${String(pageIndex + 1).padStart(2, '0')}_segment${String(i + 1).padStart(2, '0')}.wav`
            : `segment_${String(i + 1).padStart(2, '0')}.wav`;
        try {
            const response = await fetch(audioUrl(clip.audio_url));
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

interface ClipPlayerProps {
    clip: AudioClip;
    index: number;
    isPlaying: boolean;
    onToggle: () => void;
    onFinish?: () => void;
    audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

function ClipPlayer({ clip, index, isPlaying, onToggle, onFinish, audioRef }: ClipPlayerProps) {
    const waveformRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [wsDuration, setWsDuration] = useState(0);
    const [localTime, setLocalTime] = useState(0);
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
            url: audioUrl(clip.audio_url || ""),
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
            setLocalTime(time);
        });

        ws.on('seeking', (time: number) => {
            setLocalTime(time);
        });

        ws.on('finish', () => {
            console.log(`[WaveSurfer] Audio ${index} finished, calling onFinish`);
            onFinishRef.current?.();
        });

        return () => {
            ws.destroy();
            wavesurferRef.current = null;
        };
    }, [clip.audio_url, index]); // 移除 onFinish 依赖

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

    // We no longer sync from external currentTime because SegmentPlayer manages it locally
    // Removed external currentTime sync hook

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
                    <div className="flex-1 min-w-0 space-y-2 overflow-hidden">
                        {/* 文本 - 滚动显示，前5字固定 */}
                        <div className={`transition-all duration-300 ${isPlaying ? 'text-sm font-medium' : 'text-xs'}`}>
                            {isPlaying && clip.text.length > 8 ? (
                                <div className="flex items-center overflow-hidden">
                                    <span className="text-slate-700 flex-shrink-0">{clip.text.slice(0, 5)}</span>
                                    <div className="overflow-hidden flex-1 relative">
                                        <div 
                                            className="whitespace-nowrap animate-marquee inline-flex"
                                            style={{'--marquee-text': `'${clip.text.slice(5)} ${clip.text.slice(5)} '`} as React.CSSProperties}
                                        >
                                            <span className="text-slate-500">{clip.text.slice(5)}</span>
                                            <span className="text-slate-500 mx-4 opacity-30">|</span>
                                            <span className="text-slate-500">{clip.text.slice(5)}</span>
                                            <span className="text-slate-500 mx-4 opacity-30">|</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-600 truncate">{clip.text}</p>
                            )}
                        </div>
                        
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
                                {formatTime(localTime)}
                            </span>
                            <span className={`
                                text-slate-400 font-mono tabular-nums
                                transition-all duration-300
                                ${isPlaying ? 'text-xs' : 'text-[10px]'}
                            `}>
                                {formatTime(wsDuration)}
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
                            onClick={() => {
                                if (clip.audio_url) {
                                    downloadAudio(clip.audio_url, `clip_${String(index + 1).padStart(2, '0')}.wav`);
                                }
                            }}
                            disabled={!clip.audio_url}
                            className={`p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all ${!clip.audio_url ? 'opacity-50 cursor-not-allowed' : ''}`}
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

export default function PageAudioPlayer({ 
    clips, 
    loading, 
    generatingCount = 0, 
    totalToGenerate = 0,
    finishedCount = 0,
    startTime,
    pageTitle, 
    pageIndex,
    onPlayStateChange, 
    currentPlayingIndex: externalPlayingIndex 
}: Props) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [internalPlayingIndex, setInternalPlayingIndex] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);

    // 实时更新耗时
    useEffect(() => {
        if (!startTime) {
            setElapsedTime(0);
            return;
        }
        
        // 如果还在生成中，开启定时器
        if (finishedCount < totalToGenerate) {
            const interval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
            return () => clearInterval(interval);
        } else {
            // 生成完成了，固定最后时长
            setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
        }
    }, [startTime, finishedCount, totalToGenerate]);
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

    const handleFinish = (index: number) => {
        const nextIndex = index + 1;
        if (nextIndex < clips.length) {
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
        if (clips.length === 0 || isDownloading) return;
        setIsDownloading(true);
        await downloadAllAudiosAsZip(clips, pageTitle, pageIndex);
        setIsDownloading(false);
    };

    if (loading && clips.length === 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">音频输出</label>
                <div className="flex items-center gap-3 py-8 justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-300">
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

    if (clips.length === 0 && generatingCount === 0) {
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

    const totalDuration = clips.reduce((acc, clip) => acc + (clip.duration_secs || 0), 0);
    const progressPercent = totalToGenerate > 0 ? Math.round((finishedCount / totalToGenerate) * 100) : 0;

    return (
        <div className="space-y-3">
            {/* 顶部署理进度与状态 */}
            {(totalToGenerate > 0 || clips.length > 0) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg">
                                <BarChart3 className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-700">合成状态统计</h4>
                                <p className="text-[10px] text-slate-400">
                                    {finishedCount < totalToGenerate ? "正在合成，已耗时: " : "合成完成，总耗时: "}
                                    {formatTime(elapsedTime)}
                                </p>
                            </div>
                        </div>
                        {totalToGenerate > 0 && (
                            <div className="text-right">
                                <span className="text-xs font-bold text-cyan-600">{progressPercent}%</span>
                                <p className="text-[10px] text-slate-400">已完成 {finishedCount}/{totalToGenerate} 段</p>
                            </div>
                        )}
                    </div>
                    
                    {totalToGenerate > 0 && (
                        <div className="space-y-1.5">
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            {generatingCount > 0 && (
                                <p className="text-[10px] text-cyan-600 font-medium animate-pulse flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    正在并行合成 {generatingCount} 个分段音频...
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    音频输出 ({clips.length} 段)
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
                className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scroll"
            >
                {clips.map((clip, idx) => (
                    <div 
                        key={clip.id}
                        ref={el => { playerRefs.current[idx] = el; }}
                    >
                        <ClipPlayer 
                            clip={clip} 
                            index={idx}
                            isPlaying={currentPlayingIndex === idx}
                            onToggle={() => handleToggle(idx)}
                            onFinish={() => handleFinish(idx)}
                            audioRef={{ current: null }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
