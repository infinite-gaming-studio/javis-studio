"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Mic2,
  FileImage,
  Wand2,
  Settings,
  ChevronRight,
  Sparkles,
  Scissors,
  X,
  Zap,
  Film,
  Palette,
  Code,
} from "lucide-react";

// 工具菜单项类型
interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  badge?: string;
}

// 小工具列表
const tools: ToolItem[] = [
  {
    id: "studio",
    name: "AI 旁白工作台",
    description: "生成高质量语音旁白",
    icon: <Mic2 className="w-5 h-5" />,
    href: "/",
    color: "from-cyan-500 to-blue-500",
  },
  {
    id: "pdf-to-image",
    name: "PDF 转图片",
    description: "高质量 PDF 转换工具",
    icon: <FileImage className="w-5 h-5" />,
    href: "/pdf-to-image",
    color: "from-violet-500 to-purple-500",
    badge: "New",
  },
  {
    id: "video-matcher",
    name: "AI 视频配图",
    description: "智能匹配视频素材",
    icon: <Film className="w-5 h-5" />,
    href: "/video-matcher",
    color: "from-blue-500 to-indigo-500",
    badge: "New",
  },
];

// 即将推出的工具
const upcomingTools: ToolItem[] = [
  {
    id: "image-editor",
    name: "图片编辑器",
    description: "智能图片处理",
    icon: <Palette className="w-5 h-5" />,
    href: "#",
    color: "from-pink-500 to-rose-500",
    badge: "即将推出",
  },
  {
    id: "audio-editor",
    name: "音频剪辑",
    description: "音频编辑与合成",
    icon: <Scissors className="w-5 h-5" />,
    href: "#",
    color: "from-amber-500 to-orange-500",
    badge: "即将推出",
  },
];

interface GlobalHeaderProps {
  showStatus?: boolean;
  status?: "idle" | "processing" | "done" | "error";
  statusText?: string;
  onSettingsClick?: () => void;
}

export default function GlobalHeader({
  showStatus = false,
  status = "idle",
  statusText,
  onSettingsClick,
}: GlobalHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ESC 键关闭菜单
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  // 处理工具点击
  const handleToolClick = (href: string) => {
    if (href === "#") return;
    setIsMenuOpen(false);
    router.push(href);
  };

  // 获取当前页面状态样式
  const getStatusStyle = () => {
    switch (status) {
      case "error":
        return "bg-red-50 text-red-600 border-red-100";
      case "done":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "processing":
        return "bg-cyan-50 text-cyan-600 border-cyan-100 animate-pulse shadow-sm shadow-cyan-500/10";
      default:
        return "bg-slate-50 text-slate-500 border-slate-100";
    }
  };

  // 获取当前页面状态图标
  const getStatusIcon = () => {
    switch (status) {
      case "error":
        return <span className="w-1.5 h-1.5 rounded-full bg-red-500" />;
      case "done":
        return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />;
      case "processing":
        return <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />;
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />;
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3 h-14 px-6">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Wand2 className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
              Javis Studio
            </span>
          </div>

          <div className="flex-1" />

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2">
            {/* 状态指示器 */}
            {showStatus && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-300 ${getStatusStyle()}`}
              >
                {getStatusIcon()}
                <span>{statusText || (status === "idle" ? "就绪" : status === "processing" ? "处理中..." : status === "done" ? "完成" : "错误")}</span>
              </div>
            )}

            {/* 分隔线 */}
            <div className="w-px h-4 bg-slate-200 mx-1" />

            {/* 全局设置按钮 */}
            {onSettingsClick && (
              <button
                onClick={onSettingsClick}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-200 border border-transparent hover:border-slate-200"
                title="全局设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* 工具箱按钮 */}
            <div className="relative">
              <button
                ref={buttonRef}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`
                  relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300
                  ${isMenuOpen 
                    ? "bg-cyan-50 text-cyan-600 border-cyan-200 shadow-md shadow-cyan-500/20" 
                    : "bg-white/50 text-slate-600 border border-slate-200 hover:border-cyan-300 hover:text-cyan-600 hover:shadow-md"
                  }
                `}
              >
                <div className={`
                  relative w-5 h-5 transition-transform duration-300
                  ${isMenuOpen ? "rotate-90" : isHovered ? "rotate-12" : ""}
                `}>
                  <Sparkles className={`
                    w-5 h-5 transition-all duration-300
                    ${isMenuOpen ? "text-cyan-500" : ""}
                  `} />
                  {/* 动态光点 */}
                  <span className={`
                    absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400
                    transition-all duration-300
                    ${isMenuOpen ? "opacity-100 scale-100" : "opacity-0 scale-0"}
                  `} />
                </div>
                <span className="text-sm font-medium hidden sm:inline">工具箱</span>
                <ChevronRight className={`
                  w-4 h-4 transition-transform duration-300
                  ${isMenuOpen ? "rotate-90" : ""}
                `} />
              </button>

              {/* 工具菜单弹出层 */}
              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-2 w-80 origin-top-right"
                >
                  {/* 菜单容器 - 带入场动画 */}
                  <div 
                    className="
                      relative overflow-hidden rounded-2xl 
                      bg-white/95 backdrop-blur-xl 
                      border border-white/60 shadow-2xl shadow-cyan-900/20
                      animate-in slide-in-from-top-2 fade-in duration-200
                    "
                  >
                    {/* 顶部渐变装饰 */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
                    
                    {/* 背景光效 */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-violet-400/10 rounded-full blur-3xl pointer-events-none" />

                    {/* 头部 */}
                    <div className="relative px-5 py-4 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800 text-sm">工具箱</h3>
                            <p className="text-[11px] text-slate-400">快速访问所有工具</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsMenuOpen(false)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 可用工具列表 */}
                    <div className="relative p-3 space-y-1">
                      <p className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        可用工具
                      </p>
                      {tools.map((tool, index) => {
                        const isActive = pathname === tool.href;
                        return (
                          <button
                            key={tool.id}
                            onClick={() => handleToolClick(tool.href)}
                            className={`
                              w-full group flex items-center gap-3 p-3 rounded-xl
                              transition-all duration-200
                              ${isActive 
                                ? "bg-cyan-50 border border-cyan-200 shadow-sm" 
                                : "hover:bg-slate-50 border border-transparent hover:border-slate-200"
                              }
                            `}
                            style={{
                              animationDelay: `${index * 50}ms`,
                            }}
                          >
                            {/* 图标容器 */}
                            <div className={`
                              w-10 h-10 rounded-xl flex items-center justify-center
                              bg-gradient-to-br ${tool.color}
                              shadow-lg transition-transform duration-200
                              group-hover:scale-105 group-hover:shadow-xl
                              ${isActive ? "ring-2 ring-cyan-200 ring-offset-2" : ""}
                            `}>
                              <span className="text-white">{tool.icon}</span>
                            </div>

                            {/* 文字内容 */}
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${isActive ? "text-cyan-700" : "text-slate-700"}`}>
                                  {tool.name}
                                </span>
                                {tool.badge && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold text-white bg-gradient-to-r from-violet-500 to-purple-500 rounded-full">
                                    {tool.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{tool.description}</p>
                            </div>

                            {/* 箭头指示 */}
                            <ChevronRight className={`
                              w-4 h-4 transition-all duration-200
                              ${isActive 
                                ? "text-cyan-500 translate-x-0 opacity-100" 
                                : "text-slate-300 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                              }
                            `} />
                          </button>
                        );
                      })}
                    </div>

                    {/* 分隔线 */}
                    <div className="relative h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

                    {/* 即将推出 */}
                    <div className="relative p-3 space-y-1">
                      <p className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        即将推出
                      </p>
                      {upcomingTools.map((tool, index) => (
                        <div
                          key={tool.id}
                          className="w-full flex items-center gap-3 p-3 rounded-xl opacity-60 cursor-not-allowed"
                          style={{
                            animationDelay: `${(tools.length + index) * 50}ms`,
                          }}
                        >
                          <div className={`
                            w-10 h-10 rounded-xl flex items-center justify-center
                            bg-gradient-to-br ${tool.color} opacity-50
                          `}>
                            <span className="text-white">{tool.icon}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-slate-500">{tool.name}</span>
                              <span className="px-1.5 py-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 rounded-full">
                                {tool.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{tool.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 底部提示 */}
                    <div className="relative px-5 py-3 bg-slate-50/80 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Code className="w-3.5 h-3.5" />
                        <span>更多工具开发中，敬请期待</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 遮罩层 */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
}
