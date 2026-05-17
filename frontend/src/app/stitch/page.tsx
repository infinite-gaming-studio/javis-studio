"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SettingsModal from "@/components/SettingsModal";
import { getSettings } from "@/lib/api";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { useNotification } from "@/lib/NotificationContext";

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
  MessageSquare,
  ZoomIn,
  Upload,
  RefreshCw,
  Star,
  History,
  GitBranch,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  MoreVertical
} from "lucide-react";

type Tab = "hub" | "studio";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  isError?: boolean;
}

interface EffectVersion {
  id: string;
  versionNumber: number;
  echartsOption: any;
  chatHistory: ChatMessage[];
  createdAt: number;
  isTemplate: boolean;
  templateName?: string;
}

interface EffectItem {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  thumbnailGradient: string;
  versions: EffectVersion[];
  currentVersionId: string;
  templateVersionId?: string;
  maxVersions: number;
}

const CATEGORIES = ["全部", "金融展示", "地理分布", "趋势动态", "占比排名", "AI 生成"];

// Image Preview Modal Component
function ImagePreviewModal({ src, onClose }: { src: string; onClose: () => void }) {
  if (!src) return null;
  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img src={src} alt="preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
        <button 
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full p-2 shadow-lg hover:bg-slate-100 transition-colors hover:scale-110"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

const INITIAL_MOCK_EFFECTS: EffectItem[] = [
  {
    id: "eff-01",
    title: "动态折线趋势图",
    category: "趋势动态",
    description: "适用于展示时间序列数据的增长与波动变化。",
    icon: <LineChart className="w-5 h-5" />,
    color: "text-blue-500",
    thumbnailGradient: "from-blue-500/20 to-cyan-500/20 border-cyan-200/50",
    versions: [
      {
        id: "v1",
        versionNumber: 1,
        echartsOption: {
          backgroundColor: "transparent",
          animationDuration: 3000,
          xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], axisLine: { lineStyle: { color: "#fff" }} },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" }}, axisLine: { lineStyle: { color: "#fff" }} },
          series: [{ data: [150, 230, 224, 218, 135, 147, 260], type: 'line', smooth: true, lineStyle: { width: 4, color: '#06b6d4' }, areaStyle: { color: '#06b6d4', opacity: 0.3 } }]
        },
        chatHistory: [],
        createdAt: Date.now() - 86400000,
        isTemplate: true,
        templateName: "默认模板"
      }
    ],
    currentVersionId: "v1",
    templateVersionId: "v1",
    maxVersions: 5
  },
  {
    id: "eff-02",
    title: "3D 立体柱状图",
    category: "金融展示",
    description: "多维度的业绩数据比较，带有炫酷的光影效果。",
    icon: <BarChart3 className="w-5 h-5" />,
    color: "text-fuchsia-500",
    thumbnailGradient: "from-fuchsia-500/20 to-purple-500/20 border-purple-200/50",
    versions: [
      {
        id: "v1",
        versionNumber: 1,
        echartsOption: {
          backgroundColor: "transparent",
          animationDuration: 2000,
          xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'], axisLine: { lineStyle: { color: "#fff" }} },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" }}, axisLine: { lineStyle: { color: "#fff" }} },
          series: [{ data: [120, 200, 150, 80], type: 'bar', itemStyle: { color: '#d946ef', borderRadius: [4, 4, 0, 0] } }]
        },
        chatHistory: [],
        createdAt: Date.now() - 172800000,
        isTemplate: false
      }
    ],
    currentVersionId: "v1",
    maxVersions: 5
  },
  {
    id: "eff-06",
    title: "中空环形进度圈",
    category: "占比排名",
    description: "展示目标完成率或多参数占用比的光效环状图。",
    icon: <PieChart className="w-5 h-5" />,
    color: "text-indigo-500",
    thumbnailGradient: "from-indigo-500/20 to-blue-500/20 border-blue-200/50",
    versions: [
      {
        id: "v1",
        versionNumber: 1,
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
        },
        chatHistory: [],
        createdAt: Date.now() - 259200000,
        isTemplate: false
      }
    ],
    currentVersionId: "v1",
    maxVersions: 5
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
  const { showSuccess, showError } = useNotification();
  
  const [activeTab, setActiveTab] = useState<Tab>("hub");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Hub States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [effectsPool, setEffectsPool] = useState<EffectItem[]>(INITIAL_MOCK_EFFECTS);
  const [previewEffectId, setPreviewEffectId] = useState<string | null>(null);
  
  // AI Generate States
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [studioItems, setStudioItems] = useState<EffectItem[]>([]);
  const [selectedStudioItemId, setSelectedStudioItemId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

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

  // Helper to strip large assets (like base64 images) before saving to local storage
  const stripLargeDataForStorage = (items: EffectItem[]) => {
    return items.map(item => ({
      ...item,
      icon: null,
      iconName: getIconName(item.icon),
      versions: item.versions.map(v => ({
        ...v,
        chatHistory: v.chatHistory.map(msg => ({
          ...msg,
          image: msg.image ? "[IMAGE_ATTACHED]" : undefined
        }))
      }))
    }));
  };

  // Persistence Saving Effects
  useEffect(() => {
    try {
      const toSave = stripLargeDataForStorage(effectsPool);
      localStorage.setItem("stitch_effects_pool", JSON.stringify(toSave));
    } catch (e) { console.error("Failed to save effects pool to local storage", e); }
  }, [effectsPool]);

  useEffect(() => {
    try {
      const toSave = stripLargeDataForStorage(studioItems);
      localStorage.setItem("stitch_studio_items", JSON.stringify(toSave));
    } catch (e) { console.error("Failed to save studio items to local storage", e); }
  }, [studioItems]);

  // Chat States
  const [chatInput, setChatInput] = useState("");
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [isChatting, setIsChatting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const echartsRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const filteredEffects = effectsPool.filter(effect => {
    const matchesSearch = effect.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "全部" || effect.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Helper functions for version management
  const getCurrentVersion = (item: EffectItem): EffectVersion | undefined => {
    return item.versions.find(v => v.id === item.currentVersionId);
  };

  const getTemplateVersion = (item: EffectItem): EffectVersion | undefined => {
    if (!item.templateVersionId) return undefined;
    return item.versions.find(v => v.id === item.templateVersionId);
  };

  const createNewVersion = (item: EffectItem, echartsOption: any, chatHistory: ChatMessage[]): EffectVersion => {
    const maxVersionNum = Math.max(0, ...item.versions.map(v => v.versionNumber));
    return {
      id: `v${maxVersionNum + 1}`,
      versionNumber: maxVersionNum + 1,
      echartsOption,
      chatHistory,
      createdAt: Date.now(),
      isTemplate: false
    };
  };

  const addVersionToItem = (itemId: string, newVersion: EffectVersion, setItems: React.Dispatch<React.SetStateAction<EffectItem[]>>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      let updatedVersions = [...item.versions, newVersion];
      
      // Keep only maxVersions
      if (updatedVersions.length > item.maxVersions) {
        // Don't remove template version
        const templateVersionId = item.templateVersionId;
        updatedVersions = updatedVersions
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, item.maxVersions);
        
        // Ensure template version is kept if it was in the list
        if (templateVersionId && !updatedVersions.find(v => v.id === templateVersionId)) {
          const templateVersion = item.versions.find(v => v.id === templateVersionId);
          if (templateVersion) {
            updatedVersions[updatedVersions.length - 1] = templateVersion;
          }
        }
      }
      
      return {
        ...item,
        versions: updatedVersions,
        currentVersionId: newVersion.id
      };
    }));
  };

  // Version management functions
  const handleSwitchVersion = (itemId: string, versionId: string) => {
    setEffectsPool(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, currentVersionId: versionId };
    }));
  };

  const handleToggleTemplate = (itemId: string, versionId: string) => {
    setEffectsPool(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      const isCurrentlyTemplate = item.templateVersionId === versionId;
      
      return {
        ...item,
        templateVersionId: isCurrentlyTemplate ? undefined : versionId,
        versions: item.versions.map(v => ({
          ...v,
          isTemplate: !isCurrentlyTemplate && v.id === versionId,
          templateName: !isCurrentlyTemplate && v.id === versionId ? "模板" : undefined
        }))
      };
    }));
  };

  const handleRevertToVersion = (itemId: string, versionId: string) => {
    const item = effectsPool.find(i => i.id === itemId);
    if (!item) return;
    
    const targetVersion = item.versions.find(v => v.id === versionId);
    if (!targetVersion) return;
    
    // Create new version based on target version
    const newVersion = createNewVersion(item, targetVersion.echartsOption, [...targetVersion.chatHistory]);
    addVersionToItem(itemId, newVersion, setEffectsPool);
  };

  const handleAddToStudio = (item: EffectItem) => {
    const currentVersion = getCurrentVersion(item);
    if (!currentVersion) return;
    
    const newItem: EffectItem = {
      ...item,
      id: `${item.id}-${Date.now()}`,
      versions: [{ ...currentVersion, id: "v1", versionNumber: 1 }],
      currentVersionId: "v1"
    };
    setStudioItems(prev => [...prev, newItem]);
    setSelectedStudioItemId(newItem.id);
    setActiveTab("studio");
  };

  const handleRemoveFromStudio = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStudioItems(prev => prev.filter(item => item.id !== id));
    if (selectedStudioItemId === id) setSelectedStudioItemId(null);
  };

  const isPreviewMode = activeTab === "hub" && previewEffectId !== null;
  const selectedItem = isPreviewMode
    ? effectsPool.find(item => item.id === previewEffectId)
    : studioItems.find(item => item.id === selectedStudioItemId);
  const selectedVersion = selectedItem ? getCurrentVersion(selectedItem) : undefined;

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
        versions: [
          {
            id: "v1",
            versionNumber: 1,
            echartsOption: parsedOption,
            chatHistory: [],
            createdAt: Date.now(),
            isTemplate: false
          }
        ],
        currentVersionId: "v1",
        maxVersions: 5
      };

      setEffectsPool([newEffect, ...effectsPool]);
      setAiPrompt("");
      showSuccess("AI 特效生成成功！已加入图表库中。");

    } catch (e: any) {
      showError(`生成出错: ${e.message}`);
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
    if ((!chatInput.trim() && !chatImage) || isChatting || !selectedItem || !selectedVersion) return;
    
    setIsChatting(true);
    
    const newUserMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: chatInput,
      image: chatImage || undefined
    };

    const currentHistory = selectedVersion.chatHistory || [];
    const updatedHistory = [...currentHistory, newUserMsg];
    
    // Optimistic update - update current version's chat history
    setEffectsPool(prev => prev.map(item => {
      if (item.id !== selectedItem.id) return item;
      return {
        ...item,
        versions: item.versions.map(v => 
          v.id === item.currentVersionId 
            ? { ...v, chatHistory: updatedHistory }
            : v
        )
      };
    }));

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
          currentOption: selectedVersion.echartsOption,
          prompt: promptText,
          image: attachedImage
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        const errorMsg = data.detail || "请求失败";
        if (errorMsg.includes("model") && errorMsg.includes("image")) {
          throw new Error("当前配置的 AI 模型不支持图片输入。请更换支持多模态的模型（如 GPT-4o、Claude 3.5 Sonnet 等），或移除图片后重新发送。");
        }
        throw new Error(errorMsg);
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

      // Create new version with updated config and chat history
      const newVersion = createNewVersion(selectedItem, parsedOption, [...updatedHistory, newAsstMsg]);
      addVersionToItem(selectedItem.id, newVersion, setEffectsPool);

    } catch (e: any) {
      showError(`编辑出错: ${e.message}`);
      
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `编辑出错: ${e.message}`,
        isError: true
      };

      setEffectsPool(prev => prev.map(item => {
        if (item.id !== selectedItem.id) return item;
        return {
          ...item,
          versions: item.versions.map(v => 
            v.id === item.currentVersionId 
              ? { ...v, chatHistory: [...updatedHistory, errorMsg] }
              : v
          )
        };
      }));
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
        
        // Restore original background color after recording
        if (echartsRef.current && selectedVersion?.echartsOption) {
          const echartInstance = echartsRef.current.getEchartsInstance();
          const originalOption = JSON.parse(JSON.stringify(selectedVersion.echartsOption));
          echartInstance.setOption({ backgroundColor: originalOption.backgroundColor || 'transparent' }, false);
        }
      }
      return;
    }

    if (!echartsRef.current || !selectedVersion?.echartsOption) return;
    
    // Get ECharts instance canvas
    const echartInstance = echartsRef.current.getEchartsInstance();
    const canvasElement = echartInstance.getDom().querySelector('canvas');

    if (!canvasElement) {
      showError("无法获取画布资源");
      return;
    }

    // Clear chart first to force animation restart
    echartInstance.clear();

    try {
      // Wait for clear to take effect, then setOption to trigger animation from scratch
      requestAnimationFrame(() => {
        // Deep clone option and set solid background color for recording
        // This ensures the video has the same background as displayed in the UI
        const freshOption = JSON.parse(JSON.stringify(selectedVersion.echartsOption));
        
        // Set the actual display background color instead of transparent
        // The container has bg-[#0f172a] (slate-900)
        freshOption.backgroundColor = '#0f172a';
        
        echartInstance.setOption(freshOption, true);

        // Start recording after animation begins (wait for first frames to render)
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
             setRecordedVideoUrl(url);
             setRecordedVideoBlob(blob);
             setShowVideoPreview(true);
             
             // Restore original background color
             const restoreOption = JSON.parse(JSON.stringify(selectedVersion.echartsOption));
             echartInstance.setOption({ backgroundColor: restoreOption.backgroundColor || 'transparent' }, false);
          };

          mediaRecorderRef.current = recorder;
          recorder.start();
          setIsRecording(true);
          setIsPlaying(true);
        }, 150); // Wait 150ms for animation to start rendering
      });

    } catch (e) {
      console.error(e);
      showError("录制异常，您的浏览器可能不支持该画布录制API。");
      setIsRecording(false);
    }
  }, [selectedVersion, isRecording, showError]);

  const handleDownloadVideo = useCallback(async () => {
    if (!recordedVideoBlob || isConverting) return;
    setIsConverting(true);
    
    try {
      showSuccess("正在转换视频格式，请稍候...");
      const formData = new FormData();
      formData.append('file', recordedVideoBlob, 'video.webm');

      // Use relative path to let Next.js proxy it to the backend and avoid CORS
      const res = await fetch("/api/studio/video/convert", {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error("视频格式转换失败");
      }

      const mp4Blob = await res.blob();
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stitch-export-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess("视频已成功导出为 MP4 格式！");
      setShowVideoPreview(false);
      setRecordedVideoUrl(null);
      setRecordedVideoBlob(null);
    } catch (e: any) {
      showError(`导出失败: ${e.message}`);
    } finally {
      setIsConverting(false);
    }
  }, [recordedVideoBlob, isConverting, showError, showSuccess]);

  // Cancel and re-record
  const handleReRecord = useCallback(() => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }
    setShowVideoPreview(false);
    setRecordedVideoUrl(null);
    setRecordedVideoBlob(null);
  }, [recordedVideoUrl]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedVersion?.chatHistory, isChatting]);


  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900 flex flex-col">
      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {/* Video Preview Modal */}
      {showVideoPreview && recordedVideoUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
          onClick={handleReRecord}
        >
          <div 
            className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Play className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">视频预览</h3>
                  <p className="text-xs text-slate-400">确认无误后下载，或重新录制</p>
                </div>
              </div>
              <button 
                onClick={handleReRecord}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-video bg-black">
              <video 
                src={recordedVideoUrl} 
                controls 
                autoPlay
                className="w-full h-full"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-950/50">
              <button 
                onClick={handleReRecord}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                重新录制
              </button>
              <button 
                onClick={handleDownloadVideo}
                disabled={isConverting}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isConverting ? "处理中..." : "确认下载"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          {activeTab === "hub" && previewEffectId && (
              <div className="absolute inset-0 flex flex-row gap-4 animate-in fade-in zoom-in-95 duration-400 z-50 bg-slate-900/50 p-2 rounded-3xl">
                {/* Center Canvas for Preview */}
                <div className="flex-1 bg-slate-900 rounded-3xl border-4 border-slate-800 shadow-2xl flex flex-col overflow-hidden relative group">
                  {/* Preview Header */}
                  <div className="h-14 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 z-20 border-b border-white/10">
                    <button 
                      onClick={() => setPreviewEffectId(null)}
                      className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors text-sm font-semibold"
                    >
                       <X className="w-5 h-5" /> 返回 Hub
                    </button>
                    {selectedItem && (
                      <button 
                         onClick={() => { handleAddToStudio(selectedItem); setPreviewEffectId(null); }}
                         className="px-4 py-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 active:bg-fuchsia-700 text-white rounded-lg font-bold text-sm transition-all shadow-md flex items-center gap-2"
                      >
                         <Plus className="w-4 h-4" /> 加入 Studio
                      </button>
                    )}
                  </div>
                  
                  {/* Preview Canvas */}
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, #4f4f4f 1px, transparent 1px), linear-gradient(to bottom, #4f4f4f 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                     <div className="w-[85%] aspect-video bg-[#0f172a] rounded-xl border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm z-10">
                        {selectedItem && selectedVersion?.echartsOption ? (
                          <ReactECharts
                             option={selectedVersion.echartsOption}
                             style={{height: '100%', width: '100%'}}
                             opts={{ renderer: 'canvas', devicePixelRatio: 2 }}
                             notMerge={true}
                           />
                        ) : (
                          <div className="text-slate-500">无法加载渲染代码</div>
                        )}
                     </div>
                  </div>
                </div>

                {/* Right Panel: Properties / Chat Edit - wrapped for rainbow glow */}
                <div className={`ai-glow-wrapper flex-shrink-0 ${isChatting ? 'active' : ''}`}>
                <div className="w-80 bg-white/60 backdrop-blur-2xl rounded-3xl border border-white shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100/60 flex items-center justify-between bg-white/40">
                    <div className="flex items-center gap-2">
                       <MessageSquare className="w-4 h-4 text-fuchsia-500" />
                       <h3 className="font-semibold text-slate-800 text-sm">AI 持续编辑</h3>
                    </div>
                  </div>

                  {selectedItem && selectedVersion ? (
                    <>
                      {/* Version Info Header */}
                      <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100/60">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <GitBranch className="w-3 h-3" />
                            <span>版本 {selectedVersion.versionNumber}</span>
                            <span className="text-slate-300">•</span>
                            <Clock className="w-3 h-3" />
                            <span>{new Date(selectedVersion.createdAt).toLocaleDateString()}</span>
                          </div>
                          <button
                            onClick={() => setShowVersionPanel(!showVersionPanel)}
                            className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 transition-colors"
                          >
                            <History className="w-3 h-3" />
                            <span>历史</span>
                            {showVersionPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                        {selectedVersion.isTemplate && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-1 w-fit">
                            <Star className="w-3 h-3 fill-current" />
                            <span>模板</span>
                          </div>
                        )}
                      </div>

                      {/* Version History Panel */}
                      {showVersionPanel && selectedItem && (
                        <div className="border-b border-slate-100/60 bg-white/80 max-h-48 overflow-y-auto">
                          <div className="p-3 space-y-2">
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">版本历史</div>
                            {selectedItem.versions
                              .sort((a, b) => b.createdAt - a.createdAt)
                              .map((version) => (
                                <div 
                                  key={version.id}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                                    selectedVersion.id === version.id 
                                      ? 'bg-cyan-50 border-cyan-200' 
                                      : 'bg-white border-slate-100 hover:border-cyan-200 hover:bg-slate-50'
                                  }`}
                                  onClick={() => handleSwitchVersion(selectedItem.id, version.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                                      selectedVersion.id === version.id 
                                        ? 'bg-cyan-500 text-white' 
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      v{version.versionNumber}
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-medium text-slate-700 flex items-center gap-1">
                                        版本 {version.versionNumber}
                                        {version.isTemplate && (
                                          <Star className="w-3 h-3 text-amber-500 fill-current" />
                                        )}
                                      </div>
                                      <div className="text-[9px] text-slate-400">
                                        {new Date(version.createdAt).toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleTemplate(selectedItem.id, version.id);
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        version.isTemplate 
                                          ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' 
                                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                                      }`}
                                      title={version.isTemplate ? "取消模板" : "设为模板"}
                                    >
                                      <Star className={`w-3.5 h-3.5 ${version.isTemplate ? 'fill-current' : ''}`} />
                                    </button>
                                    {selectedVersion.id !== version.id && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRevertToVersion(selectedItem.id, version.id);
                                        }}
                                        className="p-1 rounded text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                                        title="回溯到此版本"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Chat History - takes 2/3 */}
                      <div className="flex-[2] overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col min-h-0">
                        {(selectedVersion.chatHistory || []).length === 0 ? (
                          <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                            <p className="text-xs text-slate-400 leading-relaxed">
                              开始与 AI 对话以修改图表<br/>
                              <span className="text-[10px] text-slate-300 mt-1 block">支持粘贴图片作为参考</span>
                            </p>
                          </div>
                        ) : (
                          <>
                            {(selectedVersion.chatHistory || []).map((msg: ChatMessage, index: number) => (
                              <div key={msg.id} className={`flex flex-col max-w-[85%] mb-2 ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                {msg.image && (
                                  msg.image === "[IMAGE_ATTACHED]" ? (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 rounded-lg border border-slate-200 text-xs w-fit mb-1">
                                      <ImagePlus className="w-3.5 h-3.5" />
                                      <span>历史图片已清理以节省存储空间</span>
                                    </div>
                                  ) : (
                                    <div 
                                      className="relative group cursor-pointer mb-1"
                                      onClick={() => setPreviewImage(msg.image!)}
                                    >
                                      <img src={msg.image} alt="upload" className="max-w-[180px] h-auto rounded-lg border border-slate-200 shadow-sm group-hover:shadow-md transition-shadow" />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                    </div>
                                  )
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm border whitespace-pre-wrap leading-relaxed ${msg.role === 'user' ? 'bg-fuchsia-500 text-white rounded-tr-sm border-transparent shadow-fuchsia-500/20' : (msg.isError ? 'bg-rose-50 border-rose-200 text-rose-600 rounded-tl-sm' : 'bg-white text-slate-700 border-slate-100 rounded-tl-sm')}`}>
                                  {msg.content}
                                </div>
                                {msg.isError && (
                                  <button
                                    onClick={() => {
                                      const prevMsg = selectedVersion.chatHistory[index - 1];
                                      if (prevMsg && prevMsg.role === 'user') {
                                        setChatInput(prevMsg.content);
                                        if (prevMsg.image && prevMsg.image !== "[IMAGE_ATTACHED]") {
                                          setChatImage(prevMsg.image);
                                        }
                                        // Auto-scroll input view or calculate height naturally
                                      }
                                    }}
                                    className="mt-1.5 ml-2 flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-colors bg-white/60 px-3 py-1.5 rounded-full border border-rose-200 shadow-sm"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" /> 恢复输入内容并重试
                                  </button>
                                )}
                              </div>
                            ))}
                            {isChatting && (
                              <div className="self-start bg-white text-slate-500 px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 text-sm flex items-center gap-2 animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin" /> 正在分析与应用修改...
                              </div>
                            )}
                            <div ref={messagesEndRef} />
                          </>
                        )}
                        <div className="h-2 shrink-0" />
                      </div>
                      
                      {/* Chat Input Area - takes 1/3 */}
                      <div className="flex-[1] flex flex-col border-t border-slate-100/60 bg-white/60">
                        {/* Attached Image Preview */}
                        <div className="px-3 pt-2">
                          {chatImage && (
                            <div className="relative inline-block group">
                              <img 
                                src={chatImage} 
                                alt="preview" 
                                className="h-14 rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" 
                                onClick={() => setPreviewImage(chatImage)}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center pointer-events-none">
                                <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <button 
                                onClick={() => setChatImage(null)} 
                                className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full p-0.5 shadow-sm hover:bg-red-500 transition-colors hover:scale-110"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        
                        {/* Input Controls */}
                        <div className="flex-1 flex flex-col p-2 gap-1.5">
                          <div className="flex items-end gap-1.5 flex-1">
                            <button 
                              onClick={() => fileInputRef.current?.click()} 
                              className="p-1.5 text-slate-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 rounded-lg transition-colors shrink-0"
                              title="上传图片"
                            >
                              <ImagePlus className="w-4 h-4" />
                            </button>
                            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleChatImageUpload} />
                            
                            <textarea
                              value={chatInput}
                              onChange={(e) => {
                                setChatInput(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 250)}px`;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendChat();
                                  e.currentTarget.style.height = 'auto'; // Reset height on send
                                }
                              }}
                              onPaste={(e) => {
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
                              placeholder="输入修改指令... (Shift + Enter 换行)"
                              className="flex-1 min-h-[36px] max-h-[33vh] p-2 bg-white/80 border border-slate-200/60 rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30 focus:border-fuchsia-300 placeholder:text-slate-400 custom-scrollbar overflow-y-auto"
                              rows={1}
                            />
                            
                            <button 
                              onClick={handleSendChat}
                              disabled={(!chatInput.trim() && !chatImage) || isChatting}
                              className="p-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg transition-colors shrink-0 shadow-sm"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[9px] text-slate-300">Ctrl+V 粘贴图片</span>
                            <span className="text-[9px] text-slate-300">Enter 发送</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center px-6">
                      <div>
                        <Upload className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-400 font-medium">选择图层以编辑</p>
                        <p className="text-xs text-slate-300 mt-1">从左侧图层列表中选择一个特效</p>
                      </div>
                    </div>
                  )}
                </div>


              </div>

            </div>
            )}
            
          {activeTab === "hub" && !previewEffectId && (
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
                      <p className="text-sm mt-2 font-medium">请尝试更换搜索词或选择 &quot;全部&quot; 分类</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max">
                      {filteredEffects.map((effect, idx) => (
                        <div 
                          key={effect.id} 
                          onClick={() => setPreviewEffectId(effect.id)}
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
                              {getCurrentVersion(effect)?.echartsOption && (
                                <button className="p-3 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all hover:scale-110 border border-white/30" title="包含 AI 生成代码">
                                   <Zap className="w-5 h-5 fill-current" />
                                </button>
                              )}
                              {effect.templateVersionId && (
                                <button className="p-3 bg-amber-500/30 hover:bg-amber-500/50 backdrop-blur-md rounded-full text-amber-300 transition-all hover:scale-110 border border-amber-400/30" title="已设置为模板">
                                   <Star className="w-5 h-5 fill-current" />
                                </button>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleAddToStudio(effect); }}
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
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <span>图层 {idx + 1}</span>
                              <span className="text-slate-300">•</span>
                              <span className="flex items-center gap-0.5">
                                <GitBranch className="w-2.5 h-2.5" />
                                v{getCurrentVersion(item)?.versionNumber || 1}
                              </span>
                              {item.templateVersionId && (
                                <Star className="w-2.5 h-2.5 text-amber-500 fill-current" />
                              )}
                            </div>
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
                         {selectedItem && selectedVersion?.echartsOption ? (
                           <ReactECharts
                             ref={echartsRef}
                             option={selectedVersion.echartsOption}
                             style={{height: '100%', width: '100%'}}
                             opts={{ renderer: 'canvas', devicePixelRatio: 2 }}
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
                      disabled={!selectedVersion?.echartsOption}
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

              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
