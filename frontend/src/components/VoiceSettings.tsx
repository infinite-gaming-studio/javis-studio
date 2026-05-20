import { useRef, useState, useEffect } from "react";
import { Mic2, Settings2, Sliders } from "lucide-react";
import { type VoiceSettings, type CustomEmotion, fileToBase64 } from "@/lib/api";

interface Props {
    value: VoiceSettings;
    onChange: (v: VoiceSettings) => void;
    customEmotions: CustomEmotion[];
    onOpenLibrary: () => void;
}

export default function VoiceSettings({ value, onChange, customEmotions, onOpenLibrary }: Props) {
    const spkRef = useRef<HTMLInputElement>(null);
    const [spkName, setSpkName] = useState("");
    const [spkPreview, setSpkPreview] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            if (spkPreview) URL.revokeObjectURL(spkPreview);
        };
    }, [spkPreview]);

    // Clear state when speaker audio is empty
    useEffect(() => {
        if (!value.spk_audio_prompt) {
            if (spkPreview) {
                URL.revokeObjectURL(spkPreview);
                setSpkPreview(null);
            }
            setSpkName("");
            if (spkRef.current) spkRef.current.value = "";
        }
    }, [value.spk_audio_prompt]);

    const update = (patch: Partial<VoiceSettings>) => onChange({ ...value, ...patch });

    const handleSpkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSpkName(file.name);
        if (spkPreview) URL.revokeObjectURL(spkPreview);
        setSpkPreview(URL.createObjectURL(file));
        update({ spk_audio_prompt: await fileToBase64(file) });
        if (spkRef.current) spkRef.current.value = "";
    };

    return (
        <div className="space-y-5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                语音与情绪设置
            </label>

            {/* Speaker reference audio */}
            <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-700">参考说话人音频 <span className="text-red-400">*</span></p>
                <button
                    onClick={() => spkRef.current?.click()}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl border transition-all shadow-sm ${
                        spkName 
                            ? 'bg-cyan-50 border-cyan-300 text-cyan-700 hover:bg-cyan-100 hover:shadow' 
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500 border-transparent text-white hover:from-cyan-600 hover:to-blue-600 hover:shadow-md'
                    }`}
                >
                    <Mic2 className={`w-5 h-5 ${spkName ? 'text-cyan-600' : 'text-white'}`} />
                    <span className="truncate font-semibold text-sm">
                        {spkName || "点击上传参考说话人音频"}
                    </span>
                </button>
                <input ref={spkRef} type="file" accept="audio/*" className="hidden" onChange={handleSpkUpload} />
                {spkPreview && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">播放预览</span>
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

      {/* Random toggle */}
      <div className="py-1">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div
            onClick={() => update({ use_random: !value.use_random })}
            className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${value.use_random ? "bg-cyan-500" : "bg-slate-200"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value.use_random ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </div>
          <span className="text-xs font-semibold text-slate-600">启用随机采样 (降低声音复现度)</span>
        </label>
      </div>

      {/* Speed control */}
      <div className="py-1">
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">语速控制</label>
          <span className="text-xs font-bold text-cyan-600">
            {(value.speed ?? 1.0).toFixed(2)}x{(value.speed ?? 1.0) === 1.0 ? " 正常" : (value.speed ?? 1.0) > 1.0 ? " 加速" : " 减速"}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={value.speed ?? 1.0}
            onChange={(e) => update({ speed: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500"
            style={{ margin: '0', padding: '0' }}
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1" style={{ paddingLeft: '6px', paddingRight: '6px' }}>
            <span>0.5x 慢速</span>
            <span>1.0x 正常</span>
            <span>2.0x 快速</span>
          </div>
        </div>
      </div>

        </div>
    );
}
