"use client";

import { useState, useEffect } from "react";

export interface SettingsConfig {
    llmApiUrl: string;
    llmToken: string;
    ttsApiUrl: string;
    ttsToken: string;
}

const DEFAULT_CONFIG: SettingsConfig = {
    llmApiUrl: "",
    llmToken: "",
    ttsApiUrl: "",
    ttsToken: "",
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: Props) {
    const [config, setConfig] = useState<SettingsConfig>(DEFAULT_CONFIG);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem("javis_studio_settings");
            if (saved) {
                try {
                    setConfig(JSON.parse(saved));
                } catch (e) {
                    console.error("Failed to parse settings", e);
                }
            }
        }
    }, [isOpen]);

    if (!isMounted || !isOpen) return null;

    const handleSave = () => {
        localStorage.setItem("javis_studio_settings", JSON.stringify(config));
        onClose();
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "javis_config.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedConfig = JSON.parse(event.target?.result as string);
                setConfig({ ...DEFAULT_CONFIG, ...importedConfig });
            } catch (err) {
                alert("导入配置失败，请检查文件格式是否正确");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span>⚙️</span> 全局参数配置
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-700">大模型 (LLM) 设置</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">API 地址</label>
                                <input
                                    type="text"
                                    value={config.llmApiUrl}
                                    onChange={e => setConfig({ ...config, llmApiUrl: e.target.value })}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Token (API Key)</label>
                                <input
                                    type="password"
                                    value={config.llmToken}
                                    onChange={e => setConfig({ ...config, llmToken: e.target.value })}
                                    placeholder="sk-..."
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-700">语音合成 (TTS) 设置</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">API 地址</label>
                                <input
                                    type="text"
                                    value={config.ttsApiUrl}
                                    onChange={e => setConfig({ ...config, ttsApiUrl: e.target.value })}
                                    placeholder="http://localhost:8000/v1"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Token (API Key)</label>
                                <input
                                    type="password"
                                    value={config.ttsToken}
                                    onChange={e => setConfig({ ...config, ttsToken: e.target.value })}
                                    placeholder="如不需要可留空"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="flex gap-2">
                        <button
                            onClick={handleExport}
                            className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                        >
                            导出配置
                        </button>
                        <label className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm cursor-pointer">
                            导入配置
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md shadow-violet-500/20 transition-all hover:shadow-lg hover:shadow-violet-500/30"
                        >
                            保存配置
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
