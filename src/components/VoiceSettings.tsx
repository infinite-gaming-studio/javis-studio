import { useRef, useState } from "react";
import { type EmotionMode, type VoiceSettings, fileToBase64 } from "@/lib/api";

interface Props {
    value: VoiceSettings;
    onChange: (v: VoiceSettings) => void;
}

const EMOTION_MODES: { value: EmotionMode; label: string; desc: string }[] = [
    { value: "none", label: "无情感控制", desc: "纯声音克隆" },
    { value: "audio", label: "参考音频情感", desc: "上传情感参考音频" },
    { value: "vector", label: "情感向量", desc: "手动调节8维情感" },
    { value: "text", label: "文字描述情感", desc: "用文字描述情感风格" },
    { value: "text_from_script", label: "脚本自动情感", desc: "根据旁白内容自动推断" },
];

const EMOTION_LABELS = ["开心", "愤怒", "悲伤", "恐惧", "厌恶", "忧郁", "惊讶", "平静"];
const EMOTION_KEYS = ["happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"];

export default function VoiceSettings({ value, onChange }: Props) {
    const spkRef = useRef<HTMLInputElement>(null);
    const emoRef = useRef<HTMLInputElement>(null);
    const [spkName, setSpkName] = useState("");
    const [emoName, setEmoName] = useState("");

    const update = (patch: Partial<VoiceSettings>) => onChange({ ...value, ...patch });

    const handleSpkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSpkName(file.name);
        update({ spk_audio_prompt: await fileToBase64(file) });
    };

    const handleEmoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setEmoName(file.name);
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
                <p className="text-xs text-slate-500">参考说话人音频 <span className="text-red-400">*</span></p>
                <button
                    onClick={() => spkRef.current?.click()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-violet-400 text-sm text-slate-600 hover:text-violet-600 transition-all shadow-sm hover:shadow"
                >
                    <span>🎙️</span>
                    <span className="truncate">{spkName || "上传参考音频 (.wav / .mp3)"}</span>
                </button>
                <input ref={spkRef} type="file" accept="audio/*" className="hidden" onChange={handleSpkUpload} />
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
                                ? "bg-violet-50/80 border-violet-300 text-violet-700 shadow-sm ring-1 ring-violet-500/10"
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
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-violet-400 text-sm text-slate-600 hover:text-violet-600 transition-all shadow-sm hover:shadow"
                    >
                        <span>🎭</span>
                        <span className="truncate">{emoName || "上传情感参考音频"}</span>
                    </button>
                    <input ref={emoRef} type="file" accept="audio/*" className="hidden" onChange={handleEmoUpload} />
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>情感强度 (emo_alpha)</span>
                            <span className="text-violet-400 font-mono">{value.emo_alpha.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={2} step={0.05}
                            value={value.emo_alpha}
                            onChange={(e) => update({ emo_alpha: parseFloat(e.target.value) })}
                            className="w-full accent-violet-500"
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
                            <span className="text-xs text-slate-500 w-10 text-right">{label}</span>
                            <input
                                type="range" min={0} max={2} step={0.05}
                                value={emoVec[i]}
                                onChange={(e) => {
                                    const next = [...emoVec];
                                    next[i] = parseFloat(e.target.value);
                                    update({ emo_vector: next });
                                }}
                                className={`flex-1 accent-violet-500`}
                            />
                            <span className={`text-xs font-mono w-8 text-right ${EMOTION_KEYS.map((_, j) => j === i ? "text-violet-400" : "text-slate-500")[i]}`}>
                                {emoVec[i].toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Emotion text */}
            {(value.emotion_mode === "text") && (
                <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">情感描述文字</p>
                    <input
                        value={value.emo_text ?? ""}
                        onChange={(e) => update({ emo_text: e.target.value })}
                        placeholder="e.g. 充满激情与希望"
                        className="w-full rounded-lg bg-white border border-slate-200 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 outline-none text-sm text-slate-700 px-3 py-2 transition-all shadow-inner"
                    />
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>情感强度 (emo_alpha)</span>
                            <span className="text-violet-400 font-mono">{value.emo_alpha.toFixed(2)}</span>
                        </div>
                        <input
                            type="range" min={0} max={2} step={0.05}
                            value={value.emo_alpha}
                            onChange={(e) => update({ emo_alpha: parseFloat(e.target.value) })}
                            className="w-full accent-violet-500"
                        />
                    </div>
                </div>
            )}

            {/* Random toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
                <div
                    onClick={() => update({ use_random: !value.use_random })}
                    className={`w-10 h-5 rounded-full relative transition-colors ${value.use_random ? "bg-violet-600" : "bg-slate-200"}`}
                >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value.use_random ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
                <span className="text-xs text-slate-500">启用随机采样 (降低声音复现度)</span>
            </label>
        </div>
    );
}
