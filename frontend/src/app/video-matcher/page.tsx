"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Film, Image, Loader2, Play, Edit2, Search, Check, Folder, Save, Trash2, Plus, ChevronDown, FolderOpen } from "lucide-react";
import { getSettings } from "@/lib/api";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";
import { useNotification } from "@/lib/NotificationContext";

type MediaType = "video" | "photo";

type MediaCandidate = {
  source: string;
  media_type: MediaType;
  media_url: string;
  source_url: string;  // Original source page URL for attribution
  media_id: string;    // Changed to string to support YouTube video IDs
  thumbnail_url: string;
  duration: number;
  width: number;
  height: number;
};

type SegmentMatch = {
  segment: string;
  keyword: string;
  media_type: MediaType;
  candidates: MediaCandidate[];
  selectedIndex: number; // which candidate is selected
  error?: string; // Error message if search failed
};

type Project = {
  id: string;
  name: string;
  subtitleText: string;
  results: SegmentMatch[];
  globalMediaType: MediaType;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "video-matcher-projects";
const AUTO_SAVE_KEY = "video-matcher-autosave";

// Generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Sanitize filename for downloads
const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").substring(0, 50);
};

export default function VideoMatcherPage() {
  const { showToast, showConfirm, showError, showSuccess } = useNotification();
  
  // Project state
  const [projectName, setProjectName] = useState("未命名项目");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Work state
  const [subtitleText, setSubtitleText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<SegmentMatch[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [globalMediaType, setGlobalMediaType] = useState<MediaType>("video");

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{url: string, type: MediaType} | null>(null);
  const [downloadingYoutube, setDownloadingYoutube] = useState<string | null>(null);

  // Load saved projects from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const projects = JSON.parse(stored);
          setSavedProjects(projects);
        }
        
        // Load autosave data
        const autosave = localStorage.getItem(AUTO_SAVE_KEY);
        if (autosave) {
          const data = JSON.parse(autosave);
          if (data.projectName) setProjectName(data.projectName);
          if (data.subtitleText) setSubtitleText(data.subtitleText);
          if (data.results) setResults(data.results);
          if (data.globalMediaType) setGlobalMediaType(data.globalMediaType);
          if (data.currentProjectId) setCurrentProjectId(data.currentProjectId);
        }
      } catch (e) {
        console.error("Failed to load projects from localStorage:", e);
      }
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const autosaveData = {
        projectName,
        subtitleText,
        results,
        globalMediaType,
        currentProjectId,
      };
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(autosaveData));
    }
  }, [projectName, subtitleText, results, globalMediaType, currentProjectId]);

  // Save current project
  const saveProject = useCallback(() => {
    if (!projectName.trim()) {
      showToast("请输入项目名称", "warning");
      return;
    }

    setIsSaving(true);
    
    const now = new Date().toISOString();
    const project: Project = {
      id: currentProjectId || generateId(),
      name: projectName.trim(),
      subtitleText,
      results,
      globalMediaType,
      createdAt: currentProjectId ? (savedProjects.find(p => p.id === currentProjectId)?.createdAt || now) : now,
      updatedAt: now,
    };

    setSavedProjects(prev => {
      const existingIndex = prev.findIndex(p => p.id === project.id);
      let newProjects;
      if (existingIndex >= 0) {
        newProjects = [...prev];
        newProjects[existingIndex] = project;
      } else {
        newProjects = [project, ...prev];
      }
      
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newProjects));
      }
      return newProjects;
    });

    setCurrentProjectId(project.id);
    setLastSaved(new Date());
    
    setTimeout(() => setIsSaving(false), 500);
  }, [projectName, subtitleText, results, globalMediaType, currentProjectId, savedProjects, showToast]);

  // Load a project
  const loadProject = useCallback((project: Project) => {
    setProjectName(project.name);
    setSubtitleText(project.subtitleText);
    setResults(project.results);
    setGlobalMediaType(project.globalMediaType);
    setCurrentProjectId(project.id);
    setIsProjectMenuOpen(false);
    setErrorMsg("");
  }, []);

  // Create new project
  const createNewProject = useCallback(() => {
    setProjectName(`新项目 ${new Date().toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
    setSubtitleText("");
    setResults([]);
    setGlobalMediaType("video");
    setCurrentProjectId(null);
    setIsProjectMenuOpen(false);
    setErrorMsg("");
  }, []);

  // Delete a project
  const deleteProject = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm({
      title: "删除项目",
      message: "确定要删除这个项目吗？此操作无法撤销。",
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: () => {
        setSavedProjects(prev => {
          const newProjects = prev.filter(p => p.id !== projectId);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newProjects));
          }
          return newProjects;
        });

        // If deleting current project, reset
        if (currentProjectId === projectId) {
          setCurrentProjectId(null);
        }
      }
    });
  }, [currentProjectId, showConfirm]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveProject]);

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
          "x-pixabay-key": settings.pixabayApiKey || "",
          "x-youtube-key": settings.youtubeApiKey || "",
          "x-unsplash-key": settings.unsplashApiKey || "",
        },
        body: JSON.stringify({
          text: subtitleText,
          media_type: globalMediaType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      const matches: SegmentMatch[] = (data.matches || []).map((m: any) => ({
        ...m,
        selectedIndex: 0,
      }));
      setResults(matches);
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to match videos");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplace = async (idx: number, newMediaType?: MediaType) => {
    if (!editKeyword.trim() || replacingIndex !== null) return;

    setReplacingIndex(idx);
    try {
      const settings = getSettings();
      const targetMediaType = newMediaType || results[idx].media_type;
      const res = await fetch("/api/v1/tools/video-matcher/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pexels-key": settings.pexelsApiKey || "",
          "x-pixabay-key": settings.pixabayApiKey || "",
          "x-youtube-key": settings.youtubeApiKey || "",
          "x-unsplash-key": settings.unsplashApiKey || "",
        },
        body: JSON.stringify({
          keyword: editKeyword.trim(),
          segment: results[idx].segment,
          media_type: targetMediaType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      setResults(prev => {
        const newResults = [...prev];
        newResults[idx] = {
          segment: data.segment,
          keyword: data.keyword,
          media_type: data.media_type,
          candidates: data.candidates,
          selectedIndex: 0,
        };
        return newResults;
      });
      setEditingIndex(null);
    } catch (error: any) {
      showError(error.message || "替换失败");
    } finally {
      setReplacingIndex(null);
    }
  };

  // Toggle media type for a specific segment and re-search
  const handleToggleMediaType = async (idx: number, targetMediaType: MediaType) => {
    if (replacingIndex !== null) return;

    const currentResult = results[idx];
    if (currentResult.media_type === targetMediaType) return;

    setReplacingIndex(idx);
    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/video-matcher/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pexels-key": settings.pexelsApiKey || "",
          "x-pixabay-key": settings.pixabayApiKey || "",
          "x-youtube-key": settings.youtubeApiKey || "",
          "x-unsplash-key": settings.unsplashApiKey || "",
        },
        body: JSON.stringify({
          keyword: currentResult.keyword,
          segment: currentResult.segment,
          media_type: targetMediaType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      setResults(prev => {
        const newResults = [...prev];
        newResults[idx] = {
          segment: data.segment,
          keyword: data.keyword,
          media_type: data.media_type,
          candidates: data.candidates,
          selectedIndex: 0,
        };
        return newResults;
      });
    } catch (error: any) {
      showError(error.message || `切换${targetMediaType === "video" ? "视频" : "图片"}失败`);
    } finally {
      setReplacingIndex(null);
    }
  };

  const handleSelectCandidate = (segIdx: number, candIdx: number) => {
    setResults(prev => {
      const newResults = [...prev];
      newResults[segIdx] = { ...newResults[segIdx], selectedIndex: candIdx };
      return newResults;
    });
  };

  // Helper to poll task status
  const pollTaskStatus = async (taskId: string, onComplete: (resultPath: string) => void, onError: (msg: string) => void) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/tools/tasks/${taskId}`);
        if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
        const task = await res.json();

        if (task.status === "completed") {
          onComplete(`/api/v1/tools/tasks/${taskId}/download`);
        } else if (task.status === "failed") {
          onError(task.message || "任务失败");
        } else {
          // Keep polling
          setTimeout(poll, 2000);
        }
      } catch (e: any) {
        onError(e.message || "轮询任务状态出错");
      }
    };
    poll();
  };

  const handleDownloadAll = async () => {
    if (results.length === 0) return;
    setIsDownloadingAll(true);

    try {
      const items = results.map((result, idx) => {
        const selected = result.candidates[result.selectedIndex];
        return {
          index: idx + 1,
          segment: result.segment,
          keyword: result.keyword,
          source: selected?.source || "unknown",
          media_type: selected?.media_type || "video",
          media_url: selected?.media_url || "",
          source_url: selected?.source_url || "",
          media_id: selected?.media_id || "",
        };
      }).filter(item => item.media_url);

      if (items.length === 0) {
        showToast("没有可下载的素材", "warning");
        setIsDownloadingAll(false);
        return;
      }

      const response = await fetch("/api/v1/tools/video-matcher/download/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: projectName, items }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `下载请求失败: HTTP ${response.status}`);
      }

      const { task_id } = await response.json();
      
      pollTaskStatus(
        task_id,
        (downloadUrl) => {
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = `${sanitizeFilename(projectName) || "media_package"}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setIsDownloadingAll(false);
          showSuccess("打包下载任务已完成！");
        },
        (error) => {
          setIsDownloadingAll(false);
          showError(`打包下载失败: ${error}`);
        }
      );

    } catch (error: any) {
      console.error("Batch download error:", error);
      showError(`打包下载失败: ${error.message || "未知错误"}`);
      setIsDownloadingAll(false);
    }
  };

  const handleDownloadYouTube = async (videoId: string, keyword: string) => {
    if (downloadingYoutube) return;
    
    setDownloadingYoutube(videoId);
    try {
      const res = await fetch(`/api/v1/tools/video-matcher/download/youtube/${videoId}`, {
        method: "GET",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `下载请求失败: HTTP ${res.status}`);
      }

      const { task_id } = await res.json();

      pollTaskStatus(
        task_id,
        (downloadUrl) => {
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = `${keyword.replace(/[^a-zA-Z0-9]/g, "_")}_${videoId}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setDownloadingYoutube(null);
        },
        (error) => {
          setDownloadingYoutube(null);
          showError(`YouTube视频下载失败: ${error}`);
        }
      );
    } catch (error: any) {
      console.error("YouTube download error:", error);
      showError(error.message || "YouTube视频下载失败");
      setDownloadingYoutube(null);
    }
  };

  const getStatus = () => {
    if (errorMsg) return "error";
    if (isProcessing) return "processing";
    if (results.length > 0) return "done";
    return "idle";
  };

  const getStatusText = () => {
    if (errorMsg) return "出错了";
    if (isProcessing) return "匹配中...";
    if (results.length > 0) return "已完成";
    return "就绪";
  };

  const sourceBadgeColor = (source: string) => {
    if (source === "pexels") return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (source === "pixabay") return "bg-amber-50 text-amber-600 border-amber-100";
    if (source === "youtube") return "bg-red-50 text-red-600 border-red-100";
    if (source === "unsplash") return "bg-slate-800 text-white border-slate-700";
    return "bg-slate-50 text-slate-600 border-slate-100";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      <GlobalHeader
        showStatus={true}
        status={getStatus()}
        statusText={getStatusText()}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <main className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex-1 flex flex-col px-6 py-4 max-w-screen-2xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
        
        {/* Header Section with Project Management */}
        <div className="flex flex-col gap-3 shrink-0 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">AI 视频配图</h1>
                <p className="text-sm text-slate-500">根据逐字稿字幕，智能提取关键词并从 Pexels / Pixabay / YouTube / Unsplash 匹配对应素材。</p>
              </div>
            </div>
            
            {/* Project Management Controls */}
            <div className="flex items-center gap-2">
              {/* Project Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-cyan-300 rounded-lg text-sm font-medium text-slate-700 hover:text-cyan-600 transition-all shadow-sm"
                >
                  <FolderOpen className="w-4 h-4" />
                  项目
                  <ChevronDown className={`w-4 h-4 transition-transform ${isProjectMenuOpen ? "rotate-180" : ""}`} />
                </button>
                
                {isProjectMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsProjectMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
                      <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <button
                          onClick={createNewProject}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          新建项目
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {savedProjects.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-400 text-center">
                            暂无保存的项目
                          </div>
                        ) : (
                          savedProjects.map(project => (
                            <div
                              key={project.id}
                              onClick={() => loadProject(project)}
                              className={`flex items-center justify-between px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                                currentProjectId === project.id 
                                  ? "bg-cyan-50 text-cyan-700" 
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{project.name}</div>
                                <div className="text-xs text-slate-400">
                                  {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                              <button
                                onClick={(e) => deleteProject(project.id, e)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                title="删除项目"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Save Button */}
              <button
                onClick={saveProject}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-cyan-500/20 disabled:opacity-50"
                title="保存项目 (Ctrl+S)"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                保存
              </button>
            </div>
          </div>
          
          {/* Project Name Input */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 rounded-lg border border-slate-200/60">
              <Folder className="w-4 h-4 text-cyan-500" />
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="输入项目名称..."
                className="bg-transparent text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none w-48"
              />
              {lastSaved && (
                <span className="text-xs text-slate-400 border-l border-slate-200 pl-2">
                  已保存 {lastSaved.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {currentProjectId && (
              <span className="text-xs text-cyan-600 bg-cyan-50 px-2 py-1 rounded-full">
                已保存的项目
              </span>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          
          {/* Input Panel - Fixed height, not stretching */}
          <div className="lg:col-span-1 flex flex-col min-h-0 h-full">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/60 shadow-xl shadow-cyan-200/40 flex flex-col h-full overflow-hidden">
              {/* Media Type Selector - Moved to top */}
              <div className="mb-4">
                <label className="text-xs font-medium text-slate-500 mb-2 block">素材类型</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    onClick={() => setGlobalMediaType("video")}
                    disabled={isProcessing}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                      globalMediaType === "video"
                        ? "bg-white text-cyan-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    } disabled:opacity-50`}
                  >
                    <Film className="w-4 h-4" />
                    视频
                  </button>
                  <button
                    onClick={() => setGlobalMediaType("photo")}
                    disabled={isProcessing}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                      globalMediaType === "photo"
                        ? "bg-white text-cyan-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    } disabled:opacity-50`}
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
                placeholder="在此粘贴你的视频配音字幕逐字稿...

例如：
今天我们来学习如何制作美味的红烧肉。首先，准备五花肉切块，然后焯水备用。热锅凉油，放入冰糖炒出糖色..."
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none min-h-[120px]"
              />

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-xs font-medium text-slate-400">
                  {subtitleText.length} 字
                </span>
                <button
                  onClick={handleMatch}
                  disabled={isProcessing || !subtitleText.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      匹配中...
                    </>
                  ) : (
                    <>
                      {globalMediaType === "video" ? <Film className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                      开始匹配
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 flex flex-col min-h-0 h-full">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-xl shadow-cyan-200/40 flex flex-col h-full">
              {/* Header - Fixed at top */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  匹配结果
                  {results.length > 0 && (
                    <span className="bg-cyan-50 text-cyan-600 text-[11px] px-2 py-0.5 rounded-full ml-1">
                      {results.length} 个镜头
                    </span>
                  )}
                </h2>
                {results.length > 0 && (
                  <button
                    onClick={handleDownloadAll}
                    disabled={isDownloadingAll || replacingIndex !== null}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 text-slate-700 hover:text-cyan-600 text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloadingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    打包下载
                  </button>
                )}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl shrink-0">
                  {errorMsg}
                </div>
              )}

              {/* Results List - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar min-h-0">
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
                  <div className="space-y-4">
                    {results.map((result, idx) => (
                      <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-cyan-200 hover:shadow-md transition-all">
                        
                        {/* Segment Header */}
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          
                          {/* Media Type Toggle for this segment */}
                          <div className="flex items-center rounded-md overflow-hidden border border-slate-200 bg-slate-50">
                            <button
                              onClick={() => result.media_type !== "video" && handleToggleMediaType(idx, "video")}
                              disabled={replacingIndex === idx}
                              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-all ${
                                result.media_type === "video"
                                  ? "bg-purple-50 text-purple-600 border-r border-purple-200"
                                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 border-r border-slate-200"
                              } disabled:opacity-50`}
                              title="切换到视频"
                            >
                              {replacingIndex === idx && result.media_type !== "video" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Film className="w-3 h-3" />
                              )}
                              视频
                            </button>
                            <button
                              onClick={() => result.media_type !== "photo" && handleToggleMediaType(idx, "photo")}
                              disabled={replacingIndex === idx}
                              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium transition-all ${
                                result.media_type === "photo"
                                  ? "bg-amber-50 text-amber-600"
                                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                              } disabled:opacity-50`}
                              title="切换到图片"
                            >
                              {replacingIndex === idx && result.media_type !== "photo" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Image className="w-3 h-3" />
                              )}
                              图片
                            </button>
                          </div>

                          {editingIndex === idx ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="text"
                                value={editKeyword}
                                onChange={(e) => setEditKeyword(e.target.value)}
                                className="text-xs font-semibold text-cyan-700 bg-white border border-cyan-300 pl-2 pr-2 py-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/20 w-[140px] shadow-sm"
                                placeholder="输入新关键词"
                                disabled={replacingIndex === idx}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleReplace(idx);
                                  if (e.key === 'Escape') setEditingIndex(null);
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => handleReplace(idx)}
                                disabled={replacingIndex === idx}
                                className="text-xs bg-cyan-500 text-white px-2 py-1 rounded shadow-sm hover:bg-cyan-600 disabled:opacity-70 transition-colors flex items-center"
                                title={`重新检索${result.media_type === "video" ? "视频" : "图片"}`}
                              >
                                {replacingIndex === idx ? <Loader2 className="w-3 h-3 animate-spin"/> : <Search className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={() => setEditingIndex(null)}
                                disabled={replacingIndex === idx}
                                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 hover:bg-slate-200 transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingIndex(idx);
                                setEditKeyword(result.keyword);
                              }}
                              className="group/keyword text-xs font-semibold text-cyan-600 bg-cyan-50 border border-cyan-100/50 px-2 py-0.5 rounded-md truncate hover:bg-cyan-100 hover:border-cyan-200 transition-all flex items-center gap-1.5 cursor-text"
                              title="点击修改关键词并重新检索"
                            >
                              <span>关键词: {result.keyword}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/keyword:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>

                        {/* Subtitle text */}
                        <p className="text-sm text-slate-700 leading-relaxed font-medium mb-3">
                          &ldquo;{result.segment}&rdquo;
                        </p>

                        {/* Candidates Row or Error */}
                        {result.error ? (
                          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>{result.error}</span>
                          </div>
                        ) : (
                        <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                          {result.candidates.map((cand, cIdx) => {
                            const isSelected = result.selectedIndex === cIdx;
                            const isVideo = cand.media_type === "video";
                            return (
                              <div
                                key={cIdx}
                                onClick={() => handleSelectCandidate(idx, cIdx)}
                                className={`group relative flex-shrink-0 w-44 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                  isSelected
                                    ? "border-cyan-500 shadow-md shadow-cyan-200/50 ring-2 ring-cyan-500/20"
                                    : "border-slate-200 hover:border-cyan-300"
                                }`}
                              >
                                {/* Thumbnail */}
                                <div className="relative h-28 bg-slate-100">
                                  <img 
                                    src={cand.thumbnail_url} 
                                    alt={result.keyword}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  />
                                  {/* Source URL link - top right, small */}
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
                                  {/* Hover overlay */}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                    {isVideo ? (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setPreviewMedia({url: cand.media_url, type: "video"}); }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn"
                                        title="预览播放"
                                      >
                                        <Play className="w-4 h-4 text-white group-hover/btn:text-cyan-600 ml-0.5" />
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setPreviewMedia({url: cand.media_url, type: "photo"}); }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn"
                                        title="查看大图"
                                      >
                                        <Image className="w-4 h-4 text-white group-hover/btn:text-cyan-600" />
                                      </button>
                                    )}
                                    {/* Download button */}
                                    {cand.source === "youtube" ? (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleDownloadYouTube(cand.media_id, result.keyword); }}
                                        disabled={downloadingYoutube === cand.media_id}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn disabled:opacity-50"
                                        title="下载YouTube视频"
                                      >
                                        {downloadingYoutube === cand.media_id ? (
                                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        ) : (
                                          <Download className="w-4 h-4 text-white group-hover/btn:text-cyan-600" />
                                        )}
                                      </button>
                                    ) : (
                                      <a 
                                        href={cand.media_url} 
                                        download
                                        target="_blank"
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white flex items-center justify-center backdrop-blur-md transition-colors group/btn"
                                        title={`下载${isVideo ? "视频" : "图片"}`}
                                      >
                                        <Download className="w-4 h-4 text-white group-hover/btn:text-cyan-600" />
                                      </a>
                                    )}
                                  </div>
                                  {/* Duration badge (only for video) */}
                                  {isVideo && cand.duration > 0 && (
                                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-medium text-white">
                                      {cand.duration}s
                                    </div>
                                  )}
                                  {/* Media type indicator */}
                                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-medium text-white flex items-center gap-1">
                                    {isVideo ? <Film className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                                  </div>
                                  {/* Selected checkmark - moved to bottom right when duration exists */}
                                  {isSelected && (
                                    <div className={`absolute ${isVideo && cand.duration > 0 ? 'bottom-1 left-1' : 'bottom-1 right-1'} w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shadow-sm`}>
                                      <Check className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                </div>
                                  {/* Source badge */}
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
                )}
              </div>
            </div>
          </div>
          
        </div>
        </div>
      </main>

      {/* Media Preview Modal */}
      {previewMedia && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" 
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
