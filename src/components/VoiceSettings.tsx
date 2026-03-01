import { useRef, useState, useEffect } from "react";
import { Mic2, Sparkles, Wand2, Type, Brain, Music, Settings2 } from "lucide-react";
import { type EmotionMode, type VoiceSettings, fileToBase64 } from "@/lib/api";

interface Props {
    value: VoiceSettings;
    onChange: (v: VoiceSettings) => void;
}

const EMOTION_MODES: { value: EmotionMode; label: string; desc: string }[] = [
    { value: "none", label: "无情感控制", desc: "纯声音克隆 (预训练音色)" },
    { value: "audio", label: "参考音频情感", desc: "上传情感参考音频 (情感复刻)" },
    { value: "vector", label: "情感向量", desc: "手动调节8维情感 (情感控制)" },
    { value: "text", label: "文字描述情感", desc: "用文字描述情感风格 (情感控制)" },
];

const EMOTION_LABELS = ["开心", "愤怒", "悲伤", "恐惧", "厌恶", "忧郁", "惊讶", "平静"];
const EMOTION_KEYS = ["happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"];

export default function VoiceSettings({ value, onChange }: Props) {
    const spkRef = useRef<HTMLInputElement>(null);
    const emoRef = useRef<HTMLInputElement>(null);
    const [spkName, setSpkName] = useState("");
    const [emoName, setEmoName] = useState("");
    const [spkPreview, setSpkPreview] = useState<string | null>(null);
    const [emoPreview, setEmoPreview] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            if (spkPreview) URL.revokeObjectURL(spkPreview);
            if (emoPreview) URL.revokeObjectURL(emoPreview);
        };
    }, [spkPreview, emoPreview]);

    // 监听外部重置（如清空操作），当 spk_audio_prompt 为空时清除本地状态
    useEffect(() => {
        if (!value.spk_audio_prompt) {
            if (spkPreview) {
                URL.revokeObjectURL(spkPreview);
                setSpkPreview(null);
            }
            setSpkName("");
        }
    }, [value.spk_audio_prompt]);

    // 监听外部重置，当 emo_audio_prompt 为空时清除本地状态
    useEffect(() => {
        if (!value.emo_audio_prompt) {
            if (emoPreview) {
                URL.revokeObjectURL(emoPreview);
                setEmoPreview(null);
            }
            setEmoName("");
        }
    }, [value.emo_audio_prompt]);

    const update = (patch: Partial<VoiceSettings>) => onChange({ ...value, ...patch });

    const handleSpkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSpkName(file.name);
        if (spkPreview) URL.revokeObjectURL(spkPreview);
        setSpkPreview(URL.createObjectURL(file));
        update({ spk_audio_prompt: await fileToBase64(file) });
    };

    const handleEmoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setEmoName(file.name);
        if (emoPreview) URL.revokeObjectURL(emoPreview);
        setEmoPreview(URL.createObjectURL(file));
        update({ emo_audio_prompt: await fileToBase64(file) });
    };

    const emoVec = value.emo_vector ?? new Array(8).fill(0);

    return (
        <div className="space-y-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                语音设置
            </label>

            {/* Speaker reference audio */}
            <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500">参考说话人音频 <span className="text-red-400">*</span></p>
                <button
                    onClick={() => spkRef.current?.click()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-cyan-400 text-sm text-slate-600 hover:text-cyan-600 transition-all shadow-sm hover:shadow"
                >
                    <Mic2 className="w-4 h-4 text-cyan-500" />
                    <span className="truncate">{spkName || "上传参考音频 (.wav, .mp3, .flac, .ogg, .m4a, ...)"}</span>
                </button>
                <input ref={spkRef} type="file" accept="audio/*" className="hidden" onChange={handleSpkUpload} />
                {spkPreview && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">预览预览</span>
                            <button
                                onClick={() => {
                                    setSpkPreview(null);
                                    setSpkName("");
                                    update({ spk_audio_prompt: "" });
                                }}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <Settings2 className="w-3 h-3 rotate-45" />
                            </button>
                        </div>
                        <audio src={spkPreview} controls className="w-full h-8 scale-90 -mx-4" />
                    </div>
                )}
            </div>

            {/* Emotion mode tabs */}
            <div className="space-y-2">
                <p className="text-xs text-slate-500">情感控制模式</p>
                <div className="grid grid-cols-1 gap-1">
                    {EMOTION_MODES.map((m) => (
                        <button
                            key={m.value}
                            onClick={() => update({ emotion_mode: m.value })}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all ${value.emotion_mode === m.value
                                ? "bg-cyan-50/80 border-cyan-300 text-cyan-700 shadow-sm ring-1 ring-cyan-500/10"
                                : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm"
                                }`}
                        >
                            <span className="font-medium flex-1 text-left">{m.label}</span>
                            <span className="text-xs opacity-60">{m.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Emotion audio ref */}
            {value.emotion_mode === "audio" && (
                <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">情感参考音频</p>
                    <button
                        onClick={() => emoRef.current?.click()}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-cyan-400 text-sm text-slate-600 hover:text-cyan-600 transition-all shadow-sm hover:shadow"
                    >
                        <Music className="w-4 h-4 text-cyan-500" />
                        <span className="truncate">{emoName || "上传情感参考音频 (.wav, .mp3, .flac, .ogg, .m4a, ...)"}</span>
                    </button>
                    <input ref={emoRef} type="file" accept="audio/*" className="hidden" onChange={handleEmoUpload} />
                    {emoPreview && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">情感预览</span>
                                <button
                                    onClick={() => {
                                        setEmoPreview(null);
                                        setEmoName("");
                                        update({ emo_audio_prompt: "" });
                                    }}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <Settings2 className="w-3 h-3 rotate-45" />
                                </button>
                            </div>
                            <audio src={emoPreview} controls className="w-full h-8 scale-90 -mx-4" />
                        </div>
                    )}
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>情感强度 (emo_alpha)</span>
                            <span className="text-cyan-400 font-mono">{value.emo_alpha.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.05}
                            value={value.emo_alpha}
                            onChange={(e) => update({ emo_alpha: parseFloat(e.target.value) })}
                            className="w-full accent-cyan-500"
                        />
                    </div>
                </div>
            )}

            {/* Emotion vector sliders */}
            {value.emotion_mode === "vector" && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-500">情感向量调节</p>
                    {EMOTION_LABELS.map((label, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-10 text-right font-medium">{label}</span>
                            <input
                                type="range" min={0} max={1} step={0.05}
                                value={emoVec[i]}
                                onChange={(e) => {
                                    const next = [...emoVec];
                                    next[i] = parseFloat(e.target.value);
                                    update({ emo_vector: next });
                                }}
                                className={`flex-1 accent-cyan-500`}
                            />
                            <span className={`text-xs font-mono w-8 text-right ${EMOTION_KEYS.map((_, j) => j === i ? "text-cyan-500" : "text-slate-500")[i]}`}>
                                {emoVec[i].toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Emotion text */}
            {value.emotion_mode === "text" && (
                <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">情感描述文字</p>
                    <input
                        value={value.emo_text ?? ""}
                        onChange={(e) => update({ emo_text: e.target.value })}
                        placeholder="e.g. 充满激情与希望"
                        className="w-full rounded-lg bg-white border border-slate-200 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10 outline-none text-sm text-slate-700 px-3 py-2 transition-all shadow-inner"
                    />
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>情感强度 (emo_alpha)</span>
                            <span className="text-cyan-400 font-mono">{value.emo_alpha.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.05}
                            value={value.emo_alpha}
                            onChange={(e) => update({ emo_alpha: parseFloat(e.target.value) })}
                            className="w-full accent-cyan-500"
                        />
                    </div>
                </div>
            )}

            {/* Random toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
                <div
                    onClick={() => update({ use_random: !value.use_random })}
                    className={`w-10 h-5 rounded-full relative transition-colors ${value.use_random ? "bg-cyan-600" : "bg-slate-200"}`}
                >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value.use_random ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs text-slate-500">启用随机采样 (降低声音复现度)</span>
            </label>
        </div>
    );
}
