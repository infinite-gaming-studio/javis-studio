"use client";
import { ScriptSegment } from "@/lib/api";
import {
    FileText,
    Smile,
    MessageSquare,
    Clock,
    Hash,
    ChevronDown,
    Sparkles,
    AlertCircle
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
}

export default function ScriptPreview({ segments, onChange, loading }: Props) {
    const updateText = (idx: number, text: string) => {
        onChange(segments.map((s) => (s.index === idx ? { ...s, text } : s)));
    };

    const updateEmotion = (idx: number, emotion: string) => {
        onChange(segments.map((s) => (s.index === idx ? { ...s, emotion_hint: emotion } : s)));
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
                <div className="flex-1 rounded-2xl border border-dashed border-slate-300 py-10 bg-slate-50/50 flex flex-col items-center justify-center gap-3 text-slate-500 group transition-all duration-300 hover:border-cyan-300 hover:bg-cyan-50/20">
                    <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                        <Sparkles className="w-8 h-8 text-cyan-400" />
                    </div>
                    <p className="text-sm font-medium">提交后，AI 将在这里生成分段旁白脚本</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col space-y-3 min-h-0">
            <div className="flex items-center justify-between shrink-0">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-500" />
                    旁白脚本 ({segments.length} 段)
                </label>
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

            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scroll pb-2">
                {segments.map((seg) => {
                    const emotionKey = seg.emotion_hint?.toLowerCase() ?? "neutral";
                    const colorClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.neutral;

                    return (
                        <div
                            key={seg.index}
                            className="group relative rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-lg hover:shadow-cyan-200/20 p-4 space-y-3 hover:border-cyan-200 transition-all duration-300"
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-xs text-slate-400 font-mono font-bold bg-slate-100/50 px-2 py-0.5 rounded-lg">
                                    <Hash className="w-3 h-3 text-slate-400" />
                                    {seg.index + 1}
                                </div>
                                <div className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-sm ${colorClass} transition-colors duration-300`}>
                                    <Smile className="w-3 h-3" />
                                    {seg.emotion_hint?.toUpperCase() ?? "NEUTRAL"}
                                </div>

                                <div className="ml-auto relative">
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
                            </div>
                            <textarea
                                value={seg.text}
                                onChange={(e) => updateText(seg.index, e.target.value)}
                                rows={2}
                                className="w-full bg-white/50 hover:bg-white/80 focus:bg-white border border-transparent focus:border-cyan-200 rounded-xl p-2.5 text-sm text-slate-800 outline-none resize-none placeholder-slate-400 transition-all duration-200 shadow-none focus:shadow-sm"
                                placeholder="输入脚本内容..."
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
