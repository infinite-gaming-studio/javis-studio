"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Settings,
  AlertCircle,
  Layers,
  Sparkles,
} from "lucide-react";

// 动态导入 PDF.js，避免 SSR 问题
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

interface PDFPage {
  id: number;
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface ConversionSettings {
  quality: number;
  scale: number;
  format: "image/png" | "image/jpeg" | "image/webp";
}

const DEFAULT_SETTINGS: ConversionSettings = {
  quality: 1.0,
  scale: 2.0,
  format: "image/png",
};

export default function PDFToImagePage() {
  const [isPdfLibLoaded, setIsPdfLibLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PDFPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 动态加载 PDF.js
  useEffect(() => {
    const loadPdfLib = async () => {
      const pdfModule = await import("pdfjs-dist");
      pdfjsLib = pdfModule;
      // 使用 jsdelivr CDN，更可靠
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfModule.version}/build/pdf.worker.min.mjs`;
      setIsPdfLibLoaded(true);
    };
    loadPdfLib();
  }, []);

  // 处理文件拖放
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      handleFile(droppedFile);
    }
  }, []);

  // 处理粘贴文件
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === "file" && item.type === "application/pdf") {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          handleFile(pastedFile);
          break;
        }
      }
    }
  }, []);

  // 监听粘贴事件
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);

  const handleFile = async (selectedFile: File) => {
    if (!pdfjsLib) return;
    
    setFile(selectedFile);
    setPages([]);
    setCurrentPage(0);
    setIsConverting(true);
    setProgress({ current: 0, total: 0 });

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setProgress({ current: 0, total: totalPages });

      const convertedPages: PDFPage[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: settings.scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        const dataUrl = canvas.toDataURL(settings.format, settings.quality);

        convertedPages.push({
          id: i,
          pageNumber: i,
          dataUrl,
          width: viewport.width,
          height: viewport.height,
        });

        setProgress({ current: i, total: totalPages });
      }

      setPages(convertedPages);
    } catch (error) {
      console.error("PDF conversion error:", error);
    } finally {
      setIsConverting(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      handleFile(selectedFile);
    }
  };

  const clearAll = () => {
    setFile(null);
    setPages([]);
    setCurrentPage(0);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePage = (pageId: number) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    if (currentPage >= pages.length - 1) {
      setCurrentPage(Math.max(0, pages.length - 2));
    }
  };

  const downloadSingle = (page: PDFPage) => {
    const link = document.createElement("a");
    link.href = page.dataUrl;
    const ext = settings.format.split("/")[1];
    link.download = `${file?.name.replace(".pdf", "") || "page"}_page_${page.pageNumber}.${ext}`;
    link.click();
  };

  const downloadAll = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const ext = settings.format.split("/")[1];

    pages.forEach((page) => {
      const base64Data = page.dataUrl.split(",")[1];
      zip.file(`page_${String(page.pageNumber).padStart(3, "0")}.${ext}`, base64Data, {
        base64: true,
      });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${file?.name.replace(".pdf", "") || "pdf"}_images.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatus = () => {
    if (!isPdfLibLoaded) return "idle";
    if (isConverting) return "processing";
    if (pages.length > 0) return "done";
    return "idle";
  };

  const getStatusText = () => {
    if (!isPdfLibLoaded) return "加载中...";
    if (isConverting) return `转换中 ${progress.current}/${progress.total}`;
    if (pages.length > 0) return `${pages.length} 页已转换`;
    return "就绪";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f9ff] via-[#ecfeff] to-[#e0f2fe] text-slate-800 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      {/* Global Header */}
      <GlobalHeader
        showStatus={true}
        status={getStatus()}
        statusText={getStatusText()}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Main Content */}
      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {!file ? (
          /* Upload Area */
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
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-gradient-to-tr from-blue-200/20 to-cyan-200/20 rounded-full blur-3xl" />
            </div>

            <div className="relative flex flex-col items-center justify-center h-full py-20">
              <div className={`
                w-24 h-24 rounded-3xl flex items-center justify-center mb-6
                transition-all duration-500
                ${isDragging 
                  ? "bg-gradient-to-br from-cyan-500 to-blue-500 shadow-xl shadow-cyan-500/30 scale-110" 
                  : "bg-gradient-to-br from-cyan-100 to-blue-100"
                }
              `}>
                <Upload className={`w-12 h-12 transition-colors duration-300 ${isDragging ? "text-white" : "text-cyan-600"}`} />
              </div>
              
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                {!isPdfLibLoaded ? "正在加载组件..." : isDragging ? "释放以上传 PDF" : "拖放 PDF 文件到这里"}
              </h2>
              <p className="text-slate-500 mb-6">{isPdfLibLoaded ? "或点击选择文件 / Ctrl+V 粘贴" : "请稍候"}</p>
              
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">支持格式: PDF</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">高保真输出</span>
                <span className="px-2 py-1 bg-white/60 rounded-md border border-slate-200">支持粘贴</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileInput}
                disabled={!isPdfLibLoaded}
                className="hidden"
              />
            </div>
          </div>
        ) : (
          /* PDF Preview Area */
          <div className="grid grid-cols-12 gap-5 h-[calc(100vh-8rem)]">
            {/* Left Sidebar - Page Thumbnails */}
            <aside className="col-span-3 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 overflow-hidden">
              <div className="p-4 border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-600" />
                  <span className="font-semibold text-sm text-slate-700">页面列表</span>
                </div>
                <span className="text-xs text-slate-400">{pages.length} 页</span>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-2">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    onClick={() => setCurrentPage(index)}
                    className={`
                      group relative p-2 rounded-xl cursor-pointer transition-all duration-200
                      ${currentPage === index 
                        ? "bg-cyan-50 border-2 border-cyan-400 shadow-sm" 
                        : "bg-white border-2 border-transparent hover:border-slate-200 hover:shadow-sm"
                      }
                    `}
                  >
                    <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 mb-2">
                      <img
                        src={page.dataUrl}
                        alt={`Page ${page.pageNumber}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">第 {page.pageNumber} 页</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePage(page.id);
                        }}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-200/60 space-y-2">
                <button
                  onClick={downloadAll}
                  disabled={pages.length === 0 || isConverting}
                  className="w-full py-2.5 rounded-xl text-sm text-white font-semibold transition-all duration-300
                             bg-gradient-to-r from-cyan-500 to-blue-500
                             hover:from-cyan-600 hover:to-blue-600
                             disabled:opacity-50 disabled:cursor-not-allowed
                             shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40
                             flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  下载全部 ({pages.length} 页)
                </button>
                <button
                  onClick={clearAll}
                  className="w-full py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  清空重置
                </button>
              </div>
            </aside>

            {/* Main Preview Area */}
            <section className="col-span-9 flex flex-col rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-xl shadow-cyan-200/40 overflow-hidden">
              {/* Toolbar */}
              <div className="p-4 border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{file.name}</span>
                    <span className="text-xs text-slate-400">{formatFileSize(file.size)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium text-slate-600 min-w-[60px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-2" />
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium text-slate-600 min-w-[80px] text-center">
                    {currentPage + 1} / {pages.length}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                    disabled={currentPage >= pages.length - 1}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-2" />
                  <button
                    onClick={() => pages[currentPage] && downloadSingle(pages[currentPage])}
                    disabled={!pages[currentPage]}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-all disabled:opacity-30"
                  >
                    <Download className="w-4 h-4" />
                    下载当前页
                  </button>
                </div>
              </div>

              {/* Preview Canvas */}
              <div className="flex-1 bg-slate-50/50 overflow-auto custom-scroll p-8 flex items-center justify-center">
                {pages[currentPage] ? (
                  <div
                    className="relative shadow-2xl rounded-lg overflow-hidden bg-white transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <img
                      src={pages[currentPage].dataUrl}
                      alt={`Page ${pages[currentPage].pageNumber}`}
                      className="max-w-full h-auto block"
                    />
                  </div>
                ) : isConverting ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-cyan-600 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium text-slate-700">正在转换 PDF...</p>
                      <p className="text-sm text-slate-400 mt-1">
                        已完成 {progress.current} / {progress.total} 页
                      </p>
                    </div>
                    <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                        style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无预览</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-600" />
                <h3 className="font-semibold text-slate-800">转换设置</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Format Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  输出格式
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["image/png", "image/jpeg", "image/webp"] as const).map((format) => (
                    <button
                      key={format}
                      onClick={() => setSettings((s) => ({ ...s, format }))}
                      className={`
                        py-2 rounded-lg text-sm font-medium transition-all
                        ${settings.format === format
                          ? "bg-cyan-50 text-cyan-600 border-2 border-cyan-400"
                          : "bg-slate-50 text-slate-600 border-2 border-transparent hover:border-slate-200"
                        }
                      `}
                    >
                      {format.split("/")[1].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale Setting */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  输出分辨率 (DPI 倍数)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.5"
                    value={settings.scale}
                    onChange={(e) => setSettings((s) => ({ ...s, scale: parseFloat(e.target.value) }))}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-sm font-medium text-slate-700 min-w-[60px] text-right">
                    {settings.scale}x
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  更高的分辨率会产生更清晰的图片，但文件更大
                </p>
              </div>

              {/* Quality Setting (for JPEG/WebP) */}
              {settings.format !== "image/png" && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    图片质量
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={settings.quality}
                      onChange={(e) => setSettings((s) => ({ ...s, quality: parseFloat(e.target.value) }))}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-sm font-medium text-slate-700 min-w-[60px] text-right">
                      {Math.round(settings.quality * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    推荐使用 PNG 格式以获得最佳质量，或使用 JPEG 格式以减小文件大小。
                    2x 分辨率适合大多数场景，3x-4x 适合需要高保真的设计稿。
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2.5 rounded-xl text-sm text-white font-semibold transition-all duration-300
                           bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600
                           shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/40"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
