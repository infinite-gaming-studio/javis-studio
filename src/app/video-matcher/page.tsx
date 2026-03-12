"use client";

import { useState } from "react";
import { Download, Film, Loader2, Play } from "lucide-react";
import { getSettings } from "@/lib/api";

type MatchResult = {
  segment: string;
  keyword: string;
  video_url: string;
  video_id: number;
  thumbnail_url: string;
  duration: number;
  width: number;
  height: number;
};

export default function VideoMatcherPage() {
  const [subtitleText, setSubtitleText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const handleMatch = async () => {
    if (!subtitleText.trim()) return;

    setIsProcessing(true);
    setErrorMsg("");
    setResults([]);

    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/video-matcher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-llm-url": settings.llmApiUrl,
          "x-llm-token": settings.llmToken,
          "x-llm-model": settings.llmModel,
          "x-pexels-key": settings.pexelsApiKey || "",
        },
        body: JSON.stringify({
          text: subtitleText,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      setResults(data.matches || []);
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to match videos");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-50/50 p-6">
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">AI 视频配图</h1>
              <p className="text-sm text-slate-500">根据逐字稿字幕，智能提取关键词并从 Pexels 匹配对应素材。</p>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Input Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-14rem)]">
              <h2 className="text-[15px] font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                输入字幕原稿
              </h2>
              <textarea
                value={subtitleText}
                onChange={(e) => setSubtitleText(e.target.value)}
                placeholder="在此粘贴你的视频配音字幕逐字稿...

例如：
今天我们来学习如何制作美味的红烧肉。首先，准备五花肉切块，然后焯水备用。热锅凉油，放入冰糖炒出糖色..."
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
              />
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {subtitleText.length} 字
                </span>
                <button
                  onClick={handleMatch}
                  disabled={isProcessing || !subtitleText.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      匹配中...
                    </>
                  ) : (
                    <>
                      <Film className="w-4 h-4" />
                      开始匹配
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm min-h-[calc(100vh-14rem)] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  匹配结果 
                  {results.length > 0 && (
                    <span className="bg-indigo-50 text-indigo-600 text-[11px] px-2 py-0.5 rounded-full ml-1">
                      {results.length} 个镜头
                    </span>
                  )}
                </h2>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
                  {errorMsg}
                </div>
              )}

              {/* Results List */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {results.length === 0 && !isProcessing && !errorMsg ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                      <Film className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm">在左侧输入字幕并点击匹配，这里将展示搜索到的视频素材。</p>
                  </div>
                ) : isProcessing ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-4 p-3 border border-slate-100 rounded-xl animate-pulse">
                        <div className="flex-1 space-y-3 py-1">
                          <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-100 rounded w-1/4"></div>
                        </div>
                        <div className="w-40 h-24 bg-slate-100 rounded-lg"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {results.map((result, idx) => (
                      <div key={idx} className="group flex gap-4 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all">
                        
                        {/* Text Content */}
                        <div className="flex-1 flex flex-col min-w-0">
                          <div className="mb-auto">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                #{idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full truncate">
                                关键词: {result.keyword}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-medium">
                              "{result.segment}"
                            </p>
                          </div>
                        </div>

                        {/* Video Thumbnail & Actions */}
                        <div className="relative w-40 h-24 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200 group-hover:border-indigo-200 transition-colors">
                          <img 
                            src={result.thumbnail_url} 
                            alt={result.keyword}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                            <a 
                              href={result.video_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn"
                              title="在新标签页预览"
                            >
                              <Play className="w-4 h-4 text-white group-hover/btn:text-indigo-600 ml-0.5" />
                            </a>
                            <a 
                              href={result.video_url} 
                              download
                              target="_blank"
                              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn"
                              title="下载视频"
                            >
                              <Download className="w-4 h-4 text-white group-hover/btn:text-indigo-600" />
                            </a>
                          </div>
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-medium text-white flex items-center gap-1">
                            {result.duration}s
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
