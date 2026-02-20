"use client";
import { ScriptSegment } from "@/lib/api";

const EMOTION_COLORS: Record<string, string> = {
    happy: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    calm: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    sad: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    angry: "bg-red-500/20 text-red-300 border-red-500/40",
    surprised: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    afraid: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    disgusted: "bg-green-500/20 text-green-300 border-green-500/40",
    melancholic: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    neutral: "bg-slate-500/20 text-slate-300 border-slate-500/40",
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
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
                    <span className="text-slate-400 text-sm">AI 正在生成旁白脚本…</span>
                </div>
            </div>
        );
    }

    if (segments.length === 0) {
        return (
            <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    旁白脚本
                </label>
                <div className="rounded-xl border border-dashed border-slate-700 py-10 flex flex-col items-center gap-2 text-slate-600">
                    <span className="text-3xl">📝</span>
                    <p className="text-sm">提交后，AI 将在这里生成分段旁白脚本</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    旁白脚本 ({segments.length} 段)
                </label>
                <span className="text-xs text-slate-600">{segments.reduce((a, s) => a + s.text.length, 0)} 字</span>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scroll">
                {segments.map((seg) => {
                    const emotionKey = seg.emotion_hint?.toLowerCase() ?? "neutral";
                    const colorClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.neutral;
                    const emoji = EMOTION_EMOJI[emotionKey] ?? "😐";

                    return (
                        <div
                            key={seg.index}
                            className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 space-y-2 hover:border-slate-500 transition-colors"
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
                                    className="ml-auto text-xs bg-slate-700 border border-slate-600 rounded-lg px-2 py-0.5 text-slate-300 outline-none focus:border-violet-500"
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
                                className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none placeholder-slate-600"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
