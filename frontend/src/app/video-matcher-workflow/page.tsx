"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Film, Image, Loader2, Play, Edit2, Search, Check, 
  Folder, Save, Trash2, Plus, ChevronDown, FolderOpen,
  ArrowRight, RefreshCw, AlertCircle, CheckCircle2,
  StepForward, Layers, Download
} from "lucide-react";
import { getSettings } from "@/lib/api";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";

type MediaType = "video" | "photo";
type WorkflowStep = "input" | "segmentation" | "keyword_review" | "media_search" | "media_selection" | "export";

type SegmentData = {
  id: string;
  index: number;
  segment_text: string;
  ai_keyword: string;
  user_keyword?: string;
  keyword_confirmed: boolean;
};

type MediaCandidate = {
  source: string;
  media_type: MediaType;
  media_url: string;
  source_url: string;
  media_id: string;
  thumbnail_url: string;
  duration: number;
  width: number;
  height: number;
  title: string;
};

type SegmentWithMedia = {
  id: string;
  index: number;
  segment_text: string;
  keyword: string;
  media_type: MediaType;
  candidates: MediaCandidate[];
  selected_candidate_index: number;
  search_error?: string;
};

export default function VideoMatcherWorkflowPage() {
  // ═══════════════════════════════════════════════════════════════════════════
  // 状态管理
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 当前步骤
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("input");
  
  // 输入数据
  const [subtitleText, setSubtitleText] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("video");
  
  // Step 1: 分段数据
  const [segments, setSegments] = useState<SegmentData[]>([]);
  const [segmentationError, setSegmentationError] = useState<string>("");
  
  // Step 2: 素材数据
  const [segmentsWithMedia, setSegmentsWithMedia] = useState<SegmentWithMedia[]>([]);
  const [searchStats, setSearchStats] = useState<any>(null);
  
  // UI 状态
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{url: string, type: MediaType} | null>(null);
  
  // 编辑状态
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [reSearchingId, setReSearchingId] = useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: AI 分段 + 关键词提取
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleStep1Segmentation = async () => {
    if (!subtitleText.trim()) return;
    
    setIsLoading(true);
    setLoadingMessage("AI 正在分析文案并提取关键词...");
    setSegmentationError("");
    
    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/workflow/step1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-llm-url": settings.llmApiUrl,
          "x-llm-token": settings.llmToken,
          "x-llm-model": settings.llmModel,
        },
        body: JSON.stringify({ text: subtitleText }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }
      
      const data = await res.json();
      
      if (!data.success) {
        setSegmentationError(data.error || "分段失败");
        // 仍然显示错误，但不阻止用户继续
      }
      
      // 转换数据，默认使用 ai_keyword 作为 user_keyword
      const processedSegments = (data.segments || []).map((s: any) => ({
        ...s,
        user_keyword: s.ai_keyword,
        keyword_confirmed: false,
      }));
      
      setSegments(processedSegments);
      setCurrentStep("keyword_review");
      
    } catch (error: any) {
      setSegmentationError(error.message || "分段请求失败");
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: 搜索素材
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleStep2Search = async () => {
    if (segments.length === 0) return;
    
    setIsLoading(true);
    setLoadingMessage(`正在搜索 ${mediaType === "video" ? "视频" : "图片"} 素材...`);
    
    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/workflow/step2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pexels-key": settings.pexelsApiKey || "",
          "x-pixabay-key": settings.pixabayApiKey || "",
          "x-youtube-key": settings.youtubeApiKey || "",
          "x-unsplash-key": settings.unsplashApiKey || "",
        },
        body: JSON.stringify({
          segments: segments,
          media_type: mediaType,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }
      
      const data = await res.json();
      
      setSegmentsWithMedia(data.segments_with_media || []);
      setSearchStats(data.stats || {});
      setCurrentStep("media_selection");
      
    } catch (error: any) {
      alert(`搜索失败: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 重新搜索单个分段
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleReSearch = async (segmentId: string) => {
    if (!editKeyword.trim()) return;
    
    setReSearchingId(segmentId);
    
    try {
      const settings = getSettings();
      const segment = segmentsWithMedia.find(s => s.id === segmentId);
      
      const res = await fetch("/api/v1/tools/workflow/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pexels-key": settings.pexelsApiKey || "",
          "x-pixabay-key": settings.pixabayApiKey || "",
          "x-youtube-key": settings.youtubeApiKey || "",
          "x-unsplash-key": settings.unsplashApiKey || "",
        },
        body: JSON.stringify({
          segment: segment,
          new_keyword: editKeyword.trim(),
          media_type: mediaType,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }
      
      const data = await res.json();
      
      // 更新本地状态
      setSegmentsWithMedia(prev => prev.map(s => {
        if (s.id === segmentId) {
          return {
            ...s,
            keyword: editKeyword.trim(),
            candidates: data.candidates || [],
            selected_candidate_index: 0,
            search_error: data.error,
          };
        }
        return s;
      }));
      
      setEditingSegmentId(null);
      
    } catch (error: any) {
      alert(`重新搜索失败: ${error.message}`);
    } finally {
      setReSearchingId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 辅助函数
  // ═══════════════════════════════════════════════════════════════════════════
  
  const updateSegmentKeyword = (id: string, newKeyword: string) => {
    setSegments(prev => prev.map(s => 
      s.id === id ? { ...s, user_keyword: newKeyword } : s
    ));
  };

  const confirmSegmentKeyword = (id: string, confirmed: boolean) => {
    setSegments(prev => prev.map(s => 
      s.id === id ? { ...s, keyword_confirmed: confirmed } : s
    ));
  };

  const selectCandidate = (segmentId: string, candidateIndex: number) => {
    setSegmentsWithMedia(prev => prev.map(s => 
      s.id === segmentId ? { ...s, selected_candidate_index: candidateIndex } : s
    ));
  };

  const allKeywordsConfirmed = segments.length > 0 && segments.every(s => s.keyword_confirmed);
  const confirmedCount = segments.filter(s => s.keyword_confirmed).length;

  const sourceBadgeColor = (source: string) => {
    if (source === "pexels") return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (source === "pixabay") return "bg-amber-50 text-amber-600 border-amber-100";
    if (source === "youtube") return "bg-red-50 text-red-600 border-red-100";
    if (source === "unsplash") return "bg-slate-800 text-white border-slate-700";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════════════════════
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans">
      <GlobalHeader
        showStatus={true}
        status={isLoading ? "processing" : "idle"}
        statusText={isLoading ? loadingMessage : "就绪"}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <main className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex-1 flex flex-col px-6 py-4 max-w-screen-2xl mx-auto w-full overflow-hidden">
          
          {/* 标题区域 */}
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">AI 视频配图 (工作流版)</h1>
              <p className="text-sm text-slate-500">三步工作流：分段提取 → 人工确认 → 素材匹配</p>
            </div>
          </div>

          {/* 步骤指示器 */}
          <div className="flex items-center gap-2 mb-6 shrink-0 bg-white/60 rounded-xl p-3 border border-white/60">
            {[
              { key: "input", label: "输入文案", icon: Edit2 },
              { key: "keyword_review", label: "确认关键词", icon: CheckCircle2 },
              { key: "media_selection", label: "选择素材", icon: Film },
            ].map((step, idx) => {
              const isActive = 
                (step.key === "input" && currentStep === "input") ||
                (step.key === "keyword_review" && ["segmentation", "keyword_review"].includes(currentStep)) ||
                (step.key === "media_selection" && ["media_search", "media_selection", "export"].includes(currentStep));
              const isPast = 
                (step.key === "input" && currentStep !== "input") ||
                (step.key === "keyword_review" && ["media_search", "media_selection", "export"].includes(currentStep));
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? "bg-cyan-500 text-white shadow-sm" 
                      : isPast
                        ? "bg-cyan-100 text-cyan-700"
                        : "bg-slate-100 text-slate-400"
                  }`}>
                    <step.icon className="w-4 h-4" />
                    {step.label}
                  </div>
                  {idx < 2 && (
                    <ArrowRight className="w-4 h-4 text-slate-300 mx-2" />
                  )}
                </div>
              );
            })}
          </div>

          {/* 主内容区 */}
          <div className="flex-1 min-h-0 overflow-hidden">
            
            {/* Step 1: 输入文案 */}
            {currentStep === "input" && (
              <div className="h-full flex flex-col gap-4">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/60 shadow-xl shadow-cyan-200/40 flex flex-col h-full">
                  
                  {/* 素材类型选择 */}
                  <div className="mb-4">
                    <label className="text-xs font-medium text-slate-500 mb-2 block">素材类型</label>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                      <button
                        onClick={() => setMediaType("video")}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                          mediaType === "video"
                            ? "bg-white text-cyan-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Film className="w-4 h-4" />
                        视频
                      </button>
                      <button
                        onClick={() => setMediaType("photo")}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                          mediaType === "photo"
                            ? "bg-white text-cyan-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Image className="w-4 h-4" />
                        图片
                      </button>
                    </div>
                  </div>

                  <h2 className="text-[15px] font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    输入字幕原稿
                  </h2>
                  
                  <textarea
                    value={subtitleText}
                    onChange={(e) => setSubtitleText(e.target.value)}
                    placeholder="在此粘贴你的视频配音字幕逐字稿..."
                    className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none min-h-[200px]"
                  />

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">
                      {subtitleText.length} 字
                    </span>
                    <button
                      onClick={handleStep1Segmentation}
                      disabled={isLoading || !subtitleText.trim()}
                      className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          分析中...
                        </>
                      ) : (
                        <>
                          <StepForward className="w-4 h-4" />
                          开始分段提取
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: 关键词确认 */}
            {(currentStep === "segmentation" || currentStep === "keyword_review") && (
              <div className="h-full flex flex-col">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-xl shadow-cyan-200/40 flex flex-col h-full">
                  
                  {/* 头部 */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        确认关键词
                      </h2>
                      <span className="bg-cyan-50 text-cyan-600 text-[11px] px-2 py-0.5 rounded-full">
                        {confirmedCount}/{segments.length} 已确认
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentStep("input")}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        返回修改
                      </button>
                      <button
                        onClick={handleStep2Search}
                        disabled={!allKeywordsConfirmed || isLoading}
                        className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        搜索素材
                      </button>
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {segmentationError && (
                    <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl shrink-0 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">分段时出现问题</p>
                        <p className="text-xs mt-1 opacity-80">{segmentationError}</p>
                        <p className="text-xs mt-2">你可以继续检查和修改关键词，或返回重试。</p>
                      </div>
                    </div>
                  )}

                  {/* 分段列表 */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {segments.map((segment) => (
                      <div 
                        key={segment.id}
                        className={`p-4 rounded-xl border transition-all ${
                          segment.keyword_confirmed 
                            ? "bg-cyan-50/50 border-cyan-200" 
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* 序号 */}
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-medium flex items-center justify-center">
                            {segment.index + 1}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {/* 字幕文本 */}
                            <p className="text-sm text-slate-700 leading-relaxed mb-3">
                              "{segment.segment_text}"
                            </p>
                            
                            {/* 关键词编辑区 */}
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">关键词:</span>
                                <input
                                  type="text"
                                  value={segment.user_keyword || segment.ai_keyword}
                                  onChange={(e) => updateSegmentKeyword(segment.id, e.target.value)}
                                  className="text-sm font-medium text-cyan-700 bg-white border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-cyan-400 w-40"
                                />
                              </div>
                              
                              {/* 确认按钮 */}
                              <button
                                onClick={() => confirmSegmentKeyword(segment.id, !segment.keyword_confirmed)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                                  segment.keyword_confirmed
                                    ? "bg-cyan-500 text-white"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                {segment.keyword_confirmed ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    已确认
                                  </>
                                ) : (
                                  "点击确认"
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 底部提示 */}
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <p className="text-xs text-slate-500">
                      💡 提示：检查每个分段的关键词是否准确描述了画面内容，确认后即可搜索素材
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: 素材选择 */}
            {(currentStep === "media_search" || currentStep === "media_selection") && (
              <div className="h-full flex flex-col">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-xl shadow-cyan-200/40 flex flex-col h-full">
                  
                  {/* 头部 */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        选择素材
                      </h2>
                      {searchStats && (
                        <span className="bg-emerald-50 text-emerald-600 text-[11px] px-2 py-0.5 rounded-full">
                          {searchStats.with_media}/{searchStats.total_segments} 匹配成功
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentStep("keyword_review")}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        返回修改关键词
                      </button>
                      <button
                        onClick={() => alert("导出功能开发中...")}
                        className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        导出结果
                      </button>
                    </div>
                  </div>

                  {/* 素材列表 */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {segmentsWithMedia.map((segment) => (
                      <div 
                        key={segment.id}
                        className="p-4 bg-white border border-slate-200 rounded-xl"
                      >
                        {/* 分段头部 */}
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{segment.index + 1}
                          </span>
                          
                          {/* 关键词显示/编辑 */}
                          {editingSegmentId === segment.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editKeyword}
                                onChange={(e) => setEditKeyword(e.target.value)}
                                className="text-xs font-semibold text-cyan-700 bg-white border border-cyan-300 pl-2 pr-2 py-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/20 w-[140px]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleReSearch(segment.id);
                                  if (e.key === 'Escape') setEditingSegmentId(null);
                                }}
                              />
                              <button
                                onClick={() => handleReSearch(segment.id)}
                                disabled={reSearchingId === segment.id}
                                className="text-xs bg-cyan-500 text-white px-2 py-1 rounded shadow-sm hover:bg-cyan-600 disabled:opacity-70 transition-colors flex items-center"
                              >
                                {reSearchingId === segment.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin"/>
                                ) : (
                                  <Search className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                onClick={() => setEditingSegmentId(null)}
                                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 hover:bg-slate-200 transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingSegmentId(segment.id);
                                setEditKeyword(segment.keyword);
                              }}
                              className="group/keyword text-xs font-semibold text-cyan-600 bg-cyan-50 border border-cyan-100/50 px-2 py-0.5 rounded-md truncate hover:bg-cyan-100 hover:border-cyan-200 transition-all flex items-center gap-1.5 cursor-text"
                            >
                              <span>关键词: {segment.keyword}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/keyword:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>

                        {/* 字幕文本 */}
                        <p className="text-sm text-slate-700 leading-relaxed font-medium mb-3">
                          &ldquo;{segment.segment_text}&rdquo;
                        </p>

                        {/* 错误提示或素材列表 */}
                        {segment.search_error ? (
                          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{segment.search_error}</span>
                          </div>
                        ) : segment.candidates.length === 0 ? (
                          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
                            <span>未找到匹配的素材</span>
                          </div>
                        ) : (
                          <div className="flex gap-3 overflow-x-auto pb-1">
                            {segment.candidates.map((cand, cIdx) => {
                              const isSelected = segment.selected_candidate_index === cIdx;
                              const isVideo = cand.media_type === "video";
                              return (
                                <div
                                  key={cIdx}
                                  onClick={() => selectCandidate(segment.id, cIdx)}
                                  className={`group relative flex-shrink-0 w-44 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                    isSelected
                                      ? "border-cyan-500 shadow-md shadow-cyan-200/50 ring-2 ring-cyan-500/20"
                                      : "border-slate-200 hover:border-cyan-300"
                                  }`}
                                >
                                  {/* 缩略图 */}
                                  <div className="relative h-28 bg-slate-100">
                                    <img 
                                      src={cand.thumbnail_url} 
                                      alt={segment.keyword}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                    {/* 来源链接 */}
                                    <a 
                                      href={cand.source_url || cand.media_url} 
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute top-1 right-1 z-10 w-5 h-5 rounded bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                                      title="查看原素材页面"
                                    >
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </a>
                                    {/* 悬停操作 */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setPreviewMedia({url: cand.media_url, type: cand.media_type}); }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors"
                                        title={isVideo ? "预览播放" : "查看大图"}
                                      >
                                        {isVideo ? (
                                          <Play className="w-4 h-4 text-white group-hover:text-cyan-600 ml-0.5" />
                                        ) : (
                                          <Image className="w-4 h-4 text-white group-hover:text-cyan-600" />
                                        )}
                                      </button>
                                    </div>
                                    {/* 时长标签 */}
                                    {isVideo && cand.duration > 0 && (
                                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-medium text-white">
                                        {cand.duration}s
                                      </div>
                                    )}
                                    {/* 选中标记 */}
                                    {isSelected && (
                                      <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shadow-sm">
                                        <Check className="w-3 h-3 text-white" />
                                      </div>
                                    )}
                                  </div>
                                  {/* 来源标签 */}
                                  <div className={`px-2 py-1 text-[10px] font-bold uppercase text-center border-t ${sourceBadgeColor(cand.source)}`}>
                                    {cand.source}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* 预览弹窗 */}
      {previewMedia && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" 
          onClick={() => setPreviewMedia(null)}
        >
          <div 
            className={`relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 flex flex-col items-center justify-center ${
              previewMedia.type === "video" ? "aspect-[16/9]" : ""
            }`}
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setPreviewMedia(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
            >
              ×
            </button>
            {previewMedia.type === "video" ? (
              previewMedia.url.includes("youtube.com/embed") ? (
                <iframe
                  src={previewMedia.url}
                  title="YouTube video preview"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              ) : (
                <video 
                  src={previewMedia.url} 
                  controls 
                  autoPlay 
                  className="w-full h-full"
                />
              )
            ) : (
              <img 
                src={previewMedia.url} 
                alt="Preview" 
                className="max-w-full max-h-[80vh] object-contain"
              />
            )}
          </div>
        </div>
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
