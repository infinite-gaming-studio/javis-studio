"use client";

const TEMPLATES = [
    { label: "产品推介", text: "请根据图片为这款产品生成一段30秒左右的专业推广旁白，语气专业而不失温度。" },
    { label: "纪录片解说", text: "请根据图片内容，以纪录片旁白风格写一段约60秒的解说词，富有感染力。" },
    { label: "短视频配音", text: "请为这个视频画面写一段生动有趣的旁白，适合短视频平台，30秒以内。" },
    { label: "企业宣传", text: "请根据图片为公司/品牌生成一段企业形象宣传旁白，体现专业与创新。" },
];

interface Props {
    value: string;
    onChange: (v: string) => void;
}

export default function PromptEditor({ value, onChange }: Props) {
    return (
        <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                旁白提示词
            </label>

            {/* Quick templates */}
            <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                    <button
                        key={t.label}
                        onClick={() => onChange(t.text)}
                        className="px-2.5 py-1 rounded-full text-xs bg-white border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-600 transition-all duration-200 shadow-sm hover:shadow"
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                placeholder="描述你想要的旁白风格、情感基调、时长要求……"
                className="w-full rounded-xl bg-white/60 border border-slate-200 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 outline-none
                   text-sm text-slate-800 placeholder-slate-400 px-3 py-2.5 resize-none
                   transition-all duration-200 shadow-inner"
            />
            <p className="text-right text-xs text-slate-500">{value.length} 字</p>
        </div>
    );
}
