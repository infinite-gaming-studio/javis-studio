"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { 
  ProjectPage, 
  AudioClip, 
  VoiceSettings, 
  ttsSingleVersion,
  audioUrl
} from "@/lib/api";
import { 
  dbSaveProject, 
  dbLoadProject, 
  dbListProjects, 
  dbDeleteProject, 
  dbSaveTempData,
  dbLoadTempData,
  ProjectMeta, 
  isIndexedDBAvailable 
} from "@/lib/db";
import { useNotification } from "@/lib/NotificationContext";
import JSZip from "jszip";

import { XCircle, History, Trash2, Sparkles, Wand2, FileUp, Loader2, Download, Film, Clapperboard } from "lucide-react";
import PageList from "@/components/PageList";
import PageEditor from "@/components/PageEditor";
import PageAudioPlayer from "@/components/PageAudioPlayer";
import VoiceSettingsPanel from "@/components/VoiceSettings";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";

const DEFAULT_VOICE: VoiceSettings = {
  spk_audio_prompt: "",
  emotion_mode: "none",
  emo_alpha: 1.0,
  use_random: false,
};

const TEMP_STORAGE_KEY = "javis_studio_temp_v2";
const TEMP_STORAGE_EXPIRY = 24 * 60 * 60 * 1000;

interface TempStorageData {
  projectName: string;
  topic: string;
  pages: ProjectPage[];
  voiceSettings: VoiceSettings;
  timestamp: number;
}

async function saveTempData(data: Omit<TempStorageData, 'timestamp'>) {
  if (typeof window === "undefined" || !isIndexedDBAvailable()) return;
  try {
    await dbSaveTempData(TEMP_STORAGE_KEY, { ...data, timestamp: Date.now() });
  } catch (err) {
    console.error("Failed to save temp data to IndexedDB", err);
  }
}

async function loadTempData(): Promise<TempStorageData | null> {
  if (typeof window === "undefined" || !isIndexedDBAvailable()) return null;
  try {
    const data = await dbLoadTempData<TempStorageData>(TEMP_STORAGE_KEY);
    if (data) {
      if (Date.now() - data.timestamp > TEMP_STORAGE_EXPIRY) {
        // Technically we should delete it, but returning null is fine for now
        return null;
      }
      return data;
    }
  } catch (err) {
    console.error("Failed to load temp data from IndexedDB", err);
  }
  return null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export default function StudioPage() {
  const { showConfirm, showToast } = useNotification();
  
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [history, setHistory] = useState<ProjectMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // States
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [generatingAudioIds, setGeneratingAudioIds] = useState<string[]>([]);
  const [currentPlayingClipId, setCurrentPlayingClipId] = useState<string | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [isDownloadingProject, setIsDownloadingProject] = useState(false);
  const [generationTask, setGenerationTask] = useState<{ total: number; finished: number; startTime: number } | null>(null);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [videoRenderProgress, setVideoRenderProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (isIndexedDBAvailable()) {
      dbListProjects().then(setHistory).catch(console.error);
      
      loadTempData().then(tempData => {
        if (tempData) {
          setProjectName(tempData.projectName);
          setTopic(tempData.topic);
          setPages(tempData.pages);
          setVoiceSettings(tempData.voiceSettings);
        }
      });
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (projectName || topic || pages.length > 0) {
        saveTempData({ projectName, topic, pages, voiceSettings });
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [projectName, topic, pages, voiceSettings]);

  const saveCurrentProject = useCallback(async () => {
    if (!projectName.trim() && pages.length === 0) return;
    const now = new Date().toISOString();
    const id = currentProjectId || generateId();
    const name = projectName.trim() || `未命名项目 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    
    const projectData = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      topic,
      voiceSettings,
      pages,
    };

    try {
      await dbSaveProject(projectData);
      setCurrentProjectId(id);
      dbListProjects().then(setHistory);
      showToast("项目已保存", "success");
    } catch (err) {
      console.error("保存失败:", err);
      showToast("保存失败，请重试", "error");
    }
  }, [projectName, pages, currentProjectId, topic, voiceSettings, showToast]);

  const loadProject = useCallback(async (meta: ProjectMeta) => {
    try {
      const data = await dbLoadProject<any>(meta.id);
      if (data) {
        setCurrentProjectId(data.id);
        setProjectName(data.name);
        setTopic(data.topic || "");
        setPages(data.pages || []);
        setVoiceSettings(data.voiceSettings || DEFAULT_VOICE);
        setSelectedPageIndex(0);
        setShowHistory(false);
        showToast("项目加载成功", "success");
      }
    } catch (err) {
      console.error("加载失败:", err);
      showToast("加载项目失败", "error");
    }
  }, [showToast]);

  const deleteProject = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm({
      title: "删除项目",
      message: "确定要删除此项目吗？",
      onConfirm: async () => {
        try {
          await dbDeleteProject(id);
          dbListProjects().then(setHistory);
          if (id === currentProjectId) {
            setCurrentProjectId(null);
          }
          showToast("项目已删除", "success");
        } catch (err) {
          showToast("删除失败", "error");
        }
      }
    });
  }, [currentProjectId, showConfirm, showToast]);

  const createNewProject = () => {
    setCurrentProjectId(null);
    setProjectName("");
    setTopic("");
    setPages([]);
    setVoiceSettings(DEFAULT_VOICE);
    setSelectedPageIndex(0);
    setShowHistory(false);
  };

  const handleClearAll = () => {
    showConfirm({
      title: "清空内容",
      message: "确定要清空所有内容吗？此操作不可恢复。",
      onConfirm: createNewProject
    });
  };

  const handleAddPage = () => {
    const newPage: ProjectPage = {
      id: generateId(),
      pageIndex: pages.length,
      image: "",
      title: "",
      clips: []
    };
    setPages([...pages, newPage]);
    setSelectedPageIndex(pages.length);
  };

  const handleDeletePage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm({
      title: "删除页面",
      message: "确定删除此页面及所有音频吗？",
      onConfirm: () => {
        const newPages = pages.filter(p => p.id !== id);
        setPages(newPages);
        if (selectedPageIndex >= newPages.length) {
          setSelectedPageIndex(Math.max(0, newPages.length - 1));
        }
      }
    });
  };

  const handleUpdatePage = (updatedPage: ProjectPage) => {
    setPages(prevPages => prevPages.map(p => p.id === updatedPage.id ? updatedPage : p));
  };

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;
    
    setIsImportingPdf(true);
    showToast("正在解析 PDF，请稍候...", "info");
    
    try {
      // Dynamic import to avoid SSR issues
      const pdfModule = await import("pdfjs-dist");
      pdfModule.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfModule.version}/build/pdf.worker.min.mjs`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfModule.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      
      const newPages: ProjectPage[] = [];
      const startIndex = pages.length;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // @ts-ignore
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        const dataUrl = canvas.toDataURL("image/png", 0.9);

        newPages.push({
          id: generateId() + `_pdf_${i}`,
          pageIndex: startIndex + i - 1,
          image: dataUrl,
          title: `${file.name.replace('.pdf', '')} - 第 ${i} 页`,
          clips: [{ id: generateId() + '_clip', text: "", emotion_hint: "neutral" }]
        });
      }

      setPages(prev => [...prev, ...newPages]);
      if (newPages.length > 0 && pages.length === 0) {
        setSelectedPageIndex(0);
      }
      showToast(`成功导入 ${totalPages} 页 PDF`, "success");
    } catch (err) {
      console.error("PDF import error:", err);
      showToast("PDF 解析失败，请重试", "error");
    } finally {
      setIsImportingPdf(false);
      if (e.target) {
        e.target.value = ''; // Reset input
      }
    }
  };

  // AI Generation (Mocking LLM call for this single page based on its topic/title/image)
  const handleGenerateAI = async () => {
    if (pages.length === 0) return;
    const page = pages[selectedPageIndex];
    setIsGeneratingAI(true);
    try {
      // In a real app, you would send `page.image` and `topic` to LLM.
      // We will call the existing /api/studio/generate-script endpoint
      const response = await fetch("/api/studio/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: page.image ? [page.image] : [],
          prompt: topic || page.title || "生成旁白"
        }),
      });

      if (!response.ok) throw new Error("API failed");
      const data = await response.json();
      
      const newClips: AudioClip[] = data.script.map((s: any) => ({
        id: generateId(),
        text: s.text,
        emotion_hint: s.emotion_hint || "neutral"
      }));

      handleUpdatePage({ ...page, clips: newClips });
      showToast("旁白生成成功", "success");
    } catch (err) {
      console.error(err);
      showToast("旁白生成失败", "error");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleGenerateAudioForClip = async (clipId: string) => {
    const pageId = pages[selectedPageIndex].id;
    const clip = pages[selectedPageIndex].clips.find(c => c.id === clipId);
    if (!clip || !clip.text.trim()) return;

    setGeneratingAudioIds(prev => [...prev, clipId]);
    try {
      const version = await ttsSingleVersion(clip.text, voiceSettings);
      
      setPages(prevPages => prevPages.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          clips: p.clips.map(c => 
            c.id === clipId 
              ? { ...c, audio_url: version.audio_url, duration_secs: version.duration_secs } 
              : c
          )
        };
      }));
      return true;
    } catch (err: any) {
      console.error(err);
      const isTerminated = err.message?.includes("terminated") || err.message?.includes("fetch");
      showToast(isTerminated ? "服务器连接中断 (可能是正在重启)" : "音频生成失败", "error");
      return false;
    } finally {
      setGeneratingAudioIds(prev => prev.filter(id => id !== clipId));
    }
  };

  const handleGenerateAllAudioForPage = async () => {
    const page = pages[selectedPageIndex];
    if (!page) return;

    const clipsToGenerate = page.clips.filter(c => c.text.trim());
    if (clipsToGenerate.length === 0) return;

    setGenerationTask({ total: clipsToGenerate.length, finished: 0, startTime: Date.now() });

    for (const clip of clipsToGenerate) {
      const success = await handleGenerateAudioForClip(clip.id);
      if (!success) {
        showToast("批量合成已中断，请检查后端状态后重试", "info");
        break; 
      }
      setGenerationTask(prev => prev ? { ...prev, finished: prev.finished + 1 } : null);
    }
  };

  // ─── Video Rendering ───────────────────────────────────────────────────────

  /**
   * Build the payload for a single page render request.
   * Returns null if the page is not renderable (missing image or clips).
   */
  const buildPageRenderPayload = (page: ProjectPage, pageIndex: number) => {
    const readyClips = page.clips.filter(c => c.audio_url);
    if (!page.image || readyClips.length === 0) return null;
    return {
      page_index: pageIndex,
      page_title: page.title || `第${pageIndex + 1}页`,
      image: page.image,
      clips: readyClips.map(c => ({ audio_url: c.audio_url!, duration_secs: c.duration_secs })),
    };
  };

  /** Download a single page as MP4 */
  const handleRenderPageVideo = async (pageIndex: number) => {
    const page = pages[pageIndex];
    const payload = buildPageRenderPayload(page, pageIndex);
    if (!payload) {
      showToast("此页面缺少图片或尚未生成音频", "info");
      return;
    }
    setIsRenderingVideo(true);
    showToast(`正在渲染第 ${pageIndex + 1} 页视频，请稍候...`, "info");
    try {
      const res = await fetch("/api/studio/render-video/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "渲染失败");
      }
      const blob = await res.blob();
      const safeName = (page.title || `第${pageIndex + 1}页`).replace(/[\/\\]/g, '_');
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      showToast("页面视频下载完成", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`视频渲染失败: ${err.message}`, "error");
    } finally {
      setIsRenderingVideo(false);
    }
  };

  /** Download all pages as a merged MP4 or ZIP of per-page MP4s */
  const handleRenderProjectVideo = async (merge: boolean) => {
    const renderablePages = pages
      .map((p, i) => buildPageRenderPayload(p, i))
      .filter(Boolean);

    if (renderablePages.length === 0) {
      showToast("没有可渲染的页面（每页需要图片和已生成的音频）", "info");
      return;
    }

    setIsRenderingVideo(true);
    setVideoRenderProgress({ current: 0, total: renderablePages.length });
    showToast(
      merge
        ? `正在合并渲染 ${renderablePages.length} 页视频，这可能需要一些时间...`
        : `正在打包 ${renderablePages.length} 页独立视频...`,
      "info"
    );

    try {
      const res = await fetch("/api/studio/render-video/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName.trim() || "Javis_Studio_Project",
          pages: renderablePages,
          merge,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "渲染失败");
      }
      const blob = await res.blob();
      const safeName = (projectName.trim() || "Javis_Studio_Project").replace(/[\/\\]/g, '_');
      const ext = merge ? "mp4" : "zip";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}_视频.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      showToast(merge ? "合并视频下载完成 🎬" : "视频压缩包下载完成 🎬", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`视频渲染失败: ${err.message}`, "error");
    } finally {
      setIsRenderingVideo(false);
      setVideoRenderProgress(null);
    }
  };

  const handleDownloadAllProjectAudio = async () => {
    let totalClips = 0;
    pages.forEach(p => totalClips += p.clips.filter(c => c.audio_url).length);
    if (totalClips === 0) {
      showToast("项目中暂无已生成的音频", "info");
      return;
    }

    setIsDownloadingProject(true);
    showToast(`正在打包 ${totalClips} 个音频，请稍候...`, "info");

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const validClips = page.clips.filter(c => c.audio_url);
        if (validClips.length === 0) continue;

        // Create a folder for the page
        const folderName = `第 ${i + 1} 页${page.title ? ` - ${page.title}` : ''}`.replace(/[\/\\]/g, '_');
        const folder = zip.folder(folderName);
        if (!folder) continue;

        for (let j = 0; j < validClips.length; j++) {
           const clip = validClips[j];
           try {
             const response = await fetch(audioUrl(clip.audio_url!));
             const blob = await response.blob();
             const filename = `page${String(i + 1).padStart(2, '0')}_segment${String(j + 1).padStart(2, '0')}.wav`;
             folder.file(filename, blob);
           } catch (err) {
             console.error(`下载页面 ${i+1} 片段 ${j+1} 失败:`, err);
           }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${projectName.trim() || 'Javis_Studio_Project'}_全部音频.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      showToast("项目全部音频打包下载完成", "success");
    } catch (err) {
      console.error(err);
      showToast("打包下载失败", "error");
    } finally {
      setIsDownloadingProject(false);
    }
  };

  const currentPage = pages[selectedPageIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen overflow-hidden">
      <GlobalHeader 
        showStatus={false}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {/* Project Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-30 relative">
        <div className="flex items-center gap-4 w-1/3">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="输入项目名称..."
            className="w-full text-sm font-semibold text-slate-800 bg-transparent border-b border-transparent focus:border-cyan-400 outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer">
            {isImportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
            导入 PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={handleImportPdf} disabled={isImportingPdf} />
          </label>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            历史
          </button>
          <button
            onClick={handleDownloadAllProjectAudio}
            disabled={isDownloadingProject}
            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="将整个项目所有页面的音频按文件夹打包下载"
          >
            {isDownloadingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            导出全部音频
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          {/* Video export buttons */}
          <div className="relative group">
            <button
              disabled={isRenderingVideo}
              className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="导出 MP4 视频"
              onClick={() => handleRenderProjectVideo(true)}
            >
              {isRenderingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              {isRenderingVideo
                ? videoRenderProgress
                  ? `渲染中 ${videoRenderProgress.current}/${videoRenderProgress.total}...`
                  : "渲染中..."
                : "导出全部视频"}
            </button>
            {/* Dropdown sub-options */}
            {!isRenderingVideo && (
              <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                <button
                  onClick={() => handleRenderProjectVideo(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  <Film className="w-3.5 h-3.5" />
                  合并为一个 MP4
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  onClick={() => handleRenderProjectVideo(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  <Clapperboard className="w-3.5 h-3.5" />
                  分页下载 ZIP
                </button>
              </div>
            )}
          </div>
          <button
            onClick={saveCurrentProject}
            className="px-3 py-1.5 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            保存项目
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：页面列表 (250px) */}
        <div className="w-[280px] flex-shrink-0 z-20">
          <PageList 
            pages={pages}
            selectedIndex={selectedPageIndex}
            onSelect={setSelectedPageIndex}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
          />
        </div>

        {/* 中间：页面编辑器 (弹性宽) */}
        <div className="flex-1 border-r border-slate-200 z-10 flex flex-col">
          {currentPage ? (
            <PageEditor 
              page={currentPage}
              onChange={handleUpdatePage}
              onGenerateAI={handleGenerateAI}
              isGeneratingAI={isGeneratingAI}
              onGenerateAudio={handleGenerateAudioForClip}
              generatingAudioIds={generatingAudioIds}
              currentPlayingClipId={currentPlayingClipId}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
              <Wand2 className="w-12 h-12 opacity-20" />
              <p>请在左侧添加页面以开始编辑</p>
            </div>
          )}
        </div>

        {/* 右侧：音频与设置 (400px) */}
        <div className="w-[420px] flex-shrink-0 bg-slate-50 overflow-y-auto custom-scroll z-20 flex flex-col">
          <div className="p-4 space-y-6">
            <VoiceSettingsPanel 
              value={voiceSettings} 
              onChange={setVoiceSettings} 
            />

            {currentPage && (
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800">当前页音频</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRenderPageVideo(selectedPageIndex)}
                      disabled={isRenderingVideo || !currentPage.image || currentPage.clips.filter(c => c.audio_url).length === 0}
                      className="text-xs px-2.5 py-1.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg font-medium hover:bg-violet-100 disabled:opacity-40 transition-colors flex items-center gap-1"
                      title="将此页图片与所有已生成音频合成为 MP4 视频"
                    >
                      {isRenderingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                      下载此页 MP4
                    </button>
                    <button
                      onClick={handleGenerateAllAudioForPage}
                      disabled={generatingAudioIds.length > 0 || currentPage.clips.length === 0}
                      className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                    >
                      全部生成
                    </button>
                  </div>
                </div>
                
                {(() => {
                  const generatedClips = currentPage.clips.filter(c => c.audio_url);
                  return (
                    <PageAudioPlayer 
                      clips={generatedClips}
                      loading={generatingAudioIds.length > 0}
                      generatingCount={generatingAudioIds.length}
                      totalToGenerate={generationTask?.total || 0}
                      finishedCount={generationTask?.finished || 0}
                      startTime={generationTask?.startTime}
                      pageTitle={currentPage.title}
                      pageIndex={selectedPageIndex}
                      currentPlayingIndex={generatedClips.findIndex(c => c.id === currentPlayingClipId)}
                      onPlayStateChange={(idx, isPlaying) => {
                        if (idx !== null && isPlaying) {
                          setCurrentPlayingClipId(generatedClips[idx]?.id || null);
                        } else {
                          setCurrentPlayingClipId(null);
                        }
                      }}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* History Modal (Simplified overlay) */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[80vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-600" />
                <h3 className="font-semibold text-slate-800">历史项目</h3>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-400">暂无历史记录</div>
              ) : (
                history.map(p => (
                  <div key={p.id} onClick={() => loadProject(p)} className="group p-3 rounded-xl border border-slate-200 hover:border-cyan-300 cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-sm text-slate-800 truncate">{p.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">{new Date(p.updatedAt).toLocaleString()}</p>
                        <p className="text-xs text-slate-400 mt-1">{p.pageCount} 个页面</p>
                      </div>
                      <button onClick={(e) => deleteProject(p.id, e)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
