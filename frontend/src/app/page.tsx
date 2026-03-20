"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  type VoiceSettings as TVoiceSettings,
  ScriptSegment,
  AudioSegmentResult,
  generateScript,
  ttsSingle,
} from "@/lib/api";
import { useNotification } from "@/lib/NotificationContext";

import {
  Sparkles,
  Settings,
  Mic2,
  Square,
  Play,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  History,
  Trash2,
  Save,
  Check,
  RotateCcw
} from "lucide-react";

import ImageUploader from "@/components/ImageUploader";
import PromptEditor from "@/components/PromptEditor";
import ScriptPreview from "@/components/ScriptPreview";
import VoiceSettingsPanel from "@/components/VoiceSettings";
import AudioPlayer from "@/components/AudioPlayer";
import SettingsModal from "@/components/SettingsModal";
import GlobalHeader from "@/components/GlobalHeader";

const DEFAULT_VOICE: TVoiceSettings = {
  spk_audio_prompt: "",
  emotion_mode: "none",
  emo_alpha: 1.0,
  use_random: false,
};

type Step = "idle" | "scripting" | "synthesizing" | "done" | "error";

// 历史记录类型
interface ProjectHistory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  topic: string;
  prompt: string;
  images: string[];
  script: ScriptSegment[];
  segments: AudioSegmentResult[];
  voiceSettings: TVoiceSettings;
}

const HISTORY_STORAGE_KEY = "javis_studio_history";
const MAX_HISTORY_ITEMS = 20;

// 暂存相关的 key 和过期时间（24小时）
const TEMP_STORAGE_KEY = "javis_studio_temp";
const TEMP_STORAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

interface TempStorageData {
  projectName: string;
  topic: string;
  images: string[];
  prompt: string;
  voiceSettings: TVoiceSettings;
  script: ScriptSegment[];
  segments: AudioSegmentResult[];
  timestamp: number;
}

// 加载历史记录
function loadHistory(): ProjectHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    console.error("Failed to load history");
  }
  return [];
}

// 估算数据大小（字节）
function getDataSize(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

// 限制单张图片大小（base64 字符串超过此长度会被截断）
const MAX_IMAGE_SIZE = 100 * 1024; // 100KB

// 清理历史记录中的图片数据以节省空间
function compressHistoryForStorage(history: ProjectHistory[]): ProjectHistory[] {
  return history.map(item => ({
    ...item,
    // 每张图片限制大小，超过则截断
    images: item.images
      .slice(0, 2) // 最多保留2张
      .map(img => img.length > MAX_IMAGE_SIZE ? img.substring(0, MAX_IMAGE_SIZE) : img),
  }));
}

// 保存历史记录
function saveHistory(history: ProjectHistory[]) {
  if (typeof window === "undefined") return;
  
  const trySave = (data: ProjectHistory[]): boolean => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  };
  
  try {
    const dataToSave = history.slice(0, MAX_HISTORY_ITEMS);
    const jsonString = JSON.stringify(dataToSave);
    
    // 检查数据大小，如果超过 2MB 尝试压缩
    const size = new Blob([jsonString]).size;
    if (size > 2 * 1024 * 1024) {
      console.warn(`History data too large (${(size / 1024 / 1024).toFixed(2)}MB), compressing...`);
      const compressed = compressHistoryForStorage(dataToSave);
      if (trySave(compressed)) {
        console.log('Saved compressed history');
        return;
      }
    } else {
      if (trySave(dataToSave)) return;
    }
    
    // 如果保存失败，进入 fallback 流程
    throw new Error('Quota exceeded');
  } catch (err) {
    // 处理 localStorage 配额超限错误 - 多级 fallback 策略
    if (err instanceof Error && (err.name === 'QuotaExceededError' || err.message?.includes('quota') || err.message?.includes('Quota exceeded'))) {
      console.warn('localStorage quota exceeded, trying fallback strategies...');
      
      // Level 1: 保留最近一半数据
      const halfHistory = history.slice(0, Math.floor(MAX_HISTORY_ITEMS / 2));
      const compressedHalf = compressHistoryForStorage(halfHistory);
      if (trySave(compressedHalf)) {
        console.log('Successfully saved half history');
        return;
      }
      
      // Level 2: 只保留最近3条
      const threeHistory = history.slice(0, 3);
      const compressedThree = compressHistoryForStorage(threeHistory);
      if (trySave(compressedThree)) {
        console.log('Successfully saved 3 most recent items');
        return;
      }
      
      // Level 3: 只保留最近1条，且移除所有图片
      const oneHistory = history.slice(0, 1).map(item => ({ ...item, images: [] }));
      if (trySave(oneHistory)) {
        console.log('Successfully saved 1 recent item without images');
        return;
      }
      
      // Level 4: 清空历史记录
      console.error('All fallback strategies failed, clearing history');
      try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // 无法清除，静默处理
      }
    } else {
      console.error("Failed to save history:", err);
    }
  }
}

// 保存暂存数据到 sessionStorage
function saveTempData(data: Omit<TempStorageData, 'timestamp'>) {
  if (typeof window === "undefined") return;
  try {
    const storageData: TempStorageData = {
      ...data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(storageData));
  } catch {
    console.error("Failed to save temp data");
  }
}

// 加载暂存数据
function loadTempData(): TempStorageData | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(TEMP_STORAGE_KEY);
    if (saved) {
      const data: TempStorageData = JSON.parse(saved);
      // 检查是否过期
      if (Date.now() - data.timestamp > TEMP_STORAGE_EXPIRY) {
        sessionStorage.removeItem(TEMP_STORAGE_KEY);
        return null;
      }
      return data;
    }
  } catch {
    console.error("Failed to load temp data");
  }
  return null;
}

// 清除暂存数据
function clearTempData() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TEMP_STORAGE_KEY);
  } catch {
    console.error("Failed to clear temp data");
  }
}

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export default function StudioPage() {
  const { showConfirm } = useNotification();
  
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [voiceSettings, setVoiceSettings] = useState<TVoiceSettings>(DEFAULT_VOICE);

  const [script, setScript] = useState<ScriptSegment[]>([]);
  const [segments, setSegments] = useState<AudioSegmentResult[]>([]);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [history, setHistory] = useState<ProjectHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 分段合成进度
  const [synthesisProgress, setSynthesisProgress] = useState<{
    total: number;
    current: number;
    segmentTimes: number[]; // 每段耗时（毫秒）
    startTime: number | null;
    failed: { segment: ScriptSegment; error: string; retryCount: number }[];
  }>({
    total: 0,
    current: 0,
    segmentTimes: [],
    startTime: null,
    failed: [],
  });

  // 单个段落生成状态
  const [generatingSegments, setGeneratingSegments] = useState<number[]>([]);

  // 当前播放的音频段落索引
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);

  // 保存成功提示状态
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 加载历史记录和暂存数据
  useEffect(() => {
    setHistory(loadHistory());
    
    // 加载暂存数据
    const tempData = loadTempData();
    if (tempData) {
      setProjectName(tempData.projectName);
      setTopic(tempData.topic);
      setImages(tempData.images);
      setPrompt(tempData.prompt);
      setVoiceSettings(tempData.voiceSettings);
      setScript(tempData.script);
      setSegments(tempData.segments);
    }
  }, []);

  // 自动保存到 sessionStorage（暂存）
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // 只在有内容时保存
      if (projectName || topic || prompt || images.length > 0 || script.length > 0) {
        saveTempData({
          projectName,
          topic,
          images,
          prompt,
          voiceSettings,
          script,
          segments,
        });
      }
    }, 1000); // 延迟1秒保存，避免频繁写入

    return () => clearTimeout(timeoutId);
  }, [projectName, topic, images, prompt, voiceSettings, script, segments]);

  // 清空所有内容
  const handleClearAll = useCallback(() => {
    showConfirm({
      title: "清空内容",
      message: "确定要清空所有内容吗？此操作不可恢复。",
      confirmText: "清空",
      cancelText: "取消",
      onConfirm: () => {
        setCurrentProjectId(null);
        setProjectName("");
        setTopic("");
        setPrompt("");
        setImages([]);
        setScript([]);
        setSegments([]);
        setVoiceSettings(DEFAULT_VOICE);
        setStep("idle");
        setError("");
        clearTempData();
      }
    });
  }, [showConfirm]);

  // 保存当前项目到历史记录
  const saveCurrentProject = useCallback(() => {
    if (!projectName.trim() && script.length === 0) return;

    const now = new Date().toISOString();
    const newHistory: ProjectHistory = {
      id: currentProjectId || generateId(),
      name: projectName.trim() || `未命名项目 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      createdAt: currentProjectId ? (history.find(h => h.id === currentProjectId)?.createdAt || now) : now,
      updatedAt: now,
      topic,
      prompt,
      images,
      script,
      segments,
      voiceSettings,
    };

    setHistory(prev => {
      const filtered = prev.filter(h => h.id !== newHistory.id);
      const updated = [newHistory, ...filtered];
      saveHistory(updated);
      return updated;
    });
    setCurrentProjectId(newHistory.id);

    // 显示保存成功提示
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [projectName, topic, prompt, images, script, segments, voiceSettings, currentProjectId, history]);

  // 加载历史项目
  const loadProject = useCallback((project: ProjectHistory) => {
    setCurrentProjectId(project.id);
    setProjectName(project.name);
    setTopic(project.topic);
    setPrompt(project.prompt);
    setImages(project.images);
    setScript(project.script);
    setSegments(project.segments);
    setVoiceSettings(project.voiceSettings || DEFAULT_VOICE);
    setShowHistory(false);
    setStep("idle");
    setError("");
  }, []);

  // 删除历史项目
  const deleteProject = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      saveHistory(updated);
      return updated;
    });
    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
  }, [currentProjectId]);

  // 创建新项目
  const createNewProject = useCallback(() => {
    setCurrentProjectId(null);
    setProjectName("");
    setTopic("");
    setPrompt("");
    setImages([]);
    setScript([]);
    setSegments([]);
    setVoiceSettings(DEFAULT_VOICE);
    setStep("idle");
    setError("");
    setShowHistory(false);
  }, []);

  const canGenScript = topic.trim().length > 0 || prompt.trim().length > 0;
  const canGenAudio = script.length > 0 && !!voiceSettings.spk_audio_prompt;

  const handleGenerateScript = async () => {
    setError("");
    setStep("scripting");
    setScript([]);
    setSegments([]);
    try {
      const fullPrompt = topic ? `主题：${topic}\n\n${prompt}` : prompt;
      const res = await generateScript(images, fullPrompt);
      setScript(res.script);
      setStep("idle");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "脚本生成失败");
      setStep("error");
    }
  };

  // 合成单段音频，支持重试
  const synthesizeSegment = async (
    seg: ScriptSegment,
    maxRetries = 3
  ): Promise<{ success: true; result: AudioSegmentResult; duration: number } | { success: false; error: string }> => {
    let lastError = "";
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await ttsSingle(seg.text, voiceSettings);
        const generated: AudioSegmentResult = {
          segment_index: seg.index,
          text: seg.text,
          audio_url: res.audio_url,
          duration_secs: res.duration_secs
        };
        return { success: true, result: generated, duration: 0 }; // duration 由调用方计算
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "合成失败";
        if (attempt < maxRetries - 1) {
          // 等待后重试（指数退避）
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    
    return { success: false, error: lastError };
  };

  const handleGenerateAudio = async () => {
    setError("");
    setStep("synthesizing");

    // Initialize progress tracking
    const remainingSegments = script.filter(seg => {
      const existing = segments.find(s => s.segment_index === seg.index);
      return !existing || existing.text !== seg.text;
    });

    setSynthesisProgress({
      total: remainingSegments.length,
      current: 0,
      segmentTimes: [],
      startTime: Date.now(),
      failed: [],
    });

    // Create an abort controller to support cancellation
    abortControllerRef.current = new AbortController();
    const newSegments = [...segments];
    const failedSegments: { segment: ScriptSegment; error: string; retryCount: number }[] = [];

    try {
      for (const seg of script) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }

        const existing = newSegments.find(s => s.segment_index === seg.index);
        if (existing && existing.text === seg.text) {
          continue; // Already generated this text
        }

        const segmentStartTime = Date.now();
        const result = await synthesizeSegment(seg);
        const segmentDuration = Date.now() - segmentStartTime;

        if (result.success) {
          const eIdx = newSegments.findIndex(s => s.segment_index === seg.index);
          if (eIdx >= 0) {
            newSegments[eIdx] = result.result;
          } else {
            newSegments.push(result.result);
          }
        } else {
          // 记录失败的段
          failedSegments.push({ segment: seg, error: result.error, retryCount: 3 });
        }

        // Update progress (无论成功失败，current 都增加)
        setSynthesisProgress(prev => ({
          ...prev,
          current: prev.current + 1,
          segmentTimes: [...prev.segmentTimes, segmentDuration],
          failed: [...failedSegments],
        }));

        // Progressively update state
        setSegments([...newSegments]);
      }

      if (abortControllerRef.current.signal.aborted) {
        setStep("idle");
        return;
      }

      // 如果有失败的段落，不标记为完成，保持在 synthesizing 状态让用户重试
      if (failedSegments.length > 0) {
        setError(`${failedSegments.length} 段音频合成失败，可点击下方"重试失败段落"按钮继续`);
        setStep("error");
      } else {
        setStep("done");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "音频合成失败");
      setStep("error");
    } finally {
      abortControllerRef.current = null;
    }
  };

  // 重试失败的段落
  const handleRetryFailed = async () => {
    if (synthesisProgress.failed.length === 0) return;
    
    setError("");
    setStep("synthesizing");

    // Create an abort controller to support cancellation
    abortControllerRef.current = new AbortController();
    const newSegments = [...segments];
    const stillFailed: typeof synthesisProgress.failed = [];

    try {
      for (const failed of synthesisProgress.failed) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }

        const segmentStartTime = Date.now();
        const result = await synthesizeSegment(failed.segment);
        const segmentDuration = Date.now() - segmentStartTime;

        if (result.success) {
          const eIdx = newSegments.findIndex(s => s.segment_index === failed.segment.index);
          if (eIdx >= 0) {
            newSegments[eIdx] = result.result;
          } else {
            newSegments.push(result.result);
          }

          // Update progress - 从失败列表中移除，但不增加 current（已经在第一次尝试时算过了）
          setSynthesisProgress(prev => ({
            ...prev,
            segmentTimes: [...prev.segmentTimes, segmentDuration],
            failed: prev.failed.filter(f => f.segment.index !== failed.segment.index),
          }));

          setSegments([...newSegments]);
        } else {
          // 仍然失败
          stillFailed.push({ ...failed, retryCount: failed.retryCount + 3 });
          setSynthesisProgress(prev => ({
            ...prev,
            failed: stillFailed,
          }));
        }
      }

      if (abortControllerRef.current.signal.aborted) {
        setStep("idle");
        return;
      }

      if (stillFailed.length > 0) {
        setError(`${stillFailed.length} 段音频仍然失败，可再次尝试重试`);
        setStep("error");
      } else {
        setStep("done");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "音频合成失败");
      setStep("error");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Reset progress after a delay so user can see final state
    setTimeout(() => {
      setSynthesisProgress({
        total: 0,
        current: 0,
        segmentTimes: [],
        startTime: null,
        failed: [],
      });
    }, 2000);
  };

  // 生成单个段落的音频
  const handleGenerateSegment = async (segmentIndex: number) => {
    const seg = script.find(s => s.index === segmentIndex);
    if (!seg) return;

    setGeneratingSegments(prev => [...prev, segmentIndex]);
    setError("");

    try {
      const result = await synthesizeSegment(seg);

      if (result.success) {
        // 更新对应序号的音频
        setSegments(prev => {
          const existingIndex = prev.findIndex(s => s.segment_index === segmentIndex);
          if (existingIndex >= 0) {
            // 覆盖原有音频
            const updated = [...prev];
            updated[existingIndex] = result.result;
            return updated;
          } else {
            // 插入新音频并保持排序
            const newSegments = [...prev, result.result];
            return newSegments.sort((a, b) => a.segment_index - b.segment_index);
          }
        });
      } else {
        setError(`第 ${segmentIndex + 1} 段音频生成失败: ${result.error}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `第 ${segmentIndex + 1} 段音频生成失败`);
    } finally {
      setGeneratingSegments(prev => prev.filter(idx => idx !== segmentIndex));
    }
  };

  const getStatus = () => {
    if (step === "error") return "error";
    if (step === "done") return "done";
    if (step === "idle") return "idle";
    return "processing";
  };

  const getStatusText = () => {
    switch (step) {
      case "idle": return "就绪";
      case "scripting": return "AI 生成脚本中…";
      case "synthesizing": return "语音合成中…";
      case "done": return "完成";
      case "error": return "出错了";
      default: return "就绪";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      {/* Global Header */}
      <GlobalHeader
        showStatus={true}
        status={getStatus()}
        statusText={getStatusText()}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {/* Main layout */}
      <main className="w-full mx-auto px-6 py-6 grid grid-cols-12 gap-5 h-[calc(100vh-3.5rem)] overflow-hidden">

        <aside className="col-span-3 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-4 min-h-0 overflow-hidden">
            {/* 项目名称输入 */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">项目名称</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="输入项目名称（用于保存和排查）"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-5">
              <ImageUploader images={images} onChange={setImages} />
              <PromptEditor topic={topic} onTopicChange={setTopic} value={prompt} onChange={setPrompt} />
            </div>

            <div className="pt-3 border-t border-slate-200/60 space-y-2">
              <button
                onClick={handleGenerateScript}
                disabled={!canGenScript || step === "scripting"}
                className="group w-full py-2.5 rounded-xl text-sm text-white font-semibold transition-all duration-300
                           bg-gradient-to-r from-cyan-500 to-blue-500
                           hover:from-cyan-600 hover:to-blue-600
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40
                           flex items-center justify-center gap-2"
              >
                {step === "scripting" ? (
                  <Sparkles className="w-4 h-4 animate-spin-slow" />
                ) : (
                  <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
                {step === "scripting" ? "生成中…" : "生成旁白脚本"}
              </button>

              {/* 历史记录操作按钮 */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowHistory(true)}
                  className="py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  历史记录
                </button>
                <button
                  onClick={saveCurrentProject}
                  disabled={!projectName.trim() && script.length === 0}
                  className={`py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                    saveSuccess
                      ? 'text-emerald-600 bg-emerald-50'
                      : 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100'
                  }`}
                >
                  {saveSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saveSuccess ? '已保存' : '保存项目'}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={!projectName.trim() && script.length === 0}
                  className="py-2 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  清空
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="col-span-5 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-4 min-h-0">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ScriptPreview
                segments={script}
                onChange={setScript}
                loading={step === "scripting"}
                onGenerateSegment={handleGenerateSegment}
                generatingSegments={generatingSegments}
                canGenerate={canGenAudio}
                currentPlayingIndex={currentPlayingIndex}
              />
            </div>

            {/* Generate audio CTA */}
            {script.length > 0 && (
              <div className="pt-2 border-t border-slate-200/60 mt-auto">
                {!canGenAudio && (
                  <div className="flex items-center gap-2 text-amber-500 mb-2 px-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <p className="text-[11px] font-bold uppercase tracking-tight">请先在右侧上传参考说话人音频</p>
                  </div>
                )}
                {step === "synthesizing" ? (
                  <button
                    onClick={handleCancelGeneration}
                    className="w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-300
                               bg-gradient-to-r from-red-500 to-rose-500
                               hover:from-red-600 hover:to-rose-600
                               shadow-md shadow-red-500/20 hover:shadow-lg hover-shadow-red-500/40 animate-pulse
                               flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    取消生成
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAudio}
                    disabled={!canGenAudio}
                    className="group w-full py-3 rounded-xl text-sm text-white font-semibold transition-all duration-300
                               bg-gradient-to-r from-emerald-500 to-teal-500
                               hover:from-emerald-600 hover:to-teal-600
                               disabled:opacity-50 disabled:cursor-not-allowed
                               shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/40
                               flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 group-hover:scale-110 transition-transform fill-white" />
                    {segments.length > 0 && segments.length < script.length ? "继续合成语音" : "合成全部语音"}
                  </button>
                )}
              </div>
            )}

            {/* Error */}
            {step === "error" && error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{error}</p>
                  {(error.includes("全局设置") || error.includes("配置") || error.includes("URL")) && (
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="mt-2 text-[11px] font-bold underline text-red-700 hover:text-red-900"
                    >
                      ⚙️ 打开全局设置
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="col-span-4 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 p-4 space-y-4 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-4">
              <VoiceSettingsPanel value={voiceSettings} onChange={setVoiceSettings} />
              <AudioPlayer
                segments={segments}
                loading={step === "synthesizing" || (step === "error" && synthesisProgress.failed.length > 0)}
                projectName={projectName}
                synthesisProgress={synthesisProgress}
                onRetryFailed={handleRetryFailed}
                onPlayStateChange={(index, isPlaying) => setCurrentPlayingIndex(isPlaying ? index : null)}
                currentPlayingIndex={currentPlayingIndex}
              />
            </div>
          </div>
        </aside>

      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 保存成功提示 */}
      <div
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] transition-all duration-300 ${
          saveSuccess
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/30">
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <Check className="w-3 h-3" />
          </div>
          <span className="text-sm font-medium">项目已保存</span>
        </div>
      </div>

      {/* 历史记录弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[80vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-600" />
                <h3 className="font-semibold text-slate-800">项目历史记录</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={createNewProject}
                  className="px-3 py-1.5 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  新建项目
                </button>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无历史记录</p>
                  <p className="text-xs mt-1">生成的项目会自动保存到这里</p>
                </div>
              ) : (
                history.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => loadProject(project)}
                    className={`group p-3 rounded-xl border cursor-pointer transition-all ${
                      currentProjectId === project.id
                        ? "border-cyan-500 bg-cyan-50/50"
                        : "border-slate-200 hover:border-cyan-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-slate-800 truncate">{project.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(project.updatedAt).toLocaleString('zh-CN')}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                          <span>{project.script.length} 段脚本</span>
                          <span>{project.segments.length} 段音频</span>
                          <span>{project.images.length} 张图片</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {currentProjectId === project.id && (
                          <span className="text-[10px] font-medium text-cyan-600 bg-cyan-100 px-1.5 py-0.5 rounded">
                            当前
                          </span>
                        )}
                        <button
                          onClick={(e) => deleteProject(project.id, e)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
