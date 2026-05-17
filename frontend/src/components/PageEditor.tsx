import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  ProjectPage, 
  AudioClip 
} from "@/lib/api";
import { 
  Plus, Trash2, Maximize2, Minimize2, Image as ImageIcon, 
  Wand2, Hash, Smile, Clock, Volume2, Loader2, ChevronDown, 
  LayoutList, X, Scissors, Eraser, ZoomIn, RefreshCw
} from "lucide-react";
import { useNotification } from "@/lib/NotificationContext";

const EMOTION_COLORS: Record<string, string> = {
  happy: "bg-yellow-50 text-yellow-700 border-yellow-200",
  calm: "bg-blue-50 text-blue-700 border-blue-200",
  sad: "bg-indigo-50 text-indigo-700 border-indigo-200",
  angry: "bg-red-50 text-red-700 border-red-200",
  surprised: "bg-pink-50 text-pink-700 border-pink-200",
  afraid: "bg-orange-50 text-orange-700 border-orange-200",
  disgusted: "bg-green-50 text-green-700 border-green-200",
  melancholic: "bg-purple-50 text-purple-700 border-purple-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

interface Props {
  page: ProjectPage;
  onChange: (page: ProjectPage) => void;
  onGenerateAI?: () => Promise<void>;
  isGeneratingAI?: boolean;
  onGenerateAudio?: (clipId: string) => Promise<any>;
  generatingAudioIds?: string[];
  currentPlayingClipId?: string | null;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export default function PageEditor({ 
  page, 
  onChange, 
  onGenerateAI, 
  isGeneratingAI,
  onGenerateAudio,
  generatingAudioIds = [],
  currentPlayingClipId
}: Props) {
  const { showConfirm, showToast } = useNotification();
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<"ai" | "split" | null>(null);
  const [splitLimit, setSplitLimit] = useState<number>(100);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const updateTitle = (val: string) => onChange({ ...page, title: val });

  const updateClips = (newClips: AudioClip[]) => onChange({ ...page, clips: newClips });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      onChange({ ...page, image: base64 });
    } catch (err) {
      console.error("Failed to read file", err);
    }
  };

  const addClip = () => {
    const newClip: AudioClip = { id: generateId(), text: "", emotion_hint: "neutral" };
    updateClips([...page.clips, newClip]);
  };

  const clearPage = () => {
    showConfirm({
      title: "清空本页",
      message: "确定要清空本页的所有旁白片段吗？此操作不可恢复。",
      onConfirm: () => {
        updateClips([{ id: generateId(), text: "", emotion_hint: "neutral" }]);
        if (showToast) showToast("本页已清空", "success");
      }
    });
  };

  const insertClipAfter = (idx: number) => {
    const newClip: AudioClip = { id: generateId(), text: "", emotion_hint: "neutral" };
    const newClips = [...page.clips];
    newClips.splice(idx + 1, 0, newClip);
    updateClips(newClips);
  };

  const removeClip = (id: string) => {
    if (page.clips.length <= 1) return;
    updateClips(page.clips.filter(c => c.id !== id));
  };

  const updateClipText = (id: string, text: string) => {
    updateClips(page.clips.map(c => c.id === id ? { ...c, text } : c));
  };

  const updateClipEmotion = (id: string, emotion: string) => {
    updateClips(page.clips.map(c => c.id === id ? { ...c, emotion_hint: emotion } : c));
  };

  const handleUnifyEmotion = (emotion: string) => {
    showConfirm({
      title: "统一更改情绪",
      message: `确定要将本页所有旁白片段的情绪都更改为 "${emotion.toUpperCase()}" 吗？`,
      onConfirm: () => {
        updateClips(page.clips.map(c => ({ ...c, emotion_hint: emotion })));
        if (showToast) showToast(`已将所有情绪统一更改为 ${emotion.toUpperCase()}`, "success");
      }
    });
  };

  const mergeWithNext = (idx: number) => {
    if (idx >= page.clips.length - 1) return;
    const curr = page.clips[idx];
    const next = page.clips[idx + 1];
    
    showConfirm({
      title: "合并片段",
      message: "确认将下一段文字合并到当前段落中吗？",
      onConfirm: () => {
        const newClips = [...page.clips];
        newClips[idx] = { ...curr, text: (curr.text + "\n\n" + next.text).trim() };
        newClips.splice(idx + 1, 1);
        updateClips(newClips);
      }
    });
  };

  const executeSmartSplit = () => {
    const fullText = page.clips.map(c => c.text).join('\n\n').trim();
    if (fullText.length < 10) {
      if (showToast) showToast("当前页面文本过短，无需拆分", "info");
      setActiveConfig(null);
      return;
    }
    
    if (isNaN(splitLimit) || splitLimit < 10) {
      if (showToast) showToast("请输入有效的字数限制 (大于10)", "error");
      return;
    }
    
    // Smart split logic: split by punctuation and then enforce length limit
    const splitText = (text: string, maxLen: number): string[] => {
      const segments: string[] = [];
      let currentSegment = "";
      const sentences = text.match(/[^。！？.!?\n]+[。！？.!?\n]*/g) || [text];
      
      for (const sentence of sentences) {
        if (currentSegment.length + sentence.length <= maxLen) {
          currentSegment += sentence;
        } else {
          if (currentSegment.trim()) segments.push(currentSegment.trim());
          if (sentence.length > maxLen) {
             let remaining = sentence;
             while(remaining.length > 0) {
                segments.push(remaining.slice(0, maxLen).trim());
                remaining = remaining.slice(maxLen);
             }
             currentSegment = "";
          } else {
             currentSegment = sentence;
          }
        }
      }
      if (currentSegment.trim()) segments.push(currentSegment.trim());
      return segments;
    };

    const chunks = splitText(fullText, splitLimit);
    if (chunks.length <= 1 && page.clips.length === 1) {
      if (showToast) showToast("在当前字数限制下，无需拆分", "info");
      setActiveConfig(null);
      return;
    }
    
    const generatedClips = chunks.map((chunk, i) => ({
      id: generateId() + `_split_${i}`,
      text: chunk,
      emotion_hint: page.clips[0]?.emotion_hint || "neutral"
    }));
    
    updateClips(generatedClips);
    setActiveConfig(null);
    if (showToast) showToast(`已重新拆分为 ${chunks.length} 段`, "success");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* 头部信息 */}
      <div className="p-5 border-b border-slate-200 bg-white shadow-sm z-10 flex gap-5 items-center">
        {/* PPT 页面截图上传/预览区 */}
        <div className="group relative w-48 aspect-video bg-slate-50 hover:bg-slate-100 rounded-xl overflow-hidden border-2 border-dashed border-slate-200 hover:border-cyan-400 flex items-center justify-center flex-shrink-0 transition-all shadow-sm">
          {page.image ? (
            <>
              <img src={page.image} alt="Slide Preview" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(page.image || null)} />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 pointer-events-none">
                <div className="flex gap-2 pointer-events-auto">
                  <button onClick={() => setPreviewImage(page.image || null)} className="p-2 bg-white/20 hover:bg-white/40 rounded-lg text-white backdrop-blur-sm transition-colors" title="全屏预览">
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <label className="p-2 bg-white/20 hover:bg-white/40 rounded-lg text-white backdrop-blur-sm cursor-pointer transition-colors" title="更换截图">
                    <RefreshCw className="w-4 h-4" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <label className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-cyan-500 cursor-pointer transition-colors">
              <ImageIcon className="w-8 h-8" />
              <span className="text-[11px] font-medium">点击上传 PPT 截图</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          )}
        </div>

        <div className="flex-1 flex flex-col h-full py-1">
          <input
            type="text"
            value={page.title || ""}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder={`第 ${page.pageIndex + 1} 页备注 / 标题`}
            className="text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-cyan-400 outline-none px-2 py-1 text-slate-800 placeholder-slate-300 transition-colors mb-4"
          />
          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => setActiveConfig(activeConfig === "ai" ? null : "ai")}
              disabled={isGeneratingAI}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                activeConfig === "ai" ? "bg-indigo-100 text-indigo-700" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
              }`}
            >
              {isGeneratingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              AI 智能生成旁白
            </button>
            <button
              onClick={() => setActiveConfig(activeConfig === "split" ? null : "split")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeConfig === "split" ? "bg-orange-100 text-orange-700" : "bg-orange-50 text-orange-600 hover:bg-orange-100"
              }`}
              title="根据字数限制将本页文本拆分为多段"
            >
              <Scissors className="w-3.5 h-3.5" />
              智能分段
            </button>
            <button
              onClick={addClip}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加旁白片段
            </button>
            <div className="relative flex items-center bg-cyan-50 border border-cyan-100 hover:bg-cyan-100/80 rounded-lg px-2.5 py-1.5 transition-colors gap-1.5">
              <Smile className="w-3.5 h-3.5 text-cyan-600" />
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleUnifyEmotion(e.target.value);
                    e.target.value = ""; // Reset selection after action
                  }
                }}
                className="appearance-none text-xs font-bold text-cyan-700 bg-transparent outline-none pr-5 cursor-pointer"
              >
                <option value="" disabled>统一更改所有情绪...</option>
                {Object.keys(EMOTION_COLORS).map(k => (
                  <option key={k} value={k} className="bg-white text-slate-700">{k.toUpperCase()}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-cyan-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <button
              onClick={clearPage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors ml-auto"
              title="清空本页所有旁白"
            >
              <Eraser className="w-3.5 h-3.5" />
              清空
            </button>
          </div>
        </div>
      </div>

      {/* Inline Configuration Areas */}
      {activeConfig === "split" && (
        <div className="bg-orange-50/80 border-b border-orange-100 p-4 flex items-center justify-between animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Scissors className="w-4 h-4" /></div>
            <div>
              <h4 className="text-sm font-bold text-orange-900">配置智能分段</h4>
              <p className="text-xs text-orange-700/80 mt-0.5">自动根据标点符号拆分当前页面的所有长段落。</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-orange-800">单段最大字数：</label>
              <input 
                type="number" 
                value={splitLimit} 
                onChange={(e) => setSplitLimit(Number(e.target.value))} 
                className="w-20 px-2 py-1.5 text-sm font-mono font-bold text-orange-900 bg-white border border-orange-200 rounded-lg outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200 transition-all"
                min="10"
                max="1000"
              />
            </div>
            <div className="w-px h-6 bg-orange-200" />
            <button onClick={() => setActiveConfig(null)} className="px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 rounded-lg transition-colors">取消</button>
            <button onClick={executeSmartSplit} className="px-4 py-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-sm shadow-orange-500/20 rounded-lg transition-colors">确认拆分</button>
          </div>
        </div>
      )}

      {activeConfig === "ai" && (
        <div className="bg-indigo-50/80 border-b border-indigo-100 p-4 flex items-center justify-between animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Wand2 className="w-4 h-4" /></div>
            <div>
              <h4 className="text-sm font-bold text-indigo-900">AI 智能生成</h4>
              <p className="text-xs text-indigo-700/80 mt-0.5">根据页面截图和提示词自动编写旁白脚本。</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-1 max-w-lg ml-8">
            <div className="flex-1 flex items-center gap-2">
              <input 
                type="text" 
                value={aiPrompt} 
                onChange={(e) => setAiPrompt(e.target.value)} 
                placeholder="附加提示词 (可选)..."
                className="w-full px-3 py-1.5 text-sm text-indigo-900 placeholder-indigo-300 bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 transition-all"
              />
            </div>
            <div className="w-px h-6 bg-indigo-200" />
            <button onClick={() => setActiveConfig(null)} className="px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors">取消</button>
            <button 
              onClick={() => {
                setActiveConfig(null);
                if (onGenerateAI) onGenerateAI(); // Note: we'd ideally pass aiPrompt here if the API supported it
              }} 
              disabled={isGeneratingAI}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm shadow-indigo-500/20 rounded-lg transition-colors disabled:opacity-50"
            >
              开始生成
            </button>
          </div>
        </div>
      )}

      {/* 片段列表 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
        {page.clips.map((clip, idx) => {
          const isExpanded = expandedClipId === clip.id;
          const isPlaying = currentPlayingClipId === clip.id;
          const colorClass = EMOTION_COLORS[clip.emotion_hint?.toLowerCase() || "neutral"] || EMOTION_COLORS.neutral;

          return (
            <div
              key={clip.id}
              className={`group relative rounded-2xl backdrop-blur-md border shadow-sm hover:shadow-lg py-4 px-6 space-y-3 transition-all duration-300 ${
                isPlaying 
                  ? 'bg-cyan-50/60 border-cyan-300 ring-2 ring-cyan-200 shadow-lg scale-[1.02] z-10' 
                  : 'bg-white/60 border-slate-200 hover:border-cyan-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                  isPlaying ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Hash className="w-3 h-3" />
                  {idx + 1}
                </div>
                
                {/* 情绪统一在选项卡右侧下拉菜单选择，此处不重复显示 */}

                <span className="text-[10px] text-slate-400 ml-2">
                  {clip.text.length} 字
                </span>

                <div className="ml-auto flex items-center gap-1">
                  {onGenerateAudio && (
                    <button
                      onClick={() => onGenerateAudio(clip.id)}
                      disabled={generatingAudioIds.includes(clip.id) || !clip.text.trim()}
                      className={`p-1.5 rounded-lg transition-all ${
                        generatingAudioIds.includes(clip.id)
                          ? 'text-cyan-600 bg-cyan-100'
                          : 'text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 opacity-60 hover:opacity-100 bg-slate-100 hover:shadow-sm'
                      }`}
                      title="为此片段生成音频"
                    >
                      {generatingAudioIds.includes(clip.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  
                  <button
                    onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 opacity-60 hover:opacity-100 transition-all hover:shadow-sm bg-slate-100"
                    title={isExpanded ? "收起" : "展开"}
                  >
                    {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  
                  <button
                    onClick={() => insertClipAfter(idx)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 opacity-60 hover:opacity-100 transition-all hover:shadow-sm bg-slate-100"
                    title="在下方插入"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  {idx < page.clips.length - 1 && (
                    <button
                      onClick={() => mergeWithNext(idx)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 opacity-60 hover:opacity-100 transition-all hover:shadow-sm bg-slate-100"
                      title="与下一段合并"
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div className="relative ml-2">
                    <select
                      value={clip.emotion_hint || "neutral"}
                      onChange={(e) => updateClipEmotion(clip.id, e.target.value)}
                      className={`appearance-none text-[11px] font-bold border rounded-full pl-3 pr-7 py-1 outline-none focus:ring-2 focus:ring-cyan-500/20 cursor-pointer transition-colors ${colorClass}`}
                    >
                      {Object.keys(EMOTION_COLORS).map(k => (
                        <option key={k} value={k} className="bg-white text-slate-700">
                          {k.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-current absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                  </div>

                  <button
                    onClick={() => removeClip(clip.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-60 hover:opacity-100 transition-all ml-1 hover:shadow-sm"
                    title="删除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <textarea
                value={clip.text}
                onChange={(e) => updateClipText(clip.id, e.target.value)}
                rows={isExpanded ? 14 : 6}
                placeholder="输入旁白内容..."
                className="w-full bg-white/50 hover:bg-white focus:bg-white border-2 border-transparent hover:border-cyan-100 focus:border-cyan-300 rounded-xl py-3 px-4 text-sm text-slate-800 outline-none resize-none transition-all custom-scroll shadow-inner"
              />
            </div>
          );
        })}
        
        {page.clips.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <p>本页没有旁白片段</p>
            <button
              onClick={addClip}
              className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:text-cyan-600 hover:border-cyan-300 transition-all"
            >
              + 添加第一个片段
            </button>
          </div>
        )}
      </div>

      {/* Image Preview Modal (Portaled to body to avoid clipping by parent stacking contexts) */}
      {previewImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <img 
            src={previewImage} 
            alt="Preview Fullscreen" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/20" 
          />
          <button 
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
            onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
