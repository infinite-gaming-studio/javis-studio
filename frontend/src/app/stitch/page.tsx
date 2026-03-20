"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";
import { getSettings } from "@/lib/api";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

import { 
  Layers, 
  MonitorPlay, 
  Database, 
  Search, 
  Filter, 
  Plus, 
  Play, 
  Pause, 
  Settings, 
  Download, 
  Trash2, 
  Eye, 
  BarChart3, 
  LineChart, 
  PieChart, 
  Activity, 
  Globe, 
  LayoutGrid,
  Zap,
  SlidersHorizontal,
  Loader2,
  Sparkles,
  Send,
  ImagePlus,
  X,
  MessageSquare
} from "lucide-react";

type Tab = "hub" | "studio";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
}

interface EffectItem {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  thumbnailGradient: string;
  echartsOption?: any; // The generated ECharts options
  chatHistory?: ChatMessage[];
}

const CATEGORIES = ["全部", "金融展示", "地理分布", "趋势动态", "占比排名", "AI 生成"];

const INITIAL_MOCK_EFFECTS: EffectItem[] = [
  {
    id: "eff-01",
    title: "动态折线趋势图",
    category: "趋势动态",
    description: "适用于展示时间序列数据的增长与波动变化。",
    icon: <LineChart className="w-5 h-5" />,
    color: "text-blue-500",
    thumbnailGradient: "from-blue-500/20 to-cyan-500/20 border-cyan-200/50",
    echartsOption: {
      backgroundColor: "transparent",
      animationDuration: 3000,
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], axisLine: { lineStyle: { color: "#fff" }} },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" }}, axisLine: { lineStyle: { color: "#fff" }} },
      series: [{ data: [150, 230, 224, 218, 135, 147, 260], type: 'line', smooth: true, lineStyle: { width: 4, color: '#06b6d4' }, areaStyle: { color: '#06b6d4', opacity: 0.3 } }]
    }
  },
  {
    id: "eff-02",
    title: "3D 立体柱状图",
    category: "金融展示",
    description: "多维度的业绩数据比较，带有炫酷的光影效果。",
    icon: <BarChart3 className="w-5 h-5" />,
    color: "text-fuchsia-500",
    thumbnailGradient: "from-fuchsia-500/20 to-purple-500/20 border-purple-200/50",
    echartsOption: {
      backgroundColor: "transparent",
      animationDuration: 2000,
      xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'], axisLine: { lineStyle: { color: "#fff" }} },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" }}, axisLine: { lineStyle: { color: "#fff" }} },
      series: [{ data: [120, 200, 150, 80], type: 'bar', itemStyle: { color: '#d946ef', borderRadius: [4, 4, 0, 0] } }]
    }
  },
  {
    id: "eff-06",
    title: "中空环形进度圈",
    category: "占比排名",
    description: "展示目标完成率或多参数占用比的光效环状图。",
    icon: <PieChart className="w-5 h-5" />,
    color: "text-indigo-500",
    thumbnailGradient: "from-indigo-500/20 to-blue-500/20 border-blue-200/50",
    echartsOption: {
      backgroundColor: "transparent",
      animationDurationUpdate: 2000,
      series: [
        {
          name: 'Access From',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#0f172a', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 40, fontWeight: 'bold', color: '#fff' } },
          labelLine: { show: false },
          data: [
            { value: 1048, name: 'Search Engine', itemStyle: { color: '#6366f1' } },
            { value: 735, name: 'Direct', itemStyle: { color: '#8b5cf6' } },
            { value: 580, name: 'Email', itemStyle: { color: '#ec4899' } }
          ]
        }
      ]
    }
  },
];

// Icon mapping for persistence
const ICON_MAP: Record<string, React.ReactNode> = {
  "LineChart": <LineChart className="w-5 h-5" />,
  "BarChart3": <BarChart3 className="w-5 h-5" />,
  "PieChart": <PieChart className="w-5 h-5" />,
  "Sparkles": <Sparkles className="w-5 h-5" />
};

const getIconName = (icon: React.ReactNode): string => {
  if (!icon || !('type' in (icon as any))) return "Sparkles";
  const type = (icon as any).type?.name || (icon as any).type?.displayName;
  return type || "Sparkles";
};

export default function StitchStudioPage() {
  const [activeTab, setActiveTab] = useState<Tab>("hub");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Hub States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [effectsPool, setEffectsPool] = useState<EffectItem[]>(INITIAL_MOCK_EFFECTS);
  
  // AI Generate States
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [studioItems, setStudioItems] = useState<EffectItem[]>([]);
  const [selectedStudioItemId, setSelectedStudioItemId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Persistence Loading Effect
  useEffect(() => {
    const savedPool = localStorage.getItem("stitch_effects_pool");
    const savedStudio = localStorage.getItem("stitch_studio_items");

    if (savedPool) {
      try {
        const parsed = JSON.parse(savedPool);
        const mapped = parsed.map((item: any) => ({
          ...item,
          icon: ICON_MAP[item.iconName] || <Sparkles className="w-5 h-5" />
        }));
        setEffectsPool(mapped);
      } catch (e) { console.error("Failed to load effects pool", e); }
    }

    if (savedStudio) {
      try {
        const parsed = JSON.parse(savedStudio);
        const mapped = parsed.map((item: any) => ({
          ...item,
          icon: ICON_MAP[item.iconName] || <Sparkles className="w-5 h-5" />
        }));
        setStudioItems(mapped);
      } catch (e) { console.error("Failed to load studio items", e); }
    }
  }, []);

  // Persistence Saving Effects
  useEffect(() => {
    const toSave = effectsPool.map(item => ({
      ...item,
      icon: null, // Don't serialize React node
      iconName: getIconName(item.icon)
    }));
    localStorage.setItem("stitch_effects_pool", JSON.stringify(toSave));
  }, [effectsPool]);

  useEffect(() => {
    const toSave = studioItems.map(item => ({
      ...item,
      icon: null,
      iconName: getIconName(item.icon)
    }));
    localStorage.setItem("stitch_studio_items", JSON.stringify(toSave));
  }, [studioItems]);

  // Chat States
  const [chatInput, setChatInput] = useState("");
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const echartsRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const filteredEffects = effectsPool.filter(effect => {
    const matchesSearch = effect.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "全部" || effect.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddToStudio = (item: EffectItem) => {
    const newItem = { ...item, id: `${item.id}-${Date.now()}` };
    setStudioItems(prev => [...prev, newItem]);
    setSelectedStudioItemId(newItem.id);
    setActiveTab("studio");
  };

  const handleRemoveFromStudio = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStudioItems(prev => prev.filter(item => item.id !== id));
    if (selectedStudioItemId === id) setSelectedStudioItemId(null);
  };

  const selectedItem = studioItems.find(item => item.id === selectedStudioItemId);

  // AI Generation Function
  const handleGenerateAI = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);

    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/stitch/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-llm-url": settings.llmApiUrl || "",
          "x-llm-token": settings.llmToken || "",
          "x-llm-model": settings.llmModel || ""
        },
        body: JSON.stringify({ prompt: aiPrompt })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "生成失败");
      }

      let parsedOption;
      try {
        const optionStr = data.optionString || "";
        if (!optionStr.trim()) {
           throw new Error("AI 生成的配置为空。");
        }
        
        const evalFn = new Function("echarts", "return " + optionStr);
        parsedOption = evalFn(echarts);
        
        if (!parsedOption || typeof parsedOption !== 'object') {
          throw new Error("AI 生成的配置不是有效的对象。");
        }
        
        if (!parsedOption.backgroundColor) parsedOption.backgroundColor = 'transparent';
      } catch (err) {
        throw new Error("解析生成的特效异常: " + String(err));
      }

      const newEffect: EffectItem = {
        id: `ai-eff-${Date.now()}`,
        title: `AI 分析: ${aiPrompt.substring(0, 10)}...`,
        category: "AI 生成",
        description: `根据 "${aiPrompt}" 自动生成的图表可视化。`,
        icon: <Sparkles className="w-5 h-5" />,
        color: "text-amber-400",
        thumbnailGradient: "from-amber-500/20 to-orange-500/20 border-orange-200/50",
        echartsOption: parsedOption
      };

      setEffectsPool([newEffect, ...effectsPool]);
      setAiPrompt("");
      alert("AI 特效生成成功！已加入图表库中。");

    } catch (e: any) {
      alert(`生成出错: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Chat Edit Handlers
  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setChatImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSendChat = async () => {
    if ((!chatInput.trim() && !chatImage) || isChatting || !selectedItem) return;
    
    setIsChatting(true);
    
    const newUserMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: chatInput,
      image: chatImage || undefined
    };

    const currentHistory = selectedItem.chatHistory || [];
    const updatedHistory = [...currentHistory, newUserMsg];
    
    // Optimistic update
    setStudioItems(prev => prev.map(item => 
      item.id === selectedItem.id 
        ? { ...item, chatHistory: updatedHistory } 
        : item
    ));

    const promptText = chatInput;
    const attachedImage = chatImage;
    
    setChatInput("");
    setChatImage(null);

    try {
      const settings = getSettings();
      const res = await fetch("/api/v1/tools/stitch/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-llm-url": settings.llmApiUrl || "",
          "x-llm-token": settings.llmToken || "",
          "x-llm-model": settings.llmModel || ""
        },
        body: JSON.stringify({
          messages: currentHistory,
          currentOption: selectedItem.echartsOption,
          prompt: promptText,
          image: attachedImage
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "请求失败");
      }

      let parsedOption;
      try {
        const optionStr = data.optionString || "";
        if (!optionStr.trim()) {
           throw new Error("AI 修改的配置为空。");
        }

        const evalFn = new Function("echarts", "return " + optionStr);
        parsedOption = evalFn(echarts);
        
        if (!parsedOption || typeof parsedOption !== 'object') {
          throw new Error("AI 修改后的配置不是有效的对象。");
        }
        
        if (!parsedOption.backgroundColor) parsedOption.backgroundColor = 'transparent';
      } catch (err) {
        throw new Error("解析生成的特效异常: " + String(err));
      }

      const newAsstMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: data.reply
      };

      setStudioItems(prev => prev.map(item => 
        item.id === selectedItem.id 
          ? { 
              ...item, 
              echartsOption: parsedOption,
              chatHistory: [...updatedHistory, newAsstMsg] 
            } 
          : item
      ));

    } catch (e: any) {
      alert(`编辑出错: ${e.message}`);
    } finally {
      setIsChatting(false);
    }
  };

  // Recording Functions
  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsPlaying(false);
      }
      return;
    }

    if (!echartsRef.current) return;
    
    // Get ECharts instance canvas
    const echartInstance = echartsRef.current.getEchartsInstance();
    const canvasElement = echartInstance.getDom().querySelector('canvas');

    if (!canvasElement) {
      alert("无法获取画布资源");
      return;
    }

    // Force animations to restart by re-setting the same option
    if (selectedItem?.echartsOption) {
       echartInstance.setOption(selectedItem.echartsOption, true);
    }

    try {
      // Small delay to ensure the canvas has cleared/restarted its animation before recording begins
      setTimeout(() => {
        // 60FPS stream
        const stream = canvasElement.captureStream(60); 
        
        let targetMimeType = 'video/webm; codecs=vp9';
        const mimeTypes = [
          'video/mp4',
          'video/webm;codecs=h264',
          'video/webm;codecs=vp9',
          'video/webm'
        ];
        
        for (const type of mimeTypes) {
           if (MediaRecorder.isTypeSupported(type)) {
             targetMimeType = type;
             break;
           }
        }
        
        const extension = targetMimeType.includes('mp4') ? 'mp4' : 'webm';

        const recorder = new MediaRecorder(stream, { mimeType: targetMimeType });
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
           if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
           const blob = new Blob(chunksRef.current, { type: targetMimeType });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `stitch-export-${Date.now()}.${extension}`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           alert("视频已合成并下载！");
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        setIsPlaying(true);
      }, 50); // slight delay to allow setOption to trigger frame update

    } catch (e) {
      console.error(e);
      alert("录制异常，您的浏览器可能不支持该画布录制API。");
      setIsRecording(false);
    }
  }, [selectedItem, isRecording]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900 flex flex-col">
      <GlobalHeader
        showStatus={false}
        status="idle"
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      {/* Decorative Background Blur Elements */}
      <div className="fixed top-20 left-10 w-96 h-96 bg-fuchsia-300/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-20 right-10 w-96 h-96 bg-cyan-300/20 rounded-full blur-[100px] pointer-events-none" />

      <main className="flex-1 flex flex-col px-6 py-4 max-w-screen-2xl mx-auto w-full relative z-10 overflow-hidden h-[calc(100vh-4rem)]">
        
        {/* Header Section */}
        <div className="flex flex-col gap-3 shrink-0 mb-4 animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/20 ring-1 ring-white/50">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                  Stitch 工作台
                </h1>
                <p className="text-sm text-slate-500 font-medium mt-0.5">
                  基于大模型的动态数据可视化特效与视频合成中心
                </p>
              </div>
            </div>

            {/* Custom Tabs */}
            <div className="flex bg-white/70 backdrop-blur-xl p-1.5 rounded-xl border border-white shadow-sm ring-1 ring-slate-100">
              <button
                onClick={() => setActiveTab("hub")}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  activeTab === "hub"
                    ? "bg-gradient-to-r from-fuchsia-50 to-pink-50 text-fuchsia-600 shadow-sm border border-fuchsia-100/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50 border border-transparent"
                }`}
              >
                <Database className={`w-4 h-4 ${activeTab === "hub" ? "text-fuchsia-500" : ""}`} />
                素材 Hub
              </button>
              <button
                onClick={() => setActiveTab("studio")}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  activeTab === "studio"
                    ? "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-600 shadow-sm border border-cyan-100/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50 border border-transparent"
                }`}
              >
                <MonitorPlay className={`w-4 h-4 ${activeTab === "studio" ? "text-cyan-500" : ""}`} />
                特效 Studio
                {studioItems.length > 0 && (
                  <span className="ml-1 flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-cyan-500 text-white rounded-full">
                    {studioItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative">
          
          {/* ======================= HUB TAB ======================= */}
          {activeTab === "hub" && (
            <div className="absolute inset-0 flex flex-row gap-6 animate-in fade-in zoom-in-95 duration-400">
              
              {/* Left Panel: AI Generator (1/3 width) */}
              <div className="w-1/3 min-w-[320px] max-w-[400px] bg-white/60 backdrop-blur-2xl rounded-3xl border border-white shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden">
                {/* Visual Header */}
                <div className="p-6 pb-5 bg-gradient-to-b from-amber-50/80 to-transparent border-b border-white/50 relative overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/40 rounded-full blur-[40px] -mr-10 -mt-10 pointer-events-none" />
                  <div className="relative flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/20 flex items-center justify-center shrink-0 border border-white/50">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base tracking-tight mb-0.5">AI 绘制数据图表</h3>
                      <p className="text-[11px] text-slate-500 font-medium">输入自然语言，自动生成交互渲染代码</p>
                    </div>
                  </div>
                </div>

                {/* Generator Body */}
                <div className="p-6 flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar relative z-10 w-full">
                  <div className="space-y-3 flex-1 flex flex-col w-full">
                    <label className="text-xs font-bold text-slate-600 flex items-center justify-between w-full">
                      <span>图表描述 (Prompt)</span>
                      <span className="bg-amber-100/80 text-amber-700 text-[10px] px-2.5 py-0.5 rounded-full border border-amber-200/50 font-semibold shadow-sm">
                        推荐详细描述
                      </span>
                    </label>
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleGenerateAI();
                        }
                      }}
                      placeholder='例如: "生成一个黑色酷炫风格的动态销售趋势折线图，展示过去五个季度的订单增长趋势..."'
                      className="w-full h-full flex-1 p-4 text-sm bg-white/80 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all shadow-inner resize-none custom-scrollbar placeholder:text-slate-400 leading-relaxed"
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100/80 shrink-0 w-full">
                    <button 
                      onClick={handleGenerateAI}
                      disabled={isGenerating || !aiPrompt.trim()}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400 text-white rounded-2xl font-bold shadow-lg shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 group relative overflow-hidden"
                    >
                      {/* Shine effect overlay using CSS border to fake shimmer if animations not setup */}
                      <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 pointer-events-none" />
                      
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                          <span className="relative z-10">AI 分析与绘图中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 group-hover:animate-pulse relative z-10" />
                          <span className="tracking-wide relative z-10">生成图表特效</span>
                        </>
                      )}
                    </button>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 font-medium">
                      <span>Shift + Enter 换行</span>
                      <span>Enter 快捷生成</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Hub Library (2/3 width) */}
              <div className="flex-1 bg-white/60 backdrop-blur-2xl rounded-3xl border border-white shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden min-h-0 relative">
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-200/20 rounded-full blur-[60px] pointer-events-none" />
                
                {/* Hub Toolbar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 lg:px-6 lg:py-5 border-b border-white/60 bg-white/40 gap-4 shrink-0 relative z-10">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 whitespace-nowrap ${
                          activeCategory === cat
                            ? "bg-slate-800 text-white shadow-md shadow-slate-800/20 scale-105"
                            : "bg-white/80 text-slate-500 border border-slate-200/80 hover:border-slate-300 hover:bg-white hover:text-slate-800"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative group shrink-0 w-full sm:w-auto">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-slate-400 group-focus-within:text-fuchsia-500 transition-colors" />
                    </div>
                    <input
                      type="text"
                      placeholder="搜索特效名称或关键词..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white/90 border border-slate-200/80 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-400 transition-all shadow-sm placeholder:text-slate-400 font-medium"
                    />
                  </div>
                </div>

                {/* Grid View */}
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-slate-50/30 custom-scrollbar relative z-10">
                  {filteredEffects.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 animate-in fade-in">
                      <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-5">
                        <Search className="w-10 h-10 text-slate-300" />
                      </div>
                      <p className="font-semibold text-slate-600 text-lg">未找到匹配的素材</p>
                      <p className="text-sm mt-2 font-medium">请尝试更换搜索词或选择 "全部" 分类</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max">
                      {filteredEffects.map((effect, idx) => (
                        <div 
                          key={effect.id} 
                          onClick={() => handleAddToStudio(effect)}
                          className="group bg-white rounded-2xl border border-white/80 shadow-sm hover:shadow-2xl hover:shadow-slate-300/40 hover:-translate-y-1.5 transition-all duration-300 overflow-hidden flex flex-col ring-1 ring-slate-100 cursor-pointer"
                        >
                          {/* Thumbnail Simulation */}
                          <div className={`h-44 bg-gradient-to-br ${effect.thumbnailGradient} relative flex items-center justify-center overflow-hidden`}>
                            {/* Decorative background grid */}
                            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgxOXYxOUgxek0wIDB2MjBoMjBWMHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=')] opacity-[0.2]" />
                            
                            <div className={`w-16 h-16 rounded-2xl bg-white shadow-xl shadow-slate-200/50 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-500 ease-out border border-white/50 ${effect.color}`}>
                              {effect.icon}
                            </div>
                            
                            {/* Hover Actions */}
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 backdrop-blur-sm">
                              {effect.echartsOption && (
                                <button className="p-3 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 border border-white/30" title="包含 AI 生成代码">
                                   <Zap className="w-5 h-5 fill-current" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleAddToStudio(effect)}
                                className="px-5 py-3 bg-fuchsia-500 hover:bg-fuchsia-600 active:bg-fuchsia-700 text-white rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-fuchsia-500/30 flex items-center gap-2 border border-fuchsia-400"
                              >
                                <Plus className="w-4 h-4" /> 加入 Studio
                              </button>
                            </div>
                          </div>

                          <div className="p-5 flex-1 flex flex-col bg-gradient-to-b from-white to-slate-50/50 border-t border-slate-50">
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <h3 className="font-bold text-slate-800 text-base leading-tight flex-1 group-hover:text-fuchsia-600 transition-colors">{effect.title}</h3>
                              <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white text-slate-600 border border-slate-200 whitespace-nowrap shadow-sm">
                                {effect.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium flex-1">
                              {effect.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================= STUDIO TAB ======================= */}
          {activeTab === "studio" && (
            <div className="absolute inset-0 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-400">
              
              {/* Top Row: Workspace */}
              <div className="flex-1 flex gap-4 min-h-0">
                
                {/* Left Panel: Layers */}
                <div className="w-72 bg-white/60 backdrop-blur-2xl rounded-3xl border border-white shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100/60 flex items-center justify-between bg-white/40">
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-500" />
                      已选图层 ({studioItems.length})
                    </h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {studioItems.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-center px-4 mt-10">
                        <Database className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="text-xs text-slate-400 mt-2">素材库为空，请前往 Hub 添加特效素材</p>
                        <button 
                          onClick={() => setActiveTab("hub")}
                          className="mt-4 px-4 py-1.5 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 rounded-lg text-xs font-semibold transition-colors border border-cyan-200/50"
                        >
                          前往素材 Hub
                        </button>
                      </div>
                    ) : (
                      studioItems.map((item, idx) => (
                        <div 
                          key={item.id}
                          onClick={() => setSelectedStudioItemId(item.id)}
                          className={`
                            p-3 rounded-xl cursor-pointer border transition-all duration-200 flex items-center gap-3 group
                            ${selectedStudioItemId === item.id 
                              ? "bg-cyan-50 border-cyan-300 shadow-sm" 
                              : "bg-white border-slate-100 hover:border-cyan-200 hover:bg-slate-50"
                            }
                          `}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white shadow-sm border border-slate-100 ${item.color}`}>
                            {item.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${selectedStudioItemId === item.id ? "text-cyan-800" : "text-slate-700"}`}>
                              {item.title}
                            </div>
                            <div className="text-[10px] text-slate-400">图层 {idx + 1} {item.echartsOption ? "✨" : ""}</div>
                          </div>
                          <button 
                            onClick={(e) => handleRemoveFromStudio(item.id, e)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Center Panel: Preview Canvas */}
                <div className="flex-1 bg-slate-900 rounded-3xl border-4 border-slate-800 shadow-2xl flex flex-col overflow-hidden relative group">
                  {/* Mock Canvas Content */}
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950">
                    
                    {/* Decorative Grid behind canvas */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #4f4f4f 1px, transparent 1px), linear-gradient(to bottom, #4f4f4f 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                    
                    {studioItems.length === 0 ? (
                      <div className="text-slate-600 flex flex-col items-center gap-4">
                        <MonitorPlay className="w-16 h-16 opacity-20" />
                        <span className="text-sm tracking-widest uppercase opacity-40 font-semibold">Canvas Empty</span>
                      </div>
                    ) : (
                      <div className="w-[85%] aspect-video bg-[#0f172a] rounded-xl border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm z-10">
                         {selectedItem && selectedItem.echartsOption ? (
                           <ReactECharts
                             ref={echartsRef}
                             option={selectedItem.echartsOption}
                             style={{height: '100%', width: '100%'}}
                             opts={{ renderer: 'canvas' }}
                             notMerge={true}
                           />
                         ) : (
                           <div className="text-slate-500">
                             该素材暂未加载AI渲染代码，请通过左侧选择有效图层。
                           </div>
                         )}

                         {isRecording && (
                           <div className="absolute top-4 left-4 bg-red-500/20 text-red-500 border border-red-500/50 px-3 py-1 text-xs font-bold rounded flex items-center gap-2 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              REC
                           </div>
                         )}
                      </div>
                    )}

                    {/* Editor HUD Overlay */}
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                      <div className="px-2 py-1 bg-black/50 backdrop-blur text-white text-[10px] rounded font-mono border border-white/10">Canvas API</div>
                      <div className="px-2 py-1 bg-black/50 backdrop-blur text-emerald-400 text-[10px] rounded font-mono border border-white/10">60 FPS</div>
                    </div>
                  </div>

                  {/* Player Controls */}
                  <div className="h-14 bg-slate-950/80 backdrop-blur-md border-t border-white/5 flex items-center justify-between px-6 z-20">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">
                        {isRecording ? "正在全帧率录制动画，点击停止按钮结束录制 >>" : "点击按钮一键重绘动画并开始录制 >>"}
                      </span>
                    </div>

                    <button 
                      onClick={handleToggleRecording}
                      disabled={!selectedItem?.echartsOption}
                      className={`px-5 py-1.5 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2 ${
                        isRecording 
                        ? 'bg-slate-700 hover:bg-slate-600 shadow-md shadow-slate-900/20' 
                        : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-lg shadow-red-500/20'
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-500 animate-pulse" /> 停止录制
                        </>
                      ) : (
                        <>
                          <MonitorPlay className="w-3.5 h-3.5" /> 开始自由录屏
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right Panel: Properties / Chat Edit */}
                <div className="w-80 bg-white/60 backdrop-blur-2xl rounded-3xl border border-white shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100/60 flex items-center justify-between bg-white/40">
                    <div className="flex items-center gap-2">
                       <MessageSquare className="w-4 h-4 text-fuchsia-500" />
                       <h3 className="font-semibold text-slate-800 text-sm">AI 持续编辑</h3>
                    </div>
                  </div>

                  {selectedItem ? (
                    <>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
                        <div className="text-center text-xs text-slate-400 my-2">
                           —— 开始与 AI 对话以修改图表 ——
                        </div>
                        {(selectedItem.chatHistory || []).map((msg) => (
                           <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                             {msg.image && (
                               <img src={msg.image} alt="upload" className="max-w-full h-auto rounded-lg mb-1 border border-slate-200 shadow-sm" />
                             )}
                             <div className={`px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-fuchsia-500 text-white rounded-tr-sm shadow-md shadow-fuchsia-500/20' : 'bg-white text-slate-700 rounded-tl-sm shadow-sm border border-slate-100 whitespace-pre-wrap leading-relaxed'}`}>
                               {msg.content}
                             </div>
                           </div>
                        ))}
                        {isChatting && (
                           <div className="self-start bg-white text-slate-500 px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 text-sm flex items-center gap-2 animate-pulse">
                              <Loader2 className="w-4 h-4 animate-spin" /> 正在分析与应用修改...
                           </div>
                        )}
                        {/* Auto-scroll target */}
                        <div className="h-4 shrink-0" />
                      </div>
                      
                      {/* Chat Input */}
                      <div className="p-3 bg-white/80 border-t border-slate-100/80 m-2 rounded-2xl shadow-sm space-y-2 relative">
                        {chatImage && (
                          <div className="relative inline-block m-1">
                            <img src={chatImage} alt="preview" className="h-16 rounded-lg border border-slate-200" />
                            <button onClick={() => setChatImage(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-0.5 shadow-sm hover:scale-110 transition-transform">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                           <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 rounded-xl transition-colors shrink-0">
                             <ImagePlus className="w-5 h-5" />
                           </button>
                           <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleChatImageUpload} />
                           
                           <textarea
                             value={chatInput}
                             onChange={(e) => {
                               setChatInput(e.target.value);
                               // Auto resize
                               e.target.style.height = 'auto';
                               e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                             }}
                             onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendChat();
                                }
                             }}
                             onPaste={(e) => {
                               // Support Ctrl+V / Cmd+V image paste from clipboard
                               const items = Array.from(e.clipboardData.items);
                               const imageItem = items.find(item => item.type.startsWith("image/"));
                               if (imageItem) {
                                 e.preventDefault();
                                 const file = imageItem.getAsFile();
                                 if (!file) return;
                                 const reader = new FileReader();
                                 reader.onload = (ev) => {
                                   const base64 = ev.target?.result as string;
                                   if (base64) setChatImage(base64);
                                 };
                                 reader.readAsDataURL(file);
                               }
                             }}
                             placeholder="输入修改指令... (可直接 Ctrl+V 粘贴图片)"
                             className="flex-1 min-h-[40px] p-2 bg-transparent text-sm resize-none focus:outline-none placeholder:text-slate-400 custom-scrollbar overflow-y-auto"
                             rows={1}
                             style={{ height: '40px' }}
                           />
                           
                           <button 
                             onClick={handleSendChat}
                             disabled={(!chatInput.trim() && !chatImage) || isChatting}
                             className="p-2 bg-fuchsia-500 hover:bg-fuchsia-600 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl transition-colors shrink-0 shadow-sm"
                           >
                             <Send className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center">
                      <p className="text-sm text-slate-400">选择图层以编辑</p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
