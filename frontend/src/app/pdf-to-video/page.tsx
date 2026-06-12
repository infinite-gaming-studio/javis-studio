"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";
import { getSettings, fileToBase64, ttsSingle, audioUrl } from "@/lib/api";
import { useNotification } from "@/lib/NotificationContext";
import {
  Upload, FileText, Download, Trash2, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Settings, AlertCircle, Layers, Sparkles, Play,
  Pause, Plus, Mic2, Volume2, Film, Check,
  Loader2, Speaker, Music, Podcast, UserPlus, Wand2,
  ChevronDown, ChevronUp, Lightbulb,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmotionMode = "none" | "audio" | "vector" | "text";

interface PDFPage {
  id: number;
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface Character {
  id: string;
  name: string;
  color: string;
  spkAudioPrompt: string;
  spkAudioName: string;
  emotionMode: EmotionMode;
  emoAlpha: number;
  emoVector: number[];
  emoText: string;
  speed: number;
}

interface ScriptSegment {
  id: string;
  speakerId: string;
  text: string;
  audioUrl?: string;
  durationSecs?: number;
  isGenerating: boolean;
  isDone: boolean;
}

type WorkStatus = "idle" | "processing" | "done" | "error";

const DEFAULT_COLORS = [
  "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444",
  "#10b981", "#ec4899", "#6366f1", "#14b8a6",
];

const CHARACTER_ICONS = [Mic2, Speaker, Music, Podcast];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultCharacter(index: number, name: string): Character {
  return {
    id: generateId(),
    name,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    spkAudioPrompt: "",
    spkAudioName: "",
    emotionMode: "none",
    emoAlpha: 1.0,
    emoVector: [0, 0, 0, 0, 0, 0, 0, 0],
    emoText: "",
    speed: 1.0,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CharacterCard({
  char,
  index,
  active,
  onSelect,
  onUpdate,
  onDelete,
  onAudioUpload,
}: {
  char: Character;
  index: number;
  active: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Character>) => void;
  onDelete: () => void;
  onAudioUpload: (file: File) => void;
}) {
  const CharIcon = CHARACTER_ICONS[index % CHARACTER_ICONS.length];
  const [expanded, setExpanded] = useState(active);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <div
      className={`rounded-xl border transition-all cursor-pointer ${
        active
          ? "bg-white border-cyan-300 shadow-md shadow-cyan-200/30"
          : "bg-white/80 border-slate-200 hover:border-slate-300"
      }`}
      onClick={onSelect}
    >
      <div className="p-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: char.color }}
        >
          <CharIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-700 truncate">{char.name}</div>
          <div className="text-xs text-slate-400">
            {char.spkAudioPrompt ? "音色已设置" : "未设置音色"}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="p-1 text-slate-300 hover:text-slate-500"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100 pt-2.5">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">角色名称</label>
            <input
              type="text"
              value={char.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full mt-1 px-2.5 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">音色参考音频</label>
            <div className="mt-1">
              {char.spkAudioPrompt ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-emerald-600 truncate flex-1">{char.spkAudioName || "已上传音频"}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdate({ spkAudioPrompt: "", spkAudioName: "" }); }}
                    className="p-0.5 text-emerald-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-cyan-400 text-xs text-slate-500">
                  <Upload className="w-3.5 h-3.5" />
                  <span>上传音频文件</span>
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onAudioUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">情感模式</label>
            <select
              value={char.emotionMode}
              onChange={(e) => onUpdate({ emotionMode: e.target.value as EmotionMode })}
              className="w-full mt-1 px-2.5 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
            >
              <option value="none">不使用情感控制</option>
              <option value="audio">情感复刻 (参考音频)</option>
              <option value="vector">情感向量控制</option>
              <option value="text">文本描述情感</option>
            </select>
          </div>

          {char.emotionMode === "vector" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                情感值 ({char.emoVector.map(v => v.toFixed(1)).join(", ")})
              </label>
              <div className="mt-1 space-y-1">
                {["开心", "生气", "悲伤", "害怕", "厌恶", "忧郁", "惊讶", "平静"].map((label, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-8">{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={char.emoVector[i]}
                      onChange={(e) => {
                        const v = [...char.emoVector];
                        v[i] = parseFloat(e.target.value);
                        onUpdate({ emoVector: v });
                      }}
                      className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-slate-500 w-8 text-right">{char.emoVector[i].toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {char.emotionMode === "text" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">情感描述</label>
              <input
                type="text"
                value={char.emoText}
                onChange={(e) => onUpdate({ emoText: e.target.value })}
                placeholder="如：温柔地、激动地、悲伤地..."
                className="w-full mt-1 px-2.5 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              语速: {char.speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={char.speed}
              onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
              className="w-full mt-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-full py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            删除角色
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PDFToVideoPage() {
  const { showToast, showError, showSuccess } = useNotification();

  // PDF
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([
    createDefaultCharacter(0, "旁白"),
  ]);
  const [selectedCharId, setSelectedCharId] = useState(characters[0].id);

  // Script
  const [pageSegments, setPageSegments] = useState<Map<number, ScriptSegment[]>>(new Map());

  // AI Script generation
  const [aiPrompt, setAiPrompt] = useState("根据绘本内容生成生动的旁白和角色对白");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Audio generation
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [generatingSegIds, setGeneratingSegIds] = useState<Set<string>>(new Set());

  // Video rendering
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState("");

  // Render config
  const [transitionType, setTransitionType] = useState<string>("fade");
  const [transitionDuration, setTransitionDuration] = useState(1.0);
  const [enableSubtitles, setEnableSubtitles] = useState(true);

  // UI
  const [showSettings, setShowSettings] = useState(false);
  const [isPdfLibLoaded, setIsPdfLibLoaded] = useState(false);

  let pdfjsLib: typeof import("pdfjs-dist") | null = null;

  useEffect(() => {
    const loadPdfLib = async () => {
      try {
        const pdfModule = await import("pdfjs-dist");
        pdfjsLib = pdfModule;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfModule.version}/build/pdf.worker.min.mjs`;
        setIsPdfLibLoaded(true);
      } catch {
        console.warn("pdfjs-dist not available, using backend PDF conversion");
        setIsPdfLibLoaded(true);
      }
    };
    loadPdfLib();
  }, []);

  // ── PDF handling ────────────────────────────────────────────────────────────

  const handlePDFFile = async (pdfFile: File) => {
    setFile(pdfFile);
    setPages([]);
    setCurrentPageIdx(0);
    setVideoUrl(null);
    setPageSegments(new Map());
    setIsConverting(true);
    setConvertProgress({ current: 0, total: 0 });

    try {
      if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setConvertProgress({ current: 0, total: totalPages });

      const converted: PDFPage[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // @ts-ignore
        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        converted.push({ id: i, pageNumber: i, dataUrl, width: viewport.width, height: viewport.height });
        setConvertProgress({ current: i, total: totalPages });
      }

      setPages(converted);

      // Initialize with one empty segment per page
      const segMap = new Map<number, ScriptSegment[]>();
      for (const p of converted) {
        segMap.set(p.id, [createSegment(characters[0].id)]);
      }
      setPageSegments(segMap);
    } catch (err) {
      console.error("PDF conversion error:", err);
      showError("PDF 转换失败，请检查文件格式");
    } finally {
      setIsConverting(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") handlePDFFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") handlePDFFile(f);
  };

  const clearAll = () => {
    setFile(null);
    setPages([]);
    setCurrentPageIdx(0);
    setPageSegments(new Map());
    setVideoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Character management ────────────────────────────────────────────────────

  const addCharacter = () => {
    const idx = characters.length;
    const name = `角色${idx}`;
    const newChar = createDefaultCharacter(idx, name);
    setCharacters([...characters, newChar]);
    setSelectedCharId(newChar.id);
  };

  const updateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters(chars => chars.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteCharacter = (id: string) => {
    if (characters.length <= 1) {
      showError("至少保留一个角色");
      return;
    }
    setCharacters(chars => chars.filter(c => c.id !== id));
    if (selectedCharId === id) {
      setSelectedCharId(characters.find(c => c.id !== id)?.id || "");
    }
    // Remove segments using this character
    setPageSegments(prev => {
      const next = new Map(prev);
      for (const [pageId, segs] of next) {
        next.set(pageId, segs.map(s => s.speakerId === id ? { ...s, speakerId: characters[0].id } : s));
      }
      return next;
    });
  };

  const handleCharAudioUpload = async (charId: string, file: File) => {
    try {
      const base64 = await fileToBase64(file);
      updateCharacter(charId, { spkAudioPrompt: base64, spkAudioName: file.name });
      showSuccess(`已上传 ${file.name}`);
    } catch {
      showError("音频文件上传失败");
    }
  };

  // ── Script management ───────────────────────────────────────────────────────

  const currentSegments = pageSegments.get(pages[currentPageIdx]?.id) || [];

  function createSegment(speakerId: string): ScriptSegment {
    return { id: generateId(), speakerId, text: "", isGenerating: false, isDone: false };
  }

  const addSegment = () => {
    const pageId = pages[currentPageIdx].id;
    setPageSegments(prev => {
      const next = new Map(prev);
      const segs = next.get(pageId) || [];
      next.set(pageId, [...segs, createSegment(selectedCharId)]);
      return next;
    });
  };

  const updateSegment = (segId: string, updates: Partial<ScriptSegment>) => {
    const pageId = pages[currentPageIdx].id;
    setPageSegments(prev => {
      const next = new Map(prev);
      const segs = (next.get(pageId) || []).map(s => s.id === segId ? { ...s, ...updates } : s);
      next.set(pageId, segs);
      return next;
    });
  };

  const removeSegment = (segId: string) => {
    const pageId = pages[currentPageIdx].id;
    setPageSegments(prev => {
      const next = new Map(prev);
      const segs = (next.get(pageId) || []).filter(s => s.id !== segId);
      next.set(pageId, segs);
      return next;
    });
  };

  const getCharacterName = (charId: string) => characters.find(c => c.id === charId)?.name || "未知角色";
  const getCharacterColor = (charId: string) => characters.find(c => c.id === charId)?.color || "#94a3b8";

  // ── AI Script Generation ────────────────────────────────────────────────────

  const generateAIScript = async (targetPageId?: number) => {
    const pageIds = targetPageId !== undefined ? [targetPageId] : pages.map(p => p.id);
    const targetPages = pages.filter(p => pageIds.includes(p.id));

    setIsGeneratingScript(true);
    let successCount = 0;

    for (const page of targetPages) {
      try {
        const res = await fetch("/api/studio/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: [page.dataUrl],
            prompt: aiPrompt,
            language: "zh",
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const segments: { index: number; text: string; emotion_hint?: string }[] = data.script;

        if (segments.length > 0) {
          setPageSegments(prev => {
            const next = new Map(prev);
            const existing = next.get(page.id) || [];
            const newSegs = segments.map((s, i) => ({
              id: generateId(),
              speakerId: characters[0].id,
              text: s.text,
              isGenerating: false,
              isDone: false,
            }));
            // Replace segments for this page with AI-generated ones
            next.set(page.id, existing.length === 1 && !existing[0].text.trim() ? newSegs : [...existing, ...newSegs]);
            return next;
          });
          successCount++;
        }
      } catch (err: any) {
        showError(`第 ${page.pageNumber} 页剧本生成失败: ${err.message}`);
      }
    }

    setIsGeneratingScript(false);
    if (successCount === targetPages.length) {
      showSuccess(`剧本生成完成 (${successCount} 页)`);
    }
  };

  // ── TTS Generation ──────────────────────────────────────────────────────────

  const generateSegmentAudio = async (seg: ScriptSegment) => {
    if (!seg.text.trim()) return;
    const char = characters.find(c => c.id === seg.speakerId);
    if (!char) { showError("请先选择角色"); return; }
    if (!char.spkAudioPrompt) { showError(`角色 "${char.name}" 未设置音色参考音频`); return; }

    setGeneratingSegIds(prev => new Set(prev).add(seg.id));
    updateSegment(seg.id, { isGenerating: true });

    try {
      const res = await ttsSingle(seg.text, {
        spk_audio_prompt: char.spkAudioPrompt,
        emotion_mode: char.emotionMode,
        emo_alpha: char.emoAlpha,
        emo_vector: char.emotionMode === "vector" ? char.emoVector : undefined,
        emo_text: char.emotionMode === "text" ? char.emoText : undefined,
        speed: char.speed,
        use_random: false,
      });
      updateSegment(seg.id, { audioUrl: res.audio_url, durationSecs: res.duration_secs, isGenerating: false, isDone: true });
    } catch (err: any) {
      updateSegment(seg.id, { isGenerating: false });
      showError(`语音生成失败: ${err.message}`);
    } finally {
      setGeneratingSegIds(prev => {
        const next = new Set(prev);
        next.delete(seg.id);
        return next;
      });
    }
  };

  const generateAllAudio = async () => {
    const allSegs = Array.from(pageSegments.entries()).flatMap(([_, segs]) => segs);
    const pending = allSegs.filter(s => s.text.trim() && !s.isDone);
    if (pending.length === 0) { showToast("没有需要生成的音频", "info"); return; }

    setIsGeneratingAudio(true);
    let success = 0;
    let fail = 0;

    for (const seg of pending) {
      try {
        await generateSegmentAudio(seg);
        success++;
      } catch {
        fail++;
      }
    }

    setIsGeneratingAudio(false);
    if (fail === 0) showSuccess(`全部生成完成 (${success} 段)`);
    else showToast(`完成 ${success} 段，${fail} 段失败`, "warning");
  };

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const playAudio = (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const fullUrl = url.startsWith("http") || url.startsWith("/api") ? url : audioUrl(url);
    const audio = new Audio(fullUrl);
    audio.onended = () => setPlayingUrl(null);
    audio.onerror = () => { setPlayingUrl(null); showError("音频播放失败"); };
    audio.play().catch(() => showError("音频播放失败"));
    audioRef.current = audio;
    setPlayingUrl(url);
  };

  // ── Video Rendering ─────────────────────────────────────────────────────────

  const renderVideo = async () => {
    if (pages.length === 0) return;

    // Check all pages have audio
    for (const p of pages) {
      const segs = pageSegments.get(p.id) || [];
      if (segs.length === 0 || !segs.some(s => s.audioUrl)) {
        showError(`第 ${p.pageNumber} 页没有音频，请先生成语音`);
        return;
      }
    }

    setIsRenderingVideo(true);
    setVideoUrl(null);

    try {
      const settings = getSettings();
      const baseUrl = settings.ttsApiUrl || "http://localhost:8000";
      const apiBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

      const projectPages = pages.map(p => {
        const segs = pageSegments.get(p.id) || [];
        const clips = segs
          .filter(s => s.audioUrl)
          .map(s => ({
            audio_url: s.audioUrl!.startsWith("http") || s.audioUrl!.startsWith("/api")
              ? s.audioUrl!
              : `${apiBase}${s.audioUrl!}`,
            duration_secs: s.durationSecs,
            text: s.text,
          }));
        return {
          page_index: p.pageNumber - 1,
          page_title: `第${p.pageNumber}页`,
          image: p.dataUrl,
          clips,
        };
      });

      const res = await fetch(`${apiBase}/api/studio/render-video/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: file?.name.replace(/\.pdf$/i, "") || "绘本视频",
          pages: projectPages,
          merge: true,
          transition: transitionType,
          transition_duration: transitionDuration,
          enable_subtitles: enableSubtitles,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "未知错误");
        throw new Error(`渲染失败: ${errText}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setVideoFileName(`${(file?.name.replace(/\.pdf$/i, "") || "绘本视频")}.mp4`);
      showSuccess("视频渲染完成!");
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsRenderingVideo(false);
    }
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = videoFileName;
    link.click();
  };

  // ── Status ──────────────────────────────────────────────────────────────────

  const getStatus = (): WorkStatus => {
    if (isConverting || isGeneratingAudio || isRenderingVideo) return "processing";
    if (videoUrl) return "done";
    if (pages.length > 0) return "idle";
    return "idle";
  };

  const getStatusText = () => {
    if (!isPdfLibLoaded) return "加载中...";
    if (isConverting) return `转换中 ${convertProgress.current}/${convertProgress.total}`;
    if (isGeneratingAudio) return "生成语音中...";
    if (isRenderingVideo) return "渲染视频中...";
    if (videoUrl) return "视频已生成";
    if (pages.length > 0) return `${pages.length} 页已转换`;
    return "就绪";
  };

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [videoUrl]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (pages.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans">
        <GlobalHeader
          showStatus
          status={getStatus()}
          statusText={getStatusText()}
          onSettingsClick={() => setShowSettings(true)}
        />
        <main className="max-w-screen-xl mx-auto px-6 py-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => isPdfLibLoaded && fileInputRef.current?.click()}
            className={`
              relative overflow-hidden rounded-3xl border-2 border-dashed cursor-pointer
              transition-all duration-300 ease-out
              ${!isPdfLibLoaded ? "opacity-50 cursor-not-allowed" : ""}
              ${isDragging
                ? "border-cyan-500 bg-cyan-50/50 scale-[1.02] shadow-xl shadow-cyan-200/50"
                : "border-slate-300 bg-white/40 hover:border-cyan-400 hover:bg-white/60 hover:shadow-lg hover:shadow-cyan-100/50"
              }
            `}
            style={{ minHeight: "calc(100vh - 8rem)" }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-gradient-to-tr from-blue-200/20 to-cyan-200/20 rounded-full blur-3xl" />
            </div>
            <div className="relative flex flex-col items-center justify-center h-full py-20">
              <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 ${
                isDragging ? "bg-gradient-to-br from-cyan-500 to-blue-500 shadow-xl shadow-cyan-500/30 scale-110" : "bg-gradient-to-br from-cyan-100 to-blue-100"
              }`}>
                <Film className={`w-12 h-12 transition-colors duration-300 ${isDragging ? "text-white" : "text-cyan-600"}`} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                {!isPdfLibLoaded ? "正在加载组件..." : isDragging ? "释放以上传 PDF" : "拖放 PDF 文件到这里"}
              </h2>
              <p className="text-slate-500 mb-6">{isPdfLibLoaded ? "点击选择文件，将 PDF 绘本一键转为视频" : "请稍候"}</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">支持多角色配音</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">情感语音合成</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">自动生成视频</span>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileInput} disabled={!isPdfLibLoaded} className="hidden" />
            </div>
          </div>
        </main>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      <GlobalHeader
        showStatus
        status={getStatus()}
        statusText={getStatusText()}
        onSettingsClick={() => setShowSettings(true)}
      />

      <main className="max-w-screen-xl mx-auto px-4 py-4">
        {/* ── 3-Panel Layout ── */}
        <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 5.5rem)" }}>
          {/* ── Left Panel: Page List ── */}
          <aside className="col-span-2 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/30 overflow-hidden">
            <div className="p-3 border-b border-slate-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-600" />
                <span className="font-semibold text-sm text-slate-700">页面</span>
              </div>
              <span className="text-xs text-slate-400">{pages.length} 页</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  onClick={() => setCurrentPageIdx(idx)}
                  className={`group relative p-1.5 rounded-xl cursor-pointer transition-all duration-200 ${
                    currentPageIdx === idx
                      ? "bg-cyan-50 border-2 border-cyan-400 shadow-sm"
                      : "bg-white border-2 border-transparent hover:border-slate-200 hover:shadow-sm"
                  }`}
                >
                  <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 mb-1">
                    <img src={p.dataUrl} alt={`Page ${p.pageNumber}`} className="w-full h-full object-contain" />
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] font-medium text-slate-600">第 {p.pageNumber} 页</span>
                  </div>
                  {/* Audio status indicator */}
                  {(pageSegments.get(p.id) || []).some(s => s.isDone) && (
                    <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white shadow" />
                  )}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200/60">
              <button
                onClick={clearAll}
                className="w-full py-2 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                清空
              </button>
            </div>
          </aside>

          {/* ── Center Panel: Preview + Script ── */}
          <section className="col-span-6 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/30 overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 border-b border-slate-200/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 rounded-lg">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{file?.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-slate-600 min-w-[45px] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => setCurrentPageIdx(i => Math.max(0, i - 1))} disabled={currentPageIdx === 0} className="p-1.5 text-slate-500 disabled:opacity-30 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-slate-600 min-w-[60px] text-center">
                  {currentPageIdx + 1} / {pages.length}
                </span>
                <button onClick={() => setCurrentPageIdx(i => Math.min(pages.length - 1, i + 1))} disabled={currentPageIdx >= pages.length - 1} className="p-1.5 text-slate-500 disabled:opacity-30 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Preview + Script */}
            <div className="flex-1 overflow-y-auto custom-scroll flex flex-col gap-3 p-4">
              {/* Page Image */}
              <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center shadow-inner" style={{ maxHeight: "40%" }}>
                <img
                  src={pages[currentPageIdx]?.dataUrl}
                  alt={`Page ${pages[currentPageIdx]?.pageNumber}`}
                  className="max-w-full max-h-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                />
              </div>

              {/* AI Script Generation */}
              <div className="p-3 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-violet-600" />
                  <span className="text-xs font-semibold text-violet-700">AI 剧本生成</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="描述剧本风格，如：温馨的童话故事..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-violet-200 rounded-lg focus:outline-none focus:border-violet-400 placeholder:text-slate-300"
                  />
                  <button
                    onClick={() => generateAIScript(pages[currentPageIdx]?.id)}
                    disabled={isGeneratingScript}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    {isGeneratingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    生成此页
                  </button>
                  <button
                    onClick={() => generateAIScript()}
                    disabled={isGeneratingScript}
                    className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-100 hover:bg-violet-200 disabled:opacity-50 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    {isGeneratingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    全部
                  </button>
                </div>
              </div>

              {/* Script Segments */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">剧本段落</h3>
                  <button
                    onClick={addSegment}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    添加段落
                  </button>
                </div>

                {currentSegments.length === 0 && (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    点击"添加段落"开始编写剧本
                  </div>
                )}

                {currentSegments.map((seg, idx) => (
                  <div key={seg.id} className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-slate-400 min-w-[32px]">#{idx + 1}</span>
                      <select
                        value={seg.speakerId}
                        onChange={(e) => updateSegment(seg.id, { speakerId: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs font-medium rounded-lg border border-slate-200 focus:outline-none focus:border-cyan-400 bg-white"
                        style={{ borderLeftColor: getCharacterColor(seg.speakerId), borderLeftWidth: 3 }}
                      >
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        {seg.isDone && seg.audioUrl && (
                          <button
                            onClick={() => playAudio(seg.audioUrl!)}
                            className={`p-1.5 rounded-lg transition-all ${
                              playingUrl === seg.audioUrl
                                ? "bg-cyan-100 text-cyan-600"
                                : "text-slate-400 hover:text-cyan-600 hover:bg-cyan-50"
                            }`}
                          >
                            {playingUrl === seg.audioUrl ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={() => generateSegmentAudio(seg)}
                          disabled={!seg.text.trim() || generatingSegIds.has(seg.id)}
                          className={`p-1.5 rounded-lg transition-all ${
                            seg.isDone
                              ? "text-emerald-500 hover:bg-emerald-50"
                              : "text-slate-400 hover:text-cyan-600 hover:bg-cyan-50"
                          } disabled:opacity-30`}
                        >
                          {generatingSegIds.has(seg.id) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => removeSegment(seg.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={seg.text}
                      onChange={(e) => updateSegment(seg.id, { text: e.target.value })}
                      placeholder="输入此段落的文本内容..."
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400 resize-none placeholder:text-slate-300"
                    />
                    {seg.isDone && seg.durationSecs && (
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>语音生成完成</span>
                        <span>·</span>
                        <span>时长: {seg.durationSecs.toFixed(1)}秒</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Right Panel: Characters ── */}
          <aside className="col-span-4 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/30 overflow-hidden">
            <div className="p-3 border-b border-slate-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-cyan-600" />
                <span className="font-semibold text-sm text-slate-700">角色管理</span>
              </div>
              <button
                onClick={addCharacter}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
              >
                <UserPlus className="w-3 h-3" />
                添加角色
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-2.5">
              {characters.map((char, idx) => (
                <CharacterCard
                  key={char.id}
                  char={char}
                  index={idx}
                  active={selectedCharId === char.id}
                  onSelect={() => setSelectedCharId(char.id)}
                  onUpdate={(updates) => updateCharacter(char.id, updates)}
                  onDelete={() => deleteCharacter(char.id)}
                  onAudioUpload={(f) => handleCharAudioUpload(char.id, f)}
                />
              ))}
            </div>

            {/* Render Config */}
            <div className="p-3 border-t border-slate-200/60 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-violet-500" />
                渲染配置
              </h4>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">页间转场效果</label>
                <select
                  value={transitionType}
                  onChange={(e) => setTransitionType(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400"
                >
                  <option value="fade">淡入淡出 (Fade)</option>
                  <option value="slideleft">左滑 (Slide Left)</option>
                  <option value="slideright">右滑 (Slide Right)</option>
                  <option value="slideup">上滑 (Slide Up)</option>
                  <option value="slidedown">下滑 (Slide Down)</option>
                  <option value="zoomin">放大 (Zoom In)</option>
                  <option value="zoomout">缩小 (Zoom Out)</option>
                  <option value="wipeleft">左擦 (Wipe Left)</option>
                  <option value="wiperight">右擦 (Wipe Right)</option>
                  <option value="dissolve">溶解 (Dissolve)</option>
                  <option value="pageflip">翻页 (Page Flip)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  转场时长: {transitionDuration.toFixed(1)}秒
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.5"
                  value={transitionDuration}
                  onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
                  className="w-full mt-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableSubtitles}
                  onChange={(e) => setEnableSubtitles(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-violet-500"
                />
                <label className="text-xs text-slate-600 font-medium">烧录字幕到视频</label>
              </div>
            </div>

            {/* Audio generate status */}
            <div className="p-3 border-t border-slate-200/60 space-y-2">
              <div className="text-[10px] text-slate-400">
                {Array.from(pageSegments.entries()).reduce((sum, [_, segs]) => sum + segs.filter(s => s.isDone).length, 0)} / {Array.from(pageSegments.entries()).reduce((sum, [_, segs]) => sum + segs.length, 0)} 段音频已生成
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={generateAllAudio}
                  disabled={isGeneratingAudio}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-cyan-500/20 flex items-center justify-center gap-1.5"
                >
                  {isGeneratingAudio ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</>
                  ) : (
                    <><Volume2 className="w-3.5 h-3.5" />生成所有语音</>
                  )}
                </button>
                <button
                  onClick={renderVideo}
                  disabled={isRenderingVideo}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-violet-500/20 flex items-center justify-center gap-1.5"
                >
                  {isRenderingVideo ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />渲染中...</>
                  ) : (
                    <><Film className="w-3.5 h-3.5" />渲染视频</>
                  )}
                </button>
                {videoUrl && (
                  <button
                    onClick={downloadVideo}
                    className="w-full py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载视频
                  </button>
                )}
              </div>
            </div>

            {/* Video Preview */}
            {videoUrl && (
              <div className="border-t border-slate-200/60">
                <div className="p-3">
                  <h4 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" />
                    视频预览
                  </h4>
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-xl border border-slate-200 bg-black"
                    style={{ maxHeight: 200 }}
                  />
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
