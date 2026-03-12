"use client";

import { useState, useEffect, useRef, useMemo } from "react";

export interface SettingsConfig {
    llmApiUrl: string;
    llmToken: string;
    llmModel: string;
    savedModels: string[];
    ttsApiUrl: string;
    ttsToken: string;
    pexelsApiKey: string;
    pixabayApiKey: string;
}

type TestStatus = "idle" | "testing" | "success" | "error";

const DEFAULT_CONFIG: SettingsConfig = {
    llmApiUrl: "",
    llmToken: "",
    llmModel: "gpt-3.5-turbo",
    savedModels: ["gpt-3.5-turbo", "gpt-4", "gpt-4o", "claude-3-5-sonnet-20240620", "deepseek-chat"],
    ttsApiUrl: "",
    ttsToken: "",
    pexelsApiKey: "",
    pixabayApiKey: "",
};

interface NvidiaModel {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: Props) {
    const [config, setConfig] = useState<SettingsConfig>(DEFAULT_CONFIG);
    const [isMounted, setIsMounted] = useState(false);
    const [showModels, setShowModels] = useState(false);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const modelInputRef = useRef<HTMLInputElement>(null);

    const [llmTestStatus, setLlmTestStatus] = useState<TestStatus>("idle");
    const [llmTestMsg, setLlmTestMsg] = useState("");
    const [ttsTestStatus, setTtsTestStatus] = useState<TestStatus>("idle");
    const [ttsTestMsg, setTtsTestMsg] = useState("");
    const [pexelsTestStatus, setPexelsTestStatus] = useState<TestStatus>("idle");
    const [pexelsTestMsg, setPexelsTestMsg] = useState("");
    const [pixabayTestStatus, setPixabayTestStatus] = useState<TestStatus>("idle");
    const [pixabayTestMsg, setPixabayTestMsg] = useState("");

    // Model fetching states
    const [availableModels, setAvailableModels] = useState<NvidiaModel[]>([]);
    const [modelSearchQuery, setModelSearchQuery] = useState("");
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [fetchModelsError, setFetchModelsError] = useState("");

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModels(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter models based on search query (fuzzy search)
    const filteredModels = useMemo(() => {
        const query = modelSearchQuery.toLowerCase().trim();
        if (!query) return availableModels;
        
        // Support multiple keywords separated by spaces
        const keywords = query.split(/\s+/).filter(k => k.length > 0);
        
        return availableModels.filter(model => {
            const modelId = model.id.toLowerCase();
            const ownedBy = model.owned_by?.toLowerCase() || '';
            // All keywords must match somewhere (in id or owned_by)
            return keywords.every(keyword => 
                modelId.includes(keyword) || ownedBy.includes(keyword)
            );
        });
    }, [availableModels, modelSearchQuery]);

    // Fetch models from NVIDIA API
    const fetchModels = async () => {
        if (!config.llmApiUrl || !config.llmToken) {
            setFetchModelsError("请先填写 API 地址和 Token");
            return;
        }

        setIsFetchingModels(true);
        setFetchModelsError("");
        
        try {
            let baseUrl = config.llmApiUrl.trim();
            // Remove trailing slash
            baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            // Remove /chat/completions or /completions suffix
            baseUrl = baseUrl.replace(/\/chat\/completions$/, "").replace(/\/completions$/, "");
            
            const modelsUrl = `${baseUrl}/models`;

            const res = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: modelsUrl,
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${config.llmToken}`,
                    }
                })
            });

            const data = await res.json();
            
            if (data.ok && data.data?.data) {
                const models: NvidiaModel[] = data.data.data;
                // Remove duplicate models by id (keep first occurrence)
                const uniqueModels = Array.from(new Map(models.map(m => [m.id, m])).values());
                setAvailableModels(uniqueModels);
                // Merge with saved models
                const modelIds = models.map(m => m.id);
                const mergedModels = Array.from(new Set([...modelIds, ...config.savedModels]));
                setConfig(prev => ({ ...prev, savedModels: mergedModels }));
            } else {
                setFetchModelsError(data.errorDetail || "获取模型列表失败");
            }
        } catch (e: unknown) {
            setFetchModelsError(`请求异常: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsFetchingModels(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem("javis_studio_settings");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // eslint-disable-next-line react-hooks/set-state-in-effect
                    setConfig({
                        ...DEFAULT_CONFIG,
                        ...parsed,
                        savedModels: parsed.savedModels || DEFAULT_CONFIG.savedModels,
                        llmModel: typeof parsed.llmModel === 'string' ? parsed.llmModel : DEFAULT_CONFIG.llmModel
                    });
                } catch (e) {
                    console.error("Failed to parse settings", e);
                }
            }
        }
    }, [isOpen]);

    const testLLMConnection = async () => {
        setLlmTestStatus("testing");
        setLlmTestMsg("");
        try {
            const url = config.llmApiUrl || "https://api.openai.com/v1";
            let baseUrl = url.trim().endsWith('/') ? url.trim().slice(0, -1) : url.trim();

            // If the user provided a full completions endpoint, strip it to get the base API URL
            baseUrl = baseUrl.replace(/\/chat\/completions$/, "").replace(/\/completions$/, "");

            // /models is the standard OpenAI-compatible way to test connectivity and verify the key
            const testUrl = `${baseUrl}/models`;

            const res = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: testUrl,
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${config.llmToken}`,
                    }
                })
            });

            const data = await res.json();
            if (data.ok) {
                setLlmTestStatus("success");
                setLlmTestMsg("连接成功！");
            } else {
                setLlmTestStatus("error");
                const statusInfo = data.status ? `${data.status} ` : "";
                setLlmTestMsg(`连接失败: ${statusInfo}${data.errorDetail || data.statusText || '未知错误'}`);
            }
        } catch (e: unknown) {
            setLlmTestStatus("error");
            setLlmTestMsg(`请求异常: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const testTTSConnection = async () => {
        setTtsTestStatus("testing");
        setTtsTestMsg("");
        try {
            const url = config.ttsApiUrl || "http://localhost:8000";
            let baseUrl = url.trim().endsWith('/') ? url.trim().slice(0, -1) : url.trim();

            // According to API.md, the health check endpoint is /api/health
            // If the user already provided /api, we append /health, otherwise /api/health
            const testUrl = baseUrl.endsWith('/api') ? `${baseUrl}/health` : `${baseUrl}/api/health`;

            const res = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: testUrl,
                    method: "GET",
                    headers: config.ttsToken ? {
                        "Authorization": `Bearer ${config.ttsToken}`,
                    } : {}
                })
            });

            const data = await res.json();
            if (data.ok) {
                setTtsTestStatus("success");
                setTtsTestMsg("连接成功！");
            } else {
                // Fallback: try base URL if /api/health fails
                const baseRes = await fetch("/api/test-connection", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: baseUrl, method: "GET" })
                });
                const baseData = await baseRes.json();

                if (baseData.ok) {
                    setTtsTestStatus("success");
                    setTtsTestMsg("服务器可访问 (但健康检查未通过)");
                } else {
                    setTtsTestStatus("error");
                    const statusInfo = data.status ? `${data.status} ` : "";
                    setTtsTestMsg(`连接失败: ${statusInfo}${data.errorDetail || data.statusText || '未知错误'}`);
                }
            }
        } catch (e: unknown) {
            setTtsTestStatus("error");
            setTtsTestMsg(`请求异常: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const testPexelsConnection = async () => {
        setPexelsTestStatus("testing");
        setPexelsTestMsg("");
        try {
            if (!config.pexelsApiKey) {
                setPexelsTestStatus("error");
                setPexelsTestMsg("请先填写 API Key");
                return;
            }

            const res = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: "https://api.pexels.com/v1/search?query=nature&per_page=1",
                    method: "GET",
                    headers: {
                        "Authorization": config.pexelsApiKey,
                    }
                })
            });

            const data = await res.json();
            if (data.ok) {
                setPexelsTestStatus("success");
                setPexelsTestMsg("连接成功！");
            } else {
                setPexelsTestStatus("error");
                const statusInfo = data.status ? `${data.status} ` : "";
                setPexelsTestMsg(`连接失败: ${statusInfo}${data.errorDetail || data.statusText || '未知错误'}`);
            }
        } catch (e: unknown) {
            setPexelsTestStatus("error");
            setPexelsTestMsg(`请求异常: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const testPixabayConnection = async () => {
        setPixabayTestStatus("testing");
        setPixabayTestMsg("");
        try {
            if (!config.pixabayApiKey) {
                setPixabayTestStatus("error");
                setPixabayTestMsg("请先填写 API Key");
                return;
            }

            const res = await fetch("/api/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: `https://pixabay.com/api/videos/?key=${config.pixabayApiKey}&q=test&per_page=3`,
                    method: "GET",
                    headers: {}
                })
            });

            const data = await res.json();
            if (data.ok) {
                setPixabayTestStatus("success");
                setPixabayTestMsg("连接成功！");
            } else {
                setPixabayTestStatus("error");
                const statusInfo = data.status ? `${data.status} ` : "";
                setPixabayTestMsg(`连接失败: ${statusInfo}${data.errorDetail || data.statusText || '未知错误'}`);
            }
        } catch (e: unknown) {
            setPixabayTestStatus("error");
            setPixabayTestMsg(`请求异常: ${e instanceof Error ? e.message : String(e)}`);
        }
    };


    if (!isMounted || !isOpen) return null;

    const handleSave = () => {
        const finalConfig = { ...config };

        if (finalConfig.llmModel?.trim()) {
            const currentModels = finalConfig.savedModels || [];
            if (!currentModels.includes(finalConfig.llmModel.trim())) {
                finalConfig.savedModels = [...currentModels, finalConfig.llmModel.trim()];
            }
        } else {
            finalConfig.savedModels = finalConfig.savedModels || DEFAULT_CONFIG.savedModels;
        }

        localStorage.setItem("javis_studio_settings", JSON.stringify(finalConfig));
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
            } catch {
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
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700">大模型 (LLM) 设置</h3>
                            <div className="flex items-center gap-2">
                                {llmTestMsg && (
                                    <span className={`text-[10px] font-medium ${llmTestStatus === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {llmTestMsg}
                                    </span>
                                )}
                                <button
                                    onClick={testLLMConnection}
                                    disabled={llmTestStatus === "testing"}
                                    className="px-2 py-0.5 text-[10px] font-bold text-cyan-600 border border-cyan-200 rounded bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                                >
                                    {llmTestStatus === "testing" ? "测试中..." : "测试连接"}
                                </button>
                            </div>
                        </div>
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
                            <div className="relative" ref={modelDropdownRef}>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-slate-500">模型名称 (Model)</label>
                                    <button
                                        type="button"
                                        onClick={fetchModels}
                                        disabled={isFetchingModels || !config.llmApiUrl || !config.llmToken}
                                        className="text-[10px] text-cyan-600 hover:text-cyan-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                    >
                                        {isFetchingModels ? (
                                            <>
                                                <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                                </svg>
                                                获取中...
                                            </>
                                        ) : (
                                            <>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                    <path d="M3 3v5h5" />
                                                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                                    <path d="M16 16h5v5" />
                                                </svg>
                                                获取模型列表
                                            </>
                                        )}
                                    </button>
                                </div>
                                {fetchModelsError && (
                                    <div className="text-[10px] text-red-500 mb-1">{fetchModelsError}</div>
                                )}
                                <div className="flex border border-slate-200 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent transition-all">
                                    <input
                                        ref={modelInputRef}
                                        type="text"
                                        value={config.llmModel || ""}
                                        onChange={e => setConfig({ ...config, llmModel: e.target.value })}
                                        onFocus={() => setShowModels(true)}
                                        placeholder="输入或选择模型名"
                                        className="w-full text-sm px-3 py-2 bg-transparent focus:outline-none flex-grow"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowModels(!showModels)}
                                        className="px-3 py-2 text-slate-400 hover:text-slate-600 border-l border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                </div>
                                {showModels && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
                                        {/* Search input */}
                                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                                            <div className="relative">
                                                <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="11" cy="11" r="8" />
                                                    <path d="m21 21-4.3-4.3" />
                                                </svg>
                                                <input
                                                    type="text"
                                                    value={modelSearchQuery}
                                                    onChange={e => setModelSearchQuery(e.target.value)}
                                                    placeholder="搜索模型..."
                                                    className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        </div>
                                        {/* Models list */}
                                        <div className="overflow-y-auto max-h-48">
                                            {filteredModels.length > 0 ? (
                                                filteredModels.map(model => (
                                                    <div 
                                                        key={model.id} 
                                                        className="flex items-center justify-between px-3 py-2 hover:bg-violet-50 group cursor-pointer border-b border-slate-50 last:border-0"
                                                        onClick={() => {
                                                            setConfig({ ...config, llmModel: model.id });
                                                            setShowModels(false);
                                                            setModelSearchQuery("");
                                                        }}
                                                    >
                                                        <div className="flex flex-col flex-grow min-w-0">
                                                            <span className="text-sm text-slate-700 truncate" title={model.id}>
                                                                {model.id}
                                                            </span>
                                                            {model.owned_by && model.owned_by !== model.id && (
                                                                <span className="text-[10px] text-slate-400 truncate">
                                                                    {model.owned_by}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {config.llmModel === model.id && (
                                                            <svg className="text-violet-500 flex-shrink-0 ml-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M20 6 9 17l-5-5" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                ))
                                            ) : availableModels.length > 0 ? (
                                                <div className="px-3 py-4 text-center text-xs text-slate-400">
                                                    未找到匹配的模型
                                                </div>
                                            ) : config.savedModels?.length > 0 ? (
                                                // Fallback to saved models if no API models fetched
                                                config.savedModels.map(model => (
                                                    <div 
                                                        key={model} 
                                                        className="flex items-center justify-between px-3 py-2 hover:bg-violet-50 group cursor-pointer border-b border-slate-50 last:border-0"
                                                        onClick={() => {
                                                            setConfig({ ...config, llmModel: model });
                                                            setShowModels(false);
                                                        }}
                                                    >
                                                        <span className="text-sm text-slate-700 flex-grow">
                                                            {model}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfig({
                                                                    ...config,
                                                                    savedModels: (config.savedModels || []).filter(m => m !== model)
                                                                });
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:!text-red-500 p-1 rounded-md hover:bg-red-50 transition-all"
                                                            title="删除该模型"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="px-3 py-4 text-center text-xs text-slate-400">
                                                    暂无模型，请点击"获取模型列表"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700">语音合成 (TTS) 设置</h3>
                            <div className="flex items-center gap-2">
                                {ttsTestMsg && (
                                    <span className={`text-[10px] font-medium ${ttsTestStatus === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {ttsTestMsg}
                                    </span>
                                )}
                                <button
                                    onClick={testTTSConnection}
                                    disabled={ttsTestStatus === "testing"}
                                    className="px-2 py-0.5 text-[10px] font-bold text-cyan-600 border border-cyan-200 rounded bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                                >
                                    {ttsTestStatus === "testing" ? "测试中..." : "测试连接"}
                                </button>
                            </div>
                        </div>
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

                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700">外部服务 (APIs) 设置</h3>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-slate-500">Pexels API Key</label>
                                    <div className="flex items-center gap-2">
                                        {pexelsTestMsg && (
                                            <span className={`text-[10px] font-medium ${pexelsTestStatus === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {pexelsTestMsg}
                                            </span>
                                        )}
                                        <button
                                            onClick={testPexelsConnection}
                                            disabled={pexelsTestStatus === "testing"}
                                            className="px-2 py-0.5 text-[10px] font-bold text-cyan-600 border border-cyan-200 rounded bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                                        >
                                            {pexelsTestStatus === "testing" ? "测试中..." : "测试连接"}
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="password"
                                    value={config.pexelsApiKey || ""}
                                    onChange={e => setConfig({ ...config, pexelsApiKey: e.target.value })}
                                    placeholder="用于视频素材匹配 (pexels.com)"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-slate-500">Pixabay API Key</label>
                                    <div className="flex items-center gap-2">
                                        {pixabayTestMsg && (
                                            <span className={`text-[10px] font-medium ${pixabayTestStatus === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {pixabayTestMsg}
                                            </span>
                                        )}
                                        <button
                                            onClick={testPixabayConnection}
                                            disabled={pixabayTestStatus === "testing"}
                                            className="px-2 py-0.5 text-[10px] font-bold text-cyan-600 border border-cyan-200 rounded bg-cyan-50 hover:bg-cyan-100 transition-colors disabled:opacity-50"
                                        >
                                            {pixabayTestStatus === "testing" ? "测试中..." : "测试连接"}
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="password"
                                    value={config.pixabayApiKey || ""}
                                    onChange={e => setConfig({ ...config, pixabayApiKey: e.target.value })}
                                    placeholder="用于视频素材匹配 (pixabay.com)"
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
                            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-xl shadow-md shadow-cyan-500/20 transition-all hover:shadow-lg hover:shadow-cyan-500/30"
                        >
                            保存配置
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
