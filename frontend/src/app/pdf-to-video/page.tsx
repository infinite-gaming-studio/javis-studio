"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";
import { getSettings, fileToBase64, ttsSingle, audioUrl } from "@/lib/api";
import { useNotification } from "@/lib/NotificationContext";
import {
  createProjectSnapshot,
  saveProjectToDB,
  loadProjectFromDB,
  listProjects,
  deleteProjectFromDB,
  saveTempSnapshot,
  loadTempSnapshot,
  isIndexedDBAvailable,
  PDFProject,
  ProjectMeta,
} from "@/lib/pdf-project";
import {
  Upload, FileText, Download, Trash2, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Settings, AlertCircle, Layers, Sparkles, Play,
  Pause, Plus, Mic2, Volume2, Film, Check,
  Loader2, Speaker, Music, Podcast, UserPlus, Wand2,
  ChevronDown, ChevronUp, Lightbulb, FileUp, Copy, Eye, ImagePlus,
  RotateCw, RotateCcw, History, FolderClosed, XCircle, Clipboard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmotionMode = "none" | "audio" | "vector" | "text";

// ─── Backend URL helpers ────────────────────────────────────────────────────
// Next.js rewrite proxy has a hard 10MB body limit (Next.js 16 internal).
// For files >9MB, bypass rewrite and call backend directly.
// Derive backend URL from current page location (works for Docker, LAN, local).
// Docker: frontend :13000 → backend :18000
// Local:  frontend :3000  → backend :8000
// LAN:    frontend <any>:13000 → backend <any>:18000

function getDirectBaseUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:18000";
  const { hostname, port } = window.location;
  const fp = parseInt(port, 10) || 80;
  const bp = fp === 13000 ? 18000 : fp === 3000 ? 8000 : fp + 5000;
  return `http://${hostname}:${bp}`;
}

function getPdfConvertUrl(fileSize: number): string {
  if (fileSize > 9 * 1024 * 1024) {
    return `${getDirectBaseUrl()}/api/pdf/convert`;
  }
  return "/api/pdf/convert";
}

// ─── Image Rotation ─────────────────────────────────────────────────────────
// Rotate image pixels so rotation persists in AI scripts + video rendering.
// Uses canvas to produce new base64 dataUrl — replaces the original image.

function rotateImageDataUrl(dataUrl: string, degrees: 90 | 180 | 270): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const swap = degrees === 90 || degrees === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function convertPdfViaBackend(pdfFile: File): Promise<PDFPage[]> {
  const sizeMB = pdfFile.size / (1024 * 1024);
  let scale: number;
  if (sizeMB > 50) scale = 1.0;
  else if (sizeMB > 20) scale = 1.25;
  else scale = 1.5;

  const formData = new FormData();
  formData.append("file", pdfFile);
  formData.append("scale", String(scale));
  formData.append("format", "png");
  formData.append("return_type", "base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const url = getPdfConvertUrl(pdfFile.size);
    console.log("PDF convert URL:", url, "size:", pdfFile.size);
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`PDF 转换失败: ${errText}`);
    }

    const data = await res.json();
    return data.pages.map((p: any) => ({
      id: p.page,
      pageNumber: p.page,
      dataUrl: `data:image/png;base64,${p.image_base64}`,
      width: p.width,
      height: p.height,
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  emoAlpha: number;
  speed: number;
}

interface ScriptSegment {
  id: string;
  speakerId: string;
  text: string;
  emotionMode: EmotionMode;
  emoAlpha: number;
  emoVector: number[];
  emoText: string;
  speed: number;
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
    emoAlpha: 1.0,
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

  return (
    <div
      className={`rounded-xl border transition-all cursor-pointer ${
        active
          ? "bg-white border-cyan-300 shadow-md shadow-cyan-200/30"
          : "bg-white/80 border-slate-200 hover:border-slate-300"
      }`}
      onClick={onSelect}
    >
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: char.color }}
          >
            <CharIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={char.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full px-2 py-1 text-sm font-medium text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-cyan-400 focus:outline-none transition-colors"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-300 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-cyan-400 text-xs text-slate-500">
                  <Upload className="w-3.5 h-3.5" />
                  <span>上传</span>
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
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const items = await navigator.clipboard.read();
                      for (const item of items) {
                        const audioType = item.types.find(t => t.startsWith("audio/"));
                        if (audioType) {
                          const blob = await item.getType(audioType);
                          const ext = blob.type.split("/")[1] || "wav";
                          onAudioUpload(new File([blob], `clipboard_audio.${ext}`, { type: blob.type }));
                          return;
                        }
                      }
                    } catch {}
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg border border-dashed border-slate-300 hover:border-cyan-400 transition-all"
                  title="从剪贴板粘贴音频"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  粘贴
                </button>
              </div>
            )}
          </div>
        </div>
        {char.spkAudioPrompt && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 min-w-[48px]">情感权重</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={char.emoAlpha}
                onChange={(e) => { e.stopPropagation(); onUpdate({ emoAlpha: parseFloat(e.target.value) }); }}
                className="flex-1 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-[10px] text-slate-500 w-6 text-right">{char.emoAlpha.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 min-w-[48px]">语速</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={char.speed}
                onChange={(e) => { e.stopPropagation(); onUpdate({ speed: parseFloat(e.target.value) }); }}
                className="flex-1 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-[10px] text-slate-500 w-6 text-right">{char.speed.toFixed(1)}x</span>
            </div>
          </>
        )}
      </div>
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
  const [previewPage, setPreviewPage] = useState<PDFPage | null>(null);
  const replacePageInputRef = useRef<HTMLInputElement>(null);

  // ── Project management ─────────────────────────────────────────────────────
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ProjectMeta[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");

  // ── PDF handling ────────────────────────────────────────────────────────────

  const handlePDFFile = async (pdfFile: File) => {
    if (pdfFile.size > 200 * 1024 * 1024) {
      showError("PDF 文件大小不能超过 200MB");
      setIsConverting(false);
      return;
    }
    setFile(pdfFile);
    setPages([]);
    setCurrentPageIdx(0);
    setVideoUrl(null);
    setPageSegments(new Map());
    setIsConverting(true);
    setConvertProgress({ current: 0, total: 0 });

    try {
      const converted = await convertPdfViaBackend(pdfFile);
      setConvertProgress({ current: converted.length, total: converted.length });

      setPages(converted);

      // Initialize with one empty segment per page
      const segMap = new Map<number, ScriptSegment[]>();
      for (const p of converted) {
        segMap.set(p.id, [createSegment(characters[0].id)]);
      }
      setPageSegments(segMap);
    } catch (err) {
      const url = getPdfConvertUrl(pdfFile.size);
      const msg = err instanceof Error ? err.message : String(err);
      console.error("PDF conversion error:", msg, "URL:", url, "size:", pdfFile.size);
      showError(`PDF 转换失败: ${msg}`);
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

  const deletePage = (pageId: number) => {
    setPages(prev => {
      const next = prev.filter(p => p.id !== pageId);
      if (currentPageIdx >= next.length) setCurrentPageIdx(Math.max(0, next.length - 1));
      return next;
    });
    setPageSegments(prev => {
      const next = new Map(prev);
      next.delete(pageId);
      return next;
    });
    showSuccess("页面已删除");
  };

  const handleReplacePageImage = async (pageId: number, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      showError("替换图片不能超过 20MB");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scale", "2");
    formData.append("format", "png");
    formData.append("return_type", "base64");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const url = getPdfConvertUrl(file.size);
      const res = await fetch(url, { method: "POST", body: formData, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const imgData = data.pages[0];
      setPages(prev => prev.map(p => p.id === pageId ? {
        ...p,
        dataUrl: `data:image/png;base64,${imgData.image_base64}`,
        width: imgData.width,
        height: imgData.height,
      } : p));
      showSuccess("页面已替换");
    } catch {
      showError("替换失败");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ── Image Rotation ─────────────────────────────────────────────────────────

  const rotateAllPages = async (degrees: 90 | 180 | 270) => {
    if (pages.length === 0) return;
    setIsConverting(true);
    setConvertProgress({ current: 0, total: pages.length });

    try {
      const rotated = await Promise.all(
        pages.map(async (p, i) => {
          const dataUrl = await rotateImageDataUrl(p.dataUrl, degrees);
          setConvertProgress({ current: i + 1, total: pages.length });
          return { ...p, dataUrl };
        })
      );
      setPages(rotated);
      showSuccess(`已旋转 ${pages.length} 页`);
    } catch {
      showError("旋转失败");
    } finally {
      setIsConverting(false);
    }
  };

  const rotatePage = async (pageId: number, degrees: 90 | 180 | 270) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;
    try {
      const dataUrl = await rotateImageDataUrl(page.dataUrl, degrees);
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, dataUrl } : p));
    } catch {
      showError("页面旋转失败");
    }
  };

  // ── Character management ────────────────────────────────────────────────────

  const addCharacter = () => {
    const idx = characters.length;
    const name = `角色${idx}`;
    const newChar = createDefaultCharacter(idx, name);
    setCharacters([...characters, newChar]);
    setSelectedCharId(newChar.id);
  };

  const applyVoiceToAll = () => {
    const source = characters.find(c => c.id === selectedCharId && c.spkAudioPrompt)
      || characters.find(c => c.spkAudioPrompt);
    if (!source) {
      showToast("请先为至少一个角色上传音色参考音频", "info");
      return;
    }
    setCharacters(chars => chars.map(c => ({
      ...c,
      spkAudioPrompt: source.spkAudioPrompt,
      spkAudioName: `${source.spkAudioName} (统一)`,
    })));
    showSuccess(`已将所有角色音色统一为 "${source.name}"`);
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
    return {
      id: generateId(),
      speakerId,
      text: "",
      emotionMode: "none",
      emoAlpha: 1.0,
      emoVector: [0, 0, 0, 0, 0, 0, 0, 0],
      emoText: "",
      speed: 1.0,
      isGenerating: false,
      isDone: false,
    };
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

  const findPageIdForSegment = (segId: string): number | null => {
    for (const [pageId, segs] of pageSegments.entries()) {
      if (segs.some(s => s.id === segId)) return pageId;
    }
    return null;
  };

  const updateSegment = (segId: string, updates: Partial<ScriptSegment>) => {
    setPageSegments(prev => {
      const next = new Map(prev);
      for (const [pageId, segs] of next.entries()) {
        if (segs.some(s => s.id === segId)) {
          next.set(pageId, segs.map(s => s.id === segId ? { ...s, ...updates } : s));
          return next;
        }
      }
      const fallbackPageId = pages[currentPageIdx]?.id;
      if (fallbackPageId != null) {
        const segs = (next.get(fallbackPageId) || []).map(s => s.id === segId ? { ...s, ...updates } : s);
        next.set(fallbackPageId, segs);
      }
      return next;
    });
  };

  const removeSegment = (segId: string) => {
    setPageSegments(prev => {
      const next = new Map(prev);
      for (const [pageId, segs] of next.entries()) {
        if (segs.some(s => s.id === segId)) {
          next.set(pageId, segs.filter(s => s.id !== segId));
          return next;
        }
      }
      return next;
    });
  };

  const getCharacterName = (charId: string) => characters.find(c => c.id === charId)?.name || "未知角色";
  const getCharacterColor = (charId: string) => characters.find(c => c.id === charId)?.color || "#94a3b8";

  // ── Batch Import ────────────────────────────────────────────────────────────

  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"auto" | "by-page">("auto");

  const SCRIPT_FORMAT_HINT = `格式说明：
每行一条段落，格式：{页码} <情感描述> [角色名] >> 台词内容

示例：
{1} <温柔讲述> [旁白] >> 在一个遥远的森林里，住着一只小兔子
{1} <开心雀跃> [小兔子] >> 妈妈我出去玩啦
{2} <紧张担心> [旁白] >> 小兔子蹦蹦跳跳地走进了森林深处
{2} <低沉吓人> [大灰狼] >> 嘿嘿，又来了一只小动物

角色名如不存在会自动创建。页码对应 PDF 页码（从1开始）。
情感描述控制在2~6字，如：温柔讲述、开心雀跃、惊喜兴奋、好奇疑惑、紧张担心等`;

  const parseImportText = (text: string): { pageId: number; speakerName: string; content: string; emotionText: string }[] => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("//"));
    const results: { pageId: number; speakerName: string; content: string; emotionText: string }[] = [];

    for (const line of lines) {
      const newMatch = line.match(/^\{(\d+)\}\s*(?:<([^>]*)>\s*)?\[([^\]]+)\]\s*>>\s*(.+)$/);
      if (newMatch) {
        results.push({
          pageId: parseInt(newMatch[1], 10),
          speakerName: newMatch[3].trim(),
          content: newMatch[4].trim().replace(/^>\s*/, ""),
          emotionText: (newMatch[2] || "").trim(),
        });
        continue;
      }
      const oldMatch = line.match(/^\{(\d+)\}\s*\[([^\]]+)\]\s*>\s*(.+)$/);
      if (oldMatch) {
        results.push({
          pageId: parseInt(oldMatch[1], 10),
          speakerName: oldMatch[2].trim(),
          content: oldMatch[3].trim(),
          emotionText: "",
        });
      }
    }
    return results;
  };

  const handleBatchImport = () => {
    const parsed = parseImportText(importText);
    if (parsed.length === 0) {
      showError("未识别到有效段落，请检查格式");
      return;
    }

    // Build characters from imported script, keeping only existing ones with audio uploaded
    const charNameToId = new Map<string, string>();
    const newChars: Character[] = [];

    for (const existing of characters) {
      if (existing.spkAudioPrompt) {
        newChars.push(existing);
        charNameToId.set(existing.name, existing.id);
      }
    }

    for (const item of parsed) {
      if (!charNameToId.has(item.speakerName)) {
        const idx = newChars.length;
        const newChar = createDefaultCharacter(idx, item.speakerName);
        newChars.push(newChar);
        charNameToId.set(item.speakerName, newChar.id);
      }
    }
    setCharacters(newChars);
    setSelectedCharId(newChars[0].id);

    const newSegments = new Map(pageSegments);
    for (const item of parsed) {
      const page = pages.find(p => p.pageNumber === item.pageId);
      if (!page) continue;

      const speakerId = charNameToId.get(item.speakerName)!;
      const seg: ScriptSegment = {
        id: generateId(),
        speakerId,
        text: item.content,
        emotionMode: item.emotionText ? "text" : "none",
        emoAlpha: 1.0,
        emoVector: [0, 0, 0, 0, 0, 0, 0, 0],
        emoText: item.emotionText,
        speed: 1.0,
        isGenerating: false,
        isDone: false,
      };

      const existing = newSegments.get(page.id) || [];
      const isEmptyOnly = existing.length === 1 && !existing[0].text.trim();
      const base = isEmptyOnly ? [] : existing;
      newSegments.set(page.id, [...base, seg]);
    }

    setPageSegments(newSegments);
    setShowImportModal(false);
    setImportText("");
    showSuccess(`导入 ${parsed.length} 段剧本`);
  };

  const generateImportPrompt = () => {
    const prompt = `# 任务
你是一名专业儿童绘本编剧。

请根据输入的绘本图片内容，为每一页生成：
- 角色对白
- 场景旁白

内容需符合儿童绘本风格，语言自然、生动、有画面感，并适合语音朗读。

# 输出格式（严格遵守）

每行仅输出一条内容：

{页码} <情感描述> [角色名] >> 台词内容

示例：

{1} <温柔讲述> [旁白] >> 在一片开满鲜花的草地上，住着一只小蝴蝶。

{2} <惊喜兴奋> [小白兔] >> 哇！小蝴蝶飞到花丛里啦！

# 情感描述要求

情感标签必须放在尖括号内：<情感描述>

要求：
- 使用具体、可表演、可朗读的情绪描述
- 长度控制在2~6个字
- 优先体现说话语气，而非抽象心理活动
- 根据剧情变化灵活调整
- 同一页不同角色可以使用不同情绪
- 情感标签优先描述"说话方式"，使用如"开心雀跃、伤心哽咽、神秘低声、焦急呼喊、坚定鼓励"等可直接指导语音表现的标签

推荐情感示例：
<温柔讲述> <开心雀跃> <惊喜兴奋> <好奇疑惑> <紧张担心> <害怕发抖> <骄傲得意> <委屈难过> <伤心哽咽> <激动大喊> <认真解释> <神秘低声> <轻松愉快> <期待满满> <坚定勇敢> <焦急呼喊> <调皮可爱> <感动温暖> <兴奋欢呼> <疲惫虚弱>

# 内容要求

1. 页码范围严格为 1~${pages.length > 0 ? pages.length : "15"} 页。
2. 角色名必须使用方括号：[旁白] [小明] [老师]
3. 台词内容放在 >> 后面。
4. 每页至少生成 1 条内容，可包含多条对白和旁白。
5. 旁白负责描述场景、动作、时间变化和剧情转折。
6. 角色对白体现人物性格、情绪和互动。
7. 不要解释、分析或添加任何额外说明。
8. 不要使用 Markdown 列表、代码块或标题。
9. 仅输出符合格式的内容。
10. 情绪需与当前画面和剧情高度匹配，保证朗读时具有表现力和情感起伏。`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        showSuccess("AI 提示词已复制到剪贴板");
      }).catch(() => {});
    }
  };

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
              emotionMode: "none" as EmotionMode,
              emoAlpha: 1.0,
              emoVector: [0, 0, 0, 0, 0, 0, 0, 0],
              emoText: "",
              speed: 1.0,
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

  const generateSegmentAudio = async (seg: ScriptSegment): Promise<boolean> => {
    if (!seg.text.trim()) return false;
    const char = characters.find(c => c.id === seg.speakerId);
    if (!char) { showError("请先选择角色"); return false; }
    if (!char.spkAudioPrompt) { showError(`角色 "${char.name}" 未设置音色参考音频`); return false; }

    setGeneratingSegIds(prev => new Set(prev).add(seg.id));
    updateSegment(seg.id, { isGenerating: true });

    try {
      const res = await ttsSingle(seg.text, {
        spk_audio_prompt: char.spkAudioPrompt,
        emotion_mode: seg.emotionMode,
        emo_alpha: char.emoAlpha,
        emo_vector: seg.emotionMode === "vector" ? seg.emoVector : undefined,
        emo_text: seg.emotionMode === "text" ? seg.emoText : undefined,
        speed: char.speed,
        use_random: false,
      });
      updateSegment(seg.id, { audioUrl: res.audio_url, durationSecs: res.duration_secs, isGenerating: false, isDone: true });
      return true;
    } catch (err: any) {
      updateSegment(seg.id, { isGenerating: false });
      showError(`语音生成失败: ${err.message}`);
      return false;
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
      const ok = await generateSegmentAudio(seg);
      if (ok) success++;
      else fail++;
    }

    setIsGeneratingAudio(false);
    if (fail === 0) showSuccess(`全部生成完成 (${success} 段)`);
    else showToast(`完成 ${success} 段，${fail} 段失败`, "warning");
  };

  // ── Audio Playback (sequential playlist) ─────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);

  const getPlaylist = useCallback(() => {
    const list: { segId: string; audioUrl: string }[] = [];
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    for (const page of sortedPages) {
      const segs = pageSegments.get(page.id) || [];
      for (const seg of segs) {
        if (seg.audioUrl) {
          list.push({ segId: seg.id, audioUrl: seg.audioUrl });
        }
      }
    }
    return list;
  }, [pages, pageSegments]);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingSegmentId(null);
    setIsPlayingAll(false);
  }, []);

  const playSegmentById = useCallback((segId: string) => {
    const playlist = getPlaylist();
    const entry = playlist.find(p => p.segId === segId);
    if (!entry) return;

    audioRef.current?.pause();

    const fullUrl = entry.audioUrl.startsWith("http") || entry.audioUrl.startsWith("/api")
      ? entry.audioUrl
      : audioUrl(entry.audioUrl);

    const audio = new Audio(fullUrl);
    audio.onended = () => {
      const currentPlaylist = getPlaylist();
      const idx = currentPlaylist.findIndex(p => p.segId === segId);
      if (idx >= 0 && idx < currentPlaylist.length - 1) {
        playSegmentById(currentPlaylist[idx + 1].segId);
      } else {
        setPlayingSegmentId(null);
        setIsPlayingAll(false);
      }
    };
    audio.onerror = () => {
      stopPlayback();
      showError("音频播放失败");
    };
    audio.play().catch(() => showError("音频播放失败"));
    audioRef.current = audio;
    setPlayingSegmentId(segId);
  }, [getPlaylist, stopPlayback]);

  const togglePlaySegment = useCallback((segId: string) => {
    if (playingSegmentId === segId) {
      stopPlayback();
    } else {
      playSegmentById(segId);
    }
  }, [playingSegmentId, playSegmentById, stopPlayback]);

  const togglePlayAll = useCallback(() => {
    if (isPlayingAll) {
      stopPlayback();
      return;
    }
    const playlist = getPlaylist();
    if (playlist.length === 0) {
      showToast("没有可播放的音频", "info");
      return;
    }
    setIsPlayingAll(true);
    playSegmentById(playlist[0].segId);
  }, [isPlayingAll, getPlaylist, playSegmentById, stopPlayback, showToast]);

  // ── Audio Download ─────────────────────────────────────────────────────────
  const downloadAllAudioAsZip = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    let globalIdx = 0;
    for (const page of sortedPages) {
      const segs = pageSegments.get(page.id) || [];
      for (const seg of segs) {
        if (!seg.audioUrl) continue;
        globalIdx++;
        const url = seg.audioUrl.startsWith("http") || seg.audioUrl.startsWith("/api")
          ? seg.audioUrl
          : audioUrl(seg.audioUrl);
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          zip.file(`第${page.pageNumber}页_段落${globalIdx}.wav`, blob);
        } catch {}
      }
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = `${(file?.name || "音频").replace(/\.pdf$/i, "")}_批量音频.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
    showSuccess("批量下载完成");
  };

  const downloadCombinedAudio = async () => {
    const allSegs = Array.from(pageSegments.entries())
      .flatMap(([_, segs]) => segs)
      .filter(s => s.audioUrl);
    if (allSegs.length === 0) {
      showToast("没有可下载的音频", "info");
      return;
    }
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const audioUrls: string[] = [];
    for (const page of sortedPages) {
      const segs = pageSegments.get(page.id) || [];
      for (const seg of segs) {
        if (seg.audioUrl) audioUrls.push(seg.audioUrl);
      }
    }
    try {
      const res = await fetch("/api/studio/audio/concatenate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_urls: audioUrls, silence_secs: 1.0 }),
      });
      if (!res.ok) throw new Error("合成失败");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${(file?.name || "音频").replace(/\.pdf$/i, "")}_合成音频.wav`;
      link.click();
      URL.revokeObjectURL(link.href);
      showSuccess("合成音频下载完成");
    } catch (err: any) {
      showError(err.message);
    }
  };

  const exportSubtitles = () => {
    const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const lines: string[] = [];
    let offsetMs = 0;
    let subtitleIdx = 0;

    for (const page of sortedPages) {
      const segs = pageSegments.get(page.id) || [];
      for (const seg of segs) {
        if (!seg.audioUrl || !seg.text.trim()) {
          if (seg.durationSecs) offsetMs += seg.durationSecs * 1000 + 1000;
          continue;
        }
        subtitleIdx++;
        const durMs = Math.round((seg.durationSecs || 2.0) * 1000);
        const startMs = offsetMs;
        const endMs = offsetMs + durMs;

        const fmt = (ms: number) => {
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          const ml = ms % 1000;
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ml).padStart(3, "0")}`;
        };

        lines.push(String(subtitleIdx));
        lines.push(`${fmt(startMs)} --> ${fmt(endMs)}`);
        lines.push(seg.text);
        lines.push("");

        offsetMs = endMs + 1000;
      }
    }

    const srtContent = lines.join("\n");
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${(file?.name || "字幕").replace(/\.pdf$/i, "")}.srt`;
    link.click();
    URL.revokeObjectURL(link.href);
    showSuccess("字幕文件已导出");
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
      const projectPages = pages.map(p => {
        const segs = pageSegments.get(p.id) || [];
        const clips = segs
          .filter(s => s.audioUrl)
          .map(s => ({
            audio_url: s.audioUrl!,
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

      const res = await fetch("/api/studio/render-video/project", {
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

  // ── Project CRUD ───────────────────────────────────────────────────────────

  const getProjectSnapshot = useCallback(() => {
    return createProjectSnapshot(
      file?.name || "",
      file?.size || 0,
      pages.map(p => ({ id: p.id, pageNumber: p.pageNumber, dataUrl: p.dataUrl, width: p.width, height: p.height })),
      characters.map(c => ({ id: c.id, name: c.name, color: c.color, spkAudioPrompt: c.spkAudioPrompt, spkAudioName: c.spkAudioName, emoAlpha: c.emoAlpha, speed: c.speed })),
      pageSegments,
      { transitionType, transitionDuration, enableSubtitles },
      aiPrompt,
      videoFileName,
    );
  }, [file, pages, characters, pageSegments, transitionType, transitionDuration, enableSubtitles, aiPrompt, videoFileName]);

  const saveProject = useCallback(async () => {
    if (pages.length === 0) return;
    setSaveStatus("saving");
    try {
      const snap = getProjectSnapshot();
      const id = await saveProjectToDB(currentProjectId, projectName, snap);
      setCurrentProjectId(id);
      if (!projectName.trim()) setProjectName(snap.fileName.replace(/\.pdf$/i, "") || "");
      listProjects().then(setHistory);
      setSaveStatus("saved");
    } catch (err) {
      console.error("保存失败:", err);
      showError("项目保存失败");
      setSaveStatus("unsaved");
    }
  }, [currentProjectId, projectName, pages, getProjectSnapshot, showError]);

  const loadProject = useCallback(async (meta: ProjectMeta) => {
    try {
      const data = await loadProjectFromDB(meta.id);
      if (!data) { showError("项目数据不存在"); return; }
      setCurrentProjectId(data.id);
      setProjectName(data.name);
      // restore pages
      setPages(data.pages.map(p => ({ ...p, rotation: 0 })));
      // restore characters
      setCharacters(data.characters.map(c => ({ ...c, emoAlpha: c.emoAlpha ?? 1.0, speed: c.speed ?? 1.0, audioBlob: undefined, isExpanded: false })));
      // restore page segments
      const segMap = new Map<number, ScriptSegment[]>();
      for (const ps of data.pageSegments || []) {
        segMap.set(ps.pageId, ps.segments.map(s => ({ ...s, audioBlob: undefined, isGenerating: false } as ScriptSegment)));
      }
      setPageSegments(segMap);
      setAiPrompt(data.aiPrompt || "");
      if (data.renderConfig) {
        setTransitionType(data.renderConfig.transitionType || "fade");
        setTransitionDuration(data.renderConfig.transitionDuration ?? 1.0);
        setEnableSubtitles(data.renderConfig.enableSubtitles ?? true);
      }
      setVideoFileName(data.videoFileName || "");
      setVideoUrl(null);
      setShowHistory(false);
      showSuccess("项目加载成功");
    } catch (err) {
      console.error("加载失败:", err);
      showError("项目加载失败");
    }
  }, [showSuccess, showError]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await deleteProjectFromDB(id);
      if (currentProjectId === id) {
        setCurrentProjectId(null);
        setProjectName("");
      }
      listProjects().then(setHistory);
      showSuccess("项目已删除");
    } catch (err) {
      console.error("删除失败:", err);
      showError("删除失败");
    }
  }, [currentProjectId, showSuccess, showError]);

  const createNewProject = useCallback(() => {
    setCurrentProjectId(null);
    setProjectName("");
    setFile(null);
    setPages([]);
    setCharacters([createDefaultCharacter(0, "旁白")]);
    setPageSegments(new Map());
    setAiPrompt("");
    setVideoUrl(null);
    setVideoFileName("");
    showSuccess("已创建新项目");
  }, [showSuccess]);

  // ── Status ──────────────────────────────────────────────────────────────────

  const getStatus = (): WorkStatus => {
    if (isConverting || isGeneratingAudio || isRenderingVideo) return "processing";
    if (videoUrl) return "done";
    if (pages.length > 0) return "idle";
    return "idle";
  };

  const getStatusText = () => {
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

  // ── Auto-restore (on mount) ────────────────────────────────────────────────

  useEffect(() => {
    if (!isIndexedDBAvailable()) return;
    listProjects().then(setHistory).catch(console.error);
    loadTempSnapshot().then(snap => {
      if (!snap) return;
      setProjectName(snap.fileName.replace(/\.pdf$/i, "") || "");
      setPages(snap.pages.map(p => ({ ...p, rotation: 0, selected: false })));
      setCharacters(snap.characters.map(c => ({ ...c, emoAlpha: c.emoAlpha ?? 1.0, speed: c.speed ?? 1.0, audioBlob: undefined, isExpanded: false })));
      const segMap = new Map<number, ScriptSegment[]>();
      for (const ps of snap.pageSegments || []) {
        segMap.set(ps.pageId, ps.segments.map(s => ({ ...s, audioBlob: undefined, isGenerating: false } as ScriptSegment)));
      }
      setPageSegments(segMap);
      setAiPrompt(snap.aiPrompt || "");
      setTransitionType(snap.renderConfig.transitionType || "fade");
      setTransitionDuration(snap.renderConfig.transitionDuration ?? 1.0);
      setEnableSubtitles(snap.renderConfig.enableSubtitles ?? true);
      setVideoFileName(snap.videoFileName || "");
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save (debounced) ──────────────────────────────────────────────────

  useEffect(() => {
    if (pages.length === 0) return;
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      const snap = getProjectSnapshot();
      saveTempSnapshot(snap).then(() => {
        setSaveStatus("saved");
        listProjects().then(setHistory);
      }).catch(err => {
        console.error("自动保存失败:", err);
        setSaveStatus("unsaved");
      });
    }, 2000);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, characters, pageSegments, transitionType, transitionDuration, enableSubtitles, aiPrompt, videoFileName]);

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
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative overflow-hidden rounded-3xl border-2 border-dashed cursor-pointer
              transition-all duration-300 ease-out
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
                {isDragging ? "释放以上传 PDF" : "拖放 PDF 文件到这里"}
              </h2>
              <p className="text-slate-500 mb-6">点击选择文件，将 PDF 绘本一键转为视频</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">支持多角色配音</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">情感语音合成</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">自动生成视频</span>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileInput} className="hidden" />
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

      {/* ── Project Toolbar ── */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/60 px-6 py-3 flex items-center justify-between shadow-sm z-30 relative">
        <div className="flex items-center gap-2 w-1/3">
          <div className="relative w-full group flex items-center">
            <FolderClosed className="absolute left-3.5 w-4 h-4 text-slate-400 group-hover:text-cyan-500 group-focus-within:text-cyan-500 transition-colors pointer-events-none" />
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="未命名项目..."
              className="w-full text-sm font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10 rounded-xl pl-10 pr-4 py-2 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 shadow-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Save status */}
          {saveStatus === "saving" && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />保存中...
            </span>
          )}
          {saveStatus === "saved" && pages.length > 0 && (
            <span className="text-[11px] text-emerald-500">已保存</span>
          )}
          {saveStatus === "unsaved" && (
            <span className="text-[11px] text-amber-500">未保存</span>
          )}
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={saveProject}
            disabled={pages.length === 0}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all shadow-sm shadow-cyan-200/50 flex items-center gap-1.5"
          >
            <Check className="w-3 h-3" />
            保存
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all flex items-center gap-1.5"
          >
            <History className="w-3 h-3 text-slate-400" />
            历史记录
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={createNewProject}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            新建
          </button>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-4 pb-4">
        {/* ── 3-Panel Layout ── */}
        <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 10rem)" }}>
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
                  {/* Hover actions */}
                  <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewPage(p); }}
                      className="p-1.5 bg-white/90 rounded-lg hover:bg-white text-slate-700 hover:text-cyan-600 transition-all shadow"
                      title="预览"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 bg-white/90 rounded-lg hover:bg-white text-slate-700 hover:text-violet-600 transition-all shadow cursor-pointer"
                      title="替换"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/*,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleReplacePageImage(p.id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      onClick={(e) => { e.stopPropagation(); rotatePage(p.id, 90); }}
                      className="p-1.5 bg-white/90 rounded-lg hover:bg-white text-slate-700 hover:text-cyan-600 transition-all shadow"
                      title="右转 90°"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                      className="p-1.5 bg-white/90 rounded-lg hover:bg-white text-slate-700 hover:text-red-500 transition-all shadow"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                <button
                  onClick={() => rotateAllPages(270)}
                  disabled={isConverting}
                  className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all disabled:opacity-30"
                  title="所有页面左转 90°"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => rotateAllPages(90)}
                  disabled={isConverting}
                  className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all disabled:opacity-30"
                  title="所有页面右转 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
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
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={togglePlayAll}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                    >
                      {isPlayingAll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isPlayingAll ? "暂停" : "播放全部"}
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-all"
                    >
                      <FileUp className="w-3 h-3" />
                      批量导入
                    </button>
                    <button
                      onClick={addSegment}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                    >
                      <Plus className="w-3 h-3" />
                      添加段落
                    </button>
                  </div>
                </div>

                {currentSegments.length === 0 && (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    点击"添加段落"开始编写剧本
                  </div>
                )}

                {currentSegments.map((seg, idx) => (
                  <div key={seg.id} className={`p-3 bg-white rounded-xl border space-y-2 ${
                    playingSegmentId === seg.id
                      ? "border-cyan-400 ring-2 ring-cyan-200/60"
                      : "border-slate-200"
                  }`}>
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
                            onClick={() => togglePlaySegment(seg.id)}
                            className={`p-1.5 rounded-lg transition-all ${
                              playingSegmentId === seg.id
                                ? "bg-cyan-100 text-cyan-600"
                                : "text-slate-400 hover:text-cyan-600 hover:bg-cyan-50"
                            }`}
                          >
                            {playingSegmentId === seg.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
                    {/* Per-segment emotion & speed controls */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={seg.emotionMode}
                          onChange={(e) => updateSegment(seg.id, { emotionMode: e.target.value as EmotionMode })}
                          className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
                        >
                          <option value="none">无情感</option>
                          <option value="audio">情感复刻</option>
                          <option value="vector">情感向量</option>
                          <option value="text">文本描述</option>
                        </select>
                      </div>
                      {seg.emotionMode === "vector" && (
                        <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                          {["开心", "生气", "悲伤", "害怕", "厌恶", "忧郁", "惊讶", "平静"].map((label, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-400">{label}</span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={seg.emoVector[i]}
                                onChange={(e) => {
                                  const v = [...seg.emoVector];
                                  v[i] = parseFloat(e.target.value);
                                  updateSegment(seg.id, { emoVector: v });
                                }}
                                className="flex-1 h-0.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-cyan-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {seg.emotionMode === "text" && (
                        <input
                          type="text"
                          value={seg.emoText}
                          onChange={(e) => updateSegment(seg.id, { emoText: e.target.value })}
                          placeholder="如：温柔地、激动地、悲伤地..."
                          className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-400"
                        />
                      )}
                    </div>
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
              <div className="flex items-center gap-1.5">
                {characters.some(c => c.spkAudioPrompt) && (
                  <button
                    onClick={applyVoiceToAll}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-all"
                  >
                    <Copy className="w-3 h-3" />
                    统一音色
                  </button>
                )}
                <button
                  onClick={addCharacter}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all"
                >
                  <UserPlus className="w-3 h-3" />
                  添加角色
                </button>
              </div>
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
                <div className="flex gap-2">
                  <button
                    onClick={downloadAllAudioAsZip}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    批量下载
                  </button>
                  <button
                    onClick={downloadCombinedAudio}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    合成音频
                  </button>
                  <button
                    onClick={exportSubtitles}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    导出字幕
                  </button>
                </div>
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

      {/* History Modal */}
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
                history.filter(p => p.pageCount > 0).map(p => (
                  <div key={p.id} onClick={() => loadProject(p)} className="group p-3 rounded-xl border border-slate-200 hover:border-cyan-300 cursor-pointer transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm text-slate-800 truncate">{p.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">{new Date(p.updatedAt).toLocaleString()}</p>
                        <p className="text-xs text-slate-400 mt-1">{p.pageCount} 个页面</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0">
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

      {/* Batch Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">批量导入剧本</h2>
                <p className="text-xs text-slate-500 mt-1">按格式粘贴剧本内容，角色和段落会自动创建</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-mono whitespace-pre leading-relaxed">{SCRIPT_FORMAT_HINT}</p>
                <button
                  onClick={generateImportPrompt}
                  className="ml-4 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-all flex items-center gap-1 shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  复制 AI 提示词
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`{1} <温柔讲述> [旁白] >> 很久以前有一座山\n{1} <开心雀跃> [小红帽] >> 奶奶我来看你了\n{2} <紧张担心> [旁白] >> 小红帽走进了大森林`}
                rows={12}
                className="w-full px-4 py-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-400 resize-none placeholder:text-slate-300"
              />
              {importText.trim() && (
                <div className="mt-2 text-[11px] text-slate-500">
                  已识别 <strong className="text-cyan-600">{parseImportText(importText).length}</strong> 段剧本，
                  涉及 <strong className="text-cyan-600">{new Set(parseImportText(importText).map(p => p.speakerName)).size}</strong> 个角色
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowImportModal(false); setImportText(""); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                取消
              </button>
              <button
                onClick={handleBatchImport}
                disabled={!importText.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 rounded-lg transition-all flex items-center gap-1.5"
              >
                <FileUp className="w-4 h-4" />
                导入剧本
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen Page Preview */}
      {previewPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewPage(null)}
        >
          <button
            onClick={() => setPreviewPage(null)}
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white/60 text-sm">
            第 {previewPage.pageNumber} 页
          </div>
          <img
            src={previewPage.dataUrl}
            alt={`Page ${previewPage.pageNumber}`}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
