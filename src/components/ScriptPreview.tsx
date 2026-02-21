"use client";
import { ScriptSegment } from "@/lib/api";

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

const EMOTION_EMOJI: Record<string, string> = {
    happy: "😊", calm: "😌", sad: "😢", angry: "😠",
    surprised: "😲", afraid: "😨", disgusted: "😒",
    melancholic: "😔", neutral: "😐",
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
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    旁白脚本
                </label>
                <div className="flex items-center gap-3 py-8 justify-center">
                    <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                            />
                        ))}
                    </div>
                    <span className="text-slate-500 text-sm">AI 正在生成旁白脚本…</span>
                </div>
            </div>
        );
    }

    if (segments.length === 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    旁白脚本
                </label>
                <div className="rounded-xl border border-dashed border-slate-300 py-10 bg-slate-50/50 flex flex-col items-center gap-2 text-slate-500">
                    <span className="text-3xl">📝</span>
                    <p className="text-sm">提交后，AI 将在这里生成分段旁白脚本</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    旁白脚本 ({segments.length} 段)
                </label>
                <span className="text-xs text-slate-500">{segments.reduce((a, s) => a + s.text.length, 0)} 字</span>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scroll">
                {segments.map((seg) => {
                    const emotionKey = seg.emotion_hint?.toLowerCase() ?? "neutral";
                    const colorClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.neutral;
                    const emoji = EMOTION_EMOJI[emotionKey] ?? "😐";

                    return (
                        <div
                            key={seg.index}
                            className="rounded-xl bg-white/80 border border-slate-200 shadow-sm hover:shadow-md p-3 space-y-2 hover:border-violet-200 transition-all duration-200"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-mono">#{seg.index + 1}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                                    {emoji} {seg.emotion_hint ?? "neutral"}
                                </span>
                                {/* Emotion selector */}
                                <select
                                    value={seg.emotion_hint ?? "neutral"}
                                    onChange={(e) => updateEmotion(seg.index, e.target.value)}
                                    className="ml-auto text-xs bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-slate-600 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 transition-shadow"
                                >
                                    {Object.keys(EMOTION_COLORS).map((k) => (
                                        <option key={k} value={k}>{EMOTION_EMOJI[k]} {k}</option>
                                    ))}
                                </select>
                            </div>
                            <textarea
                                value={seg.text}
                                onChange={(e) => updateText(seg.index, e.target.value)}
                                rows={2}
                                className="w-full bg-transparent text-sm text-slate-800 outline-none resize-none placeholder-slate-400"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
