import { useState, useEffect } from "react";
import { XCircle, Plus, Trash2, Edit2, Upload, Download, Save, Music, Hash, Type } from "lucide-react";
import { CustomEmotion, EmotionMode, getSettings } from "@/lib/api";
import { useNotification } from "@/lib/NotificationContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEmotionsChanged?: (emotions: CustomEmotion[]) => void;
}

const DEFAULT_EMOTION: CustomEmotion = {
  id: "",
  name: "新情感预设",
  mode: "text",
  alpha: 1.0,
  text: "",
  vector: [0, 0, 0, 0, 0, 0, 0, 0],
};

const EMOTION_KEYS = ["happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"];
const EMOTION_LABELS = ["开心", "愤怒", "悲伤", "恐惧", "厌恶", "忧郁", "惊讶", "平静"];

export default function EmotionLibrary({ isOpen, onClose, onEmotionsChanged }: Props) {
  const { showConfirm, showToast } = useNotification();
  const [emotions, setEmotions] = useState<CustomEmotion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CustomEmotion>(DEFAULT_EMOTION);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRegexMode, setIsRegexMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const settings = getSettings();
      setEmotions(settings.customEmotions || []);
      setEditingId(null);
      setShowImport(false);
      setSearchQuery("");
      setSelectedIds([]);
      setIsRegexMode(false);
    }
  }, [isOpen]);

  const saveToStorage = (newEmotions: CustomEmotion[]) => {
    setEmotions(newEmotions);
    const settings = getSettings();
    settings.customEmotions = newEmotions;
    localStorage.setItem("javis_studio_settings", JSON.stringify(settings));
    if (onEmotionsChanged) onEmotionsChanged(newEmotions);
  };

  const handleAddNew = () => {
    const newEmo: CustomEmotion = {
      ...DEFAULT_EMOTION,
      id: Date.now().toString(36),
    };
    setEditingId(newEmo.id);
    setEditForm(newEmo);
  };

  const handleEdit = (emo: CustomEmotion) => {
    setEditingId(emo.id);
    setEditForm(emo);
  };

  const handleSaveEdit = () => {
    if (!editForm.name.trim()) {
      showToast("情感名称不能为空", "error");
      return;
    }
    
    const newEmotions = [...emotions];
    const exists = newEmotions.findIndex(e => e.id === editForm.id);
    if (exists >= 0) {
      newEmotions[exists] = editForm;
    } else {
      newEmotions.push(editForm);
    }
    
    saveToStorage(newEmotions);
    setEditingId(null);
    showToast("保存成功", "success");
  };

  const handleDelete = (id: string) => {
    showConfirm({
      title: "删除预设",
      message: "确定要删除此情感预设吗？",
      onConfirm: () => {
        saveToStorage(emotions.filter(e => e.id !== id));
        if (editingId === id) setEditingId(null);
        setSelectedIds(prev => prev.filter(item => item !== id));
        showToast("已删除", "success");
      }
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    showConfirm({
      title: "批量删除预设",
      message: `确定要删除选中的 ${selectedIds.length} 个情感预设吗？此操作无法撤销。`,
      onConfirm: () => {
        const remaining = emotions.filter(e => !selectedIds.includes(e.id));
        saveToStorage(remaining);
        if (editingId && selectedIds.includes(editingId)) {
          setEditingId(null);
        }
        setSelectedIds([]);
        showToast(`已批量删除 ${selectedIds.length} 个预设`, "success");
      }
    });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) {
        throw new Error("格式错误，需为 JSON 数组");
      }
      
      const validated: CustomEmotion[] = parsed.map((item: any) => ({
        id: item.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
        name: item.name || "未命名",
        mode: item.mode || "text",
        alpha: typeof item.alpha === 'number' ? item.alpha : 1.0,
        text: item.text || "",
        vector: Array.isArray(item.vector) && item.vector.length === 8 ? item.vector : [0,0,0,0,0,0,0,0],
      }));

      const newEmotions = [...emotions, ...validated];
      saveToStorage(newEmotions);
      setShowImport(false);
      setImportText("");
      showToast(`成功导入 ${validated.length} 个预设`, "success");
    } catch (err: any) {
      showToast(`导入失败: ${err.message}`, "error");
    }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(emotions, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = "emotion_presets.json";
    a.click();
    showToast("已导出 JSON 文件", "success");
  };

  // 验证正则表达式合法性
  const isRegexValid = (() => {
    if (!isRegexMode || !searchQuery) return true;
    try {
      new RegExp(searchQuery);
      return true;
    } catch (e) {
      return false;
    }
  })();

  // 过滤后的情感预设列表
  const filteredEmotions = (() => {
    if (!searchQuery) return emotions;
    if (isRegexMode) {
      if (!isRegexValid) return [];
      try {
        const regex = new RegExp(searchQuery, "i");
        return emotions.filter(
          (emo) => regex.test(emo.name) || regex.test(emo.text || "")
        );
      } catch (e) {
        return [];
      }
    } else {
      const query = searchQuery.toLowerCase();
      return emotions.filter(
        (emo) =>
          emo.name.toLowerCase().includes(query) ||
          (emo.text || "").toLowerCase().includes(query)
      );
    }
  })();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">自定义情感预设库</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-lg transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar: List */}
          <div className="w-1/3 border-r border-slate-100 flex flex-col bg-slate-50/30">
            <div className="p-3 border-b border-slate-100 flex gap-2">
              <button 
                onClick={handleAddNew}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                新建预设
              </button>
              <button 
                onClick={() => setShowImport(true)}
                className="p-2 text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-sm transition-colors"
                title="批量导入 JSON"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button 
                onClick={handleExport}
                className="p-2 text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-sm transition-colors"
                title="批量导出 JSON"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            {/* Search Input */}
            <div className="px-3 py-2 border-b border-slate-100/80 bg-slate-50/50 flex flex-col gap-1.5">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder={isRegexMode ? "用正则表达式搜索..." : "搜索预设..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full text-xs pl-2.5 pr-10 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 bg-white placeholder-slate-400 font-medium transition-all ${
                    !isRegexValid ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-indigo-500'
                  }`}
                />
                <button
                  onClick={() => setIsRegexMode(!isRegexMode)}
                  className={`absolute right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
                    isRegexMode
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm'
                      : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                  title="正则表达式模式 (.*)"
                >
                  .*
                </button>
              </div>
              {!isRegexValid && (
                <p className="text-[10px] text-red-500 font-semibold px-1">
                  正则表达式语法错误
                </p>
              )}
            </div>

            {/* Batch Action Bar */}
            {filteredEmotions.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500 font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filteredEmotions.length > 0 && filteredEmotions.every((emo) => selectedIds.includes(emo.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const newSelected = Array.from(new Set([...selectedIds, ...filteredEmotions.map(emo => emo.id)]));
                        setSelectedIds(newSelected);
                      } else {
                        const filteredIds = filteredEmotions.map(emo => emo.id);
                        setSelectedIds(selectedIds.filter(id => !filteredIds.includes(id)));
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 accent-indigo-500"
                  />
                  <span>全选 {filteredEmotions.length} 项</span>
                </label>

                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                    <span className="text-indigo-600 font-bold">已选 {selectedIds.length} 项</span>
                    <button
                      onClick={handleBatchDelete}
                      className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-md transition-all font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scroll">
              {(() => {
                if (filteredEmotions.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      {searchQuery ? "无匹配的预设" : "暂无自定义情感，请新建或导入"}
                    </div>
                  );
                }

                return filteredEmotions.map(emo => {
                  const isChecked = selectedIds.includes(emo.id);
                  return (
                    <div 
                      key={emo.id}
                      onClick={() => handleEdit(emo)}
                      className={`group p-3 rounded-xl border cursor-pointer transition-all flex gap-2.5 items-start ${
                        editingId === emo.id 
                          ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                          : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                      }`}
                    >
                      {/* Checkbox */}
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isChecked) {
                            setSelectedIds(selectedIds.filter(id => id !== emo.id));
                          } else {
                            setSelectedIds([...selectedIds, emo.id]);
                          }
                        }}
                        className="pt-0.5 flex items-center justify-center cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                          <h4 className="font-bold text-slate-800 text-sm truncate">{emo.name}</h4>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(emo.id); }}
                            className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-mono tracking-tighter">
                            {emo.mode}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100/50 text-indigo-500 rounded uppercase font-mono tracking-tighter">
                            a={emo.alpha.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Area: Editor or Importer */}
          <div className="flex-1 overflow-y-auto bg-white custom-scroll relative">
            {showImport ? (
              <div className="p-8 max-w-2xl mx-auto flex flex-col h-full animate-in fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800">批量导入 JSON 数组</h3>
                  <button onClick={() => setShowImport(false)} className="text-sm text-slate-500 hover:text-slate-800">取消导入</button>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  格式示例: <br/>
                  <code className="block mt-2 p-3 bg-slate-50 rounded-lg text-slate-700 font-mono text-[11px] whitespace-pre-wrap border border-slate-100">
                    {`[\n  {\n    "name": "激昂演讲",\n    "mode": "text",\n    "alpha": 1.5,\n    "text": "充满激情，声音洪亮"\n  }\n]`}
                  </code>
                </p>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder="粘贴 JSON 数组..."
                  className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-mono focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none transition-all"
                />
                <button
                  onClick={handleImport}
                  className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors"
                >
                  确认导入
                </button>
              </div>
            ) : editingId ? (
              <div className="p-8 max-w-2xl mx-auto space-y-6 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-800">编辑情感预设</h3>
                  <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors">
                    <Save className="w-4 h-4" />
                    保存修改
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">预设名称 <span className="text-red-400">*</span></label>
                    <input 
                      type="text" 
                      value={editForm.name}
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      placeholder="e.g. 悲伤故事 / 悬疑解密"
                      className="w-full text-base font-bold text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-2 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">控制模式</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEditForm({...editForm, mode: "text"})}
                        className={`px-4 py-3 border-2 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all ${editForm.mode === "text" ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                      >
                        <Type className="w-4 h-4" />
                        文本描述控制
                      </button>
                      <button
                        onClick={() => setEditForm({...editForm, mode: "vector"})}
                        className={`px-4 py-3 border-2 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all ${editForm.mode === "vector" ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                      >
                        <Hash className="w-4 h-4" />
                        8维向量控制
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      <span>情感强度 (Alpha)</span>
                      <span className="text-indigo-500">{editForm.alpha.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min={0} max={2} step={0.05}
                      value={editForm.alpha}
                      onChange={e => setEditForm({...editForm, alpha: parseFloat(e.target.value)})}
                      className="w-full accent-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">推荐 0.5 - 1.5 之间，数值越大情感波动越剧烈</p>
                  </div>

                  {editForm.mode === "text" && (
                    <div className="animate-in slide-in-from-top-2 fade-in">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">情感文本描述</label>
                      <textarea 
                        value={editForm.text || ""}
                        onChange={e => setEditForm({...editForm, text: e.target.value})}
                        placeholder="例如: 声音低沉，充满忧伤与无奈..."
                        rows={3}
                        className="w-full text-sm leading-relaxed text-slate-800 bg-white border-2 border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-3 outline-none resize-none transition-all"
                      />
                    </div>
                  )}

                  {editForm.mode === "vector" && (
                    <div className="animate-in slide-in-from-top-2 fade-in space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">8维向量微调</label>
                      {EMOTION_LABELS.map((label, i) => {
                        const vec = editForm.vector || [0,0,0,0,0,0,0,0];
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-12 text-right font-medium">{label}</span>
                            <input
                              type="range" min={0} max={1} step={0.05}
                              value={vec[i]}
                              onChange={(e) => {
                                const next = [...vec];
                                next[i] = parseFloat(e.target.value);
                                setEditForm({...editForm, vector: next});
                              }}
                              className={`flex-1 accent-indigo-500`}
                            />
                            <span className="text-xs font-mono w-8 text-right text-indigo-600">
                              {vec[i].toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Music className="w-16 h-16 opacity-20 mb-4" />
                <p>在左侧选择或新建一个情感预设开始编辑</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
