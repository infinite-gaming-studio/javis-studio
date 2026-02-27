"use client";
import { useState, useRef, useEffect } from "react";
import { ScriptSegment } from "@/lib/api";
import {
    FileText,
    Smile,
    MessageSquare,
    Clock,
    Hash,
    ChevronDown,
    Sparkles,
    AlertCircle,
    Plus,
    LayoutList,
    Trash2,
    X,
    Maximize2,
    Minimize2,
    Scissors,
    Wand2,
    Volume2,
    Loader2
} from "lucide-react";

const EMOTION_COLORS: Record<string, string> = {
    happy: "bg-yellow-50 text-yellow-700 border-yellow-200",
    calm: "bg-blue-50 text-blue-700 border-blue-200",
    sad: "bg-indigo-50 text-indigo-700 border-indigo-200",
    angry: "bg-red-50 text-red-700 border-red-200",
    surprised: "bg-pink-50 text-pink-700 border-pink-200",
    afraid: "bg-orange-50 text-orange-700 border-orange-200",
    disgusted: "bg-green-50 text-green-700 border-green-200",
    melancholic: "bg-purple-50 text-purple-700 border-purple-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

interface Props {
    segments: ScriptSegment[];
    onChange: (segments: ScriptSegment[]) => void;
    loading?: boolean;
    onGenerateSegment?: (index: number) => Promise<void>;
    generatingSegments?: number[];
    canGenerate?: boolean;
    currentPlayingIndex?: number | null;
}

// 智能分割文本 - 按目标段数和最大字符数分割
function smartSplitText(text: string, targetSegments: number | null, maxCharsPerSegment: number = 150): string[] {
    if (!text.trim()) return [];

    // 先按句子分割
    const sentences = text.match(/[^。？！.!?]+[。？！.!?]*\s*/g) || [text];

    // 如果没有指定目标段数，只按最大字符数分割
    const idealLength = targetSegments
        ? Math.min(Math.ceil(text.length / targetSegments), maxCharsPerSegment)
        : maxCharsPerSegment;

    const result: string[] = [];
    let currentSegment = "";

    for (const sentence of sentences) {
        // 如果当前句子本身就很长，需要进一步拆分
        if (sentence.length > maxCharsPerSegment) {
            if (currentSegment) {
                result.push(currentSegment.trim());
                currentSegment = "";
            }
            // 按标点或字符拆分长句子
            const chunks = sentence.match(/[^，,；;]+[，,；;]*/g) || [sentence];
            for (const chunk of chunks) {
                if ((currentSegment + chunk).length > maxCharsPerSegment && currentSegment) {
                    result.push(currentSegment.trim());
                    currentSegment = chunk;
                } else {
                    currentSegment += chunk;
                }
            }
        } else if ((currentSegment + sentence).length > idealLength && currentSegment) {
            // 当前段落已达到理想长度，保存并开始新段落
            result.push(currentSegment.trim());
            currentSegment = sentence;
        } else {
            currentSegment += sentence;
        }
    }

    if (currentSegment) {
        result.push(currentSegment.trim());
    }

    // 如果指定了目标段数且段数太少，尝试进一步拆分较长的段落
    if (targetSegments) {
        while (result.length < targetSegments && result.some(s => s.length > idealLength)) {
            const longIndex = result.findIndex(s => s.length > idealLength);
            if (longIndex === -1) break;

            const longText = result[longIndex];
            const mid = Math.ceil(longText.length / 2);
            // 在标点处分割
            const splitPoint = longText.slice(0, mid).lastIndexOf('，') + 1 ||
                              longText.slice(0, mid).lastIndexOf(',') + 1 ||
                              longText.slice(0, mid).lastIndexOf(' ') + 1 || mid;

            result.splice(longIndex, 1,
                longText.slice(0, splitPoint).trim(),
                longText.slice(splitPoint).trim()
            );
        }
    }

    return result.filter(s => s.length > 0);
}

export default function ScriptPreview({ segments, onChange, loading, onGenerateSegment, generatingSegments = [], canGenerate = false, currentPlayingIndex }: Props) {
    const [manualCount, setManualCount] = useState<number>(1);
    const [expandedSegment, setExpandedSegment] = useState<number | null>(null);
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [splitConfig, setSplitConfig] = useState<{ maxChars: number; targetSegments: number | null }>({ maxChars: 150, targetSegments: null });
    const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // 自动滚动到当前播放的段落
    useEffect(() => {
        if (currentPlayingIndex !== null && currentPlayingIndex !== undefined) {
            const segmentEl = segmentRefs.current.get(currentPlayingIndex);
            const containerEl = containerRef.current;
            if (segmentEl && containerEl) {
                segmentEl.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }
        }
    }, [currentPlayingIndex]);

    const updateText = (idx: number, text: string) => {
        onChange(segments.map((s) => (s.index === idx ? { ...s, text } : s)));
    };

    const updateEmotion = (idx: number, emotion: string) => {
        onChange(segments.map((s) => (s.index === idx ? { ...s, emotion_hint: emotion } : s)));
    };

    const createManualSegments = () => {
        const count = Math.max(1, Math.min(20, manualCount)); // 限制1-20段
        const newSegments: ScriptSegment[] = Array.from({ length: count }, (_, i) => ({
            index: i,
            text: "",
            emotion_hint: "neutral",
        }));
        onChange(newSegments);
    };

    if (loading) {
        return (
            <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-500" />
                    旁白脚本
                </label>
                <div className="flex-1 rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 flex flex-col items-center justify-center gap-4">
                    <div className="flex gap-1.5 items-end h-4">
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="w-1.5 bg-cyan-400 rounded-full animate-bounce"
                                style={{ height: `${10 + i * 4}px`, animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </div>
                    <span className="text-slate-500 text-sm font-medium">AI 正在生成旁白脚本…</span>
                </div>
            </div>
        );
    }

    if (segments.length === 0) {
        return (
            <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-500" />
                    旁白脚本
                </label>
                <div className="flex-1 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center gap-4 text-slate-500 p-6 overflow-y-auto">
                    {/* AI 生成提示 */}
                    <div className="flex flex-col items-center justify-center gap-3 group">
                        <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                            <Sparkles className="w-7 h-7 text-cyan-400" />
                        </div>
                        <p className="text-sm font-medium">在左侧输入内容后，点击"生成旁白脚本"由 AI 自动分段</p>
                    </div>

                    {/* 分隔线 */}
                    <div className="flex items-center gap-3 w-full max-w-xs">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs text-slate-400">或者</span>
                        <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    {/* 手动创建分段 */}
                    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                        <div className="flex items-center gap-2 w-full">
                            <div className="flex items-center gap-2 flex-1 bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm">
                                <LayoutList className="w-4 h-4 text-slate-400" />
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={manualCount}
                                    onChange={(e) => setManualCount(parseInt(e.target.value) || 1)}
                                    className="w-full text-sm text-slate-700 outline-none bg-transparent"
                                    placeholder="段数"
                                />
                                <span className="text-xs text-slate-400 whitespace-nowrap">段</span>
                            </div>
                            <button
                                onClick={createManualSegments}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white
                                           bg-gradient-to-r from-cyan-500 to-blue-500
                                           hover:from-cyan-600 hover:to-blue-600
                                           shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40
                                           transition-all duration-200 whitespace-nowrap"
                            >
                                <Plus className="w-4 h-4" />
                                创建分段
                            </button>
                        </div>
                        {/* 常用段数快捷按钮 */}
                        <div className="flex items-center gap-2">
                            {[3, 5, 10, 15].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => setManualCount(num)}
                                    className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                                        manualCount === num
                                            ? 'bg-cyan-50 border-cyan-300 text-cyan-600'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-cyan-300 hover:text-cyan-500'
                                    }`}
                                >
                                    {num}段
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400">手动创建空白分段，自行填入文本内容</p>
                    </div>
                </div>
            </div>
        );
    }

    const addSegment = () => {
        const newSegment: ScriptSegment = {
            index: segments.length,
            text: "",
            emotion_hint: "neutral",
        };
        onChange([...segments, newSegment]);
    };

    const removeSegment = (idx: number) => {
        const updated = segments
            .filter((s) => s.index !== idx)
            .map((s, i) => ({ ...s, index: i }));
        onChange(updated);
    };

    const clearAllSegments = () => {
        if (confirm("确定要清空所有分段吗？")) {
            onChange([]);
        }
    };

    // 智能分割所有段落
    const handleSmartSplit = () => {
        // 合并所有文本
        const fullText = segments.map(s => s.text).join('');
        if (!fullText.trim()) return;
        
        const splitTexts = smartSplitText(fullText, splitConfig.targetSegments, splitConfig.maxChars);
        
        const newSegments: ScriptSegment[] = splitTexts.map((text, i) => ({
            index: i,
            text: text,
            emotion_hint: segments[Math.min(i, segments.length - 1)]?.emotion_hint || "neutral",
        }));
        
        onChange(newSegments);
        setShowSplitModal(false);
    };

    // 在指定位置后插入新分段
    const insertSegmentAfter = (idx: number) => {
        const newSegment: ScriptSegment = {
            index: idx + 1,
            text: "",
            emotion_hint: "neutral",
        };
        const updated = [
            ...segments.slice(0, idx + 1),
            newSegment,
            ...segments.slice(idx + 1).map(s => ({ ...s, index: s.index + 1 }))
        ];
        onChange(updated);
    };

    // 合并相邻分段
    const mergeWithNext = (idx: number) => {
        if (idx >= segments.length - 1) return;
        const current = segments[idx];
        const next = segments[idx + 1];
        const merged: ScriptSegment = {
            index: idx,
            text: current.text + next.text,
            emotion_hint: current.emotion_hint,
        };
        const updated = [
            ...segments.slice(0, idx),
            merged,
            ...segments.slice(idx + 2).map(s => ({ ...s, index: s.index - 1 }))
        ];
        onChange(updated);
    };

    return (
        <div className="flex-1 flex flex-col space-y-3 min-h-0">
            <div className="flex items-center justify-between shrink-0">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-500" />
                    旁白脚本 ({segments.length} 段)
                </label>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSplitModal(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 transition-all"
                        title="智能分割"
                    >
                        <Wand2 className="w-3 h-3" />
                        智能分割
                    </button>
                    <button
                        onClick={addSegment}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 transition-all"
                        title="添加新分段"
                    >
                        <Plus className="w-3 h-3" />
                        添加
                    </button>
                    <button
                        onClick={clearAllSegments}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-500 transition-all"
                        title="清空所有分段"
                    >
                        <Trash2 className="w-3 h-3" />
                        清空
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1" />
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-cyan-400" />
                            {segments.reduce((a, s) => a + s.text.length, 0)} 字
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            约 {Math.ceil(segments.reduce((a, s) => a + s.text.length, 0) / 4)} 秒
                        </span>
                    </div>
                </div>
            </div>

            {/* 智能分割弹窗 */}
            {showSplitModal && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                        <div className="flex items-center gap-2 text-slate-800">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                <Scissors className="w-4 h-4 text-purple-600" />
                            </div>
                            <h3 className="font-semibold">智能分割设置</h3>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">每段最大字符数</label>
                                <input
                                    type="number"
                                    min={50}
                                    max={500}
                                    value={splitConfig.maxChars}
                                    onChange={(e) => setSplitConfig({ ...splitConfig, maxChars: parseInt(e.target.value) || 150 })}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 block mb-1">目标段数（可选）</label>
                                <input
                                    type="number"
                                    min={2}
                                    max={50}
                                    value={splitConfig.targetSegments || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSplitConfig({ ...splitConfig, targetSegments: val ? parseInt(val) : null });
                                    }}
                                    placeholder="不填则按最大字符数自动分割"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 placeholder:text-slate-300"
                                />
                            </div>
                            <p className="text-xs text-slate-400">
                                {splitConfig.targetSegments
                                    ? '系统会尽量按目标段数均匀分割，同时确保每段不超过最大字符数'
                                    : '不填写目标段数时，系统仅按最大字符数进行分割'}
                            </p>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setShowSplitModal(false)}
                                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSmartSplit}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl shadow-lg shadow-purple-500/25 transition-all"
                            >
                                开始分割
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scroll pb-2">
                {segments.map((seg) => {
                    const emotionKey = seg.emotion_hint?.toLowerCase() ?? "neutral";
                    const colorClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.neutral;
                    const isExpanded = expandedSegment === seg.index;
                    const isLongText = seg.text.length > 100;
                    const isPlaying = currentPlayingIndex === seg.index;

                    return (
                        <div
                            key={seg.index}
                            ref={(el) => {
                                if (el) segmentRefs.current.set(seg.index, el);
                            }}
                            className={`group relative rounded-2xl backdrop-blur-md border shadow-sm hover:shadow-lg hover:shadow-cyan-200/20 py-4 px-6 space-y-3 transition-all duration-300 ${
                                isPlaying 
                                    ? 'bg-cyan-50/60 border-cyan-300 ring-2 ring-cyan-200 shadow-lg shadow-cyan-200/30' 
                                    : 'bg-white/40 border-white/60 hover:border-cyan-200'
                            } ${isExpanded && !isPlaying ? 'ring-2 ring-cyan-300 shadow-xl shadow-cyan-200/30' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-lg transition-colors ${
                                    isPlaying 
                                        ? 'bg-cyan-500 text-white' 
                                        : 'bg-slate-100/50 text-slate-400'
                                }`}>
                                    <Hash className={`w-3 h-3 ${isPlaying ? 'text-white' : 'text-slate-400'}`} />
                                    {seg.index + 1}
                                    {isPlaying && <span className="ml-1 text-[9px]">▶</span>}
                                </div>
                                <div className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-sm ${colorClass} transition-colors duration-300`}>
                                    <Smile className="w-3 h-3" />
                                    {seg.emotion_hint?.toUpperCase() ?? "NEUTRAL"}
                                </div>
                                {/* 字符数提示 */}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${seg.text.length > 150 ? 'text-orange-500 bg-orange-50' : 'text-slate-400'}`}>
                                    {seg.text.length} 字
                                </span>

                                <div className="ml-auto flex items-center gap-1">
                                    {/* 重新生成音频按钮 */}
                                    {onGenerateSegment && canGenerate && (
                                        <button
                                            onClick={() => onGenerateSegment(seg.index)}
                                            disabled={generatingSegments.includes(seg.index)}
                                            className={`p-1.5 rounded-lg transition-all ${
                                                generatingSegments.includes(seg.index)
                                                    ? 'text-cyan-600 bg-cyan-100 cursor-wait'
                                                    : 'text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 opacity-0 group-hover:opacity-100'
                                            }`}
                                            title={generatingSegments.includes(seg.index) ? "生成中..." : "重新生成此段音频"}
                                        >
                                            {generatingSegments.includes(seg.index) ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Volume2 className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    )}
                                    {/* 展开/收缩按钮 */}
                                    <button
                                        onClick={() => setExpandedSegment(isExpanded ? null : seg.index)}
                                        className={`p-1.5 rounded-lg transition-all ${isExpanded ? 'text-cyan-600 bg-cyan-100' : 'text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 opacity-0 group-hover:opacity-100'}`}
                                        title={isExpanded ? "收起" : "展开编辑"}
                                    >
                                        {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                    </button>
                                    {/* 在后面插入新段 */}
                                    <button
                                        onClick={() => insertSegmentAfter(seg.index)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 opacity-0 group-hover:opacity-100 transition-all"
                                        title="在后面插入新段"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    {/* 合并下一段 */}
                                    {seg.index < segments.length - 1 && (
                                        <button
                                            onClick={() => mergeWithNext(seg.index)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 opacity-0 group-hover:opacity-100 transition-all"
                                            title="与下一段合并"
                                        >
                                            <LayoutList className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <div className="relative">
                                        <select
                                            value={seg.emotion_hint ?? "neutral"}
                                            onChange={(e) => updateEmotion(seg.index, e.target.value)}
                                            className="appearance-none text-[11px] font-semibold bg-white/80 hover:bg-white border border-slate-200 hover:border-cyan-300 rounded-xl pl-2.5 pr-7 py-1 text-slate-600 outline-none focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200 cursor-pointer shadow-sm"
                                        >
                                            {Object.keys(EMOTION_COLORS).map((k) => (
                                                <option key={k} value={k}>{k.toUpperCase()}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                    <button
                                        onClick={() => removeSegment(seg.index)}
                                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                        title="删除此分段"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <textarea
                                value={seg.text}
                                onChange={(e) => updateText(seg.index, e.target.value)}
                                rows={isExpanded ? 8 : (isLongText ? 4 : 2)}
                                className={`w-full bg-white/50 hover:bg-white/80 focus:bg-white border border-transparent focus:border-cyan-200 rounded-xl py-3 px-4 text-sm text-slate-800 outline-none resize-none placeholder-slate-400 transition-all duration-200 shadow-none focus:shadow-sm custom-scroll ${!seg.text ? 'border-dashed border-slate-300 bg-cyan-50/30' : ''} ${isExpanded ? 'text-base leading-relaxed' : ''}`}
                                placeholder={seg.text ? "输入脚本内容..." : "请输入第 " + (seg.index + 1) + " 段的旁白内容..."}
                            />
                            {/* 展开时的额外信息 */}
                            {isExpanded && (
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            约 {Math.ceil(seg.text.length / 4)} 秒
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setExpandedSegment(null)}
                                        className="text-xs text-cyan-600 hover:text-cyan-700 font-medium px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                                    >
                                        完成编辑
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
