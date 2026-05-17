"use client";
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { ProjectPage } from "@/lib/api";

interface Props {
  pages: ProjectPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (id: string, e: React.MouseEvent) => void;
}

export default function PageList({ pages, selectedIndex, onSelect, onAddPage, onDeletePage }: Props) {
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between shadow-sm relative z-10">
        <h3 className="font-semibold text-slate-800 text-sm">页面列表 ({pages.length})</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scroll">
        {pages.map((page, idx) => (
          <div
            key={page.id}
            onClick={() => onSelect(idx)}
            className={`group relative p-2.5 rounded-xl cursor-pointer transition-all overflow-hidden ${
              selectedIndex === idx
                ? "bg-cyan-50 shadow-sm ring-1 ring-cyan-400"
                : "bg-slate-50 border border-transparent hover:border-slate-300 hover:bg-slate-100"
            }`}
          >
            {/* Active left indicator */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 transition-all ${selectedIndex === idx ? 'opacity-100' : 'opacity-0'}`} />
            <div className="flex items-center gap-3">
              {/* Thumbnail */}
              <div className="w-16 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                {page.image ? (
                  <img src={page.image} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                )}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">
                  {page.title || `第 ${idx + 1} 页`}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {page.clips.length} 个片段
                </div>
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={(e) => onDeletePage(page.id, e)}
              className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              title="删除页面"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        
        {pages.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-xs">
            暂无页面
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <button
          onClick={onAddPage}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border-2 border-dashed border-cyan-200 text-cyan-600 rounded-xl hover:border-cyan-400 hover:bg-cyan-50 hover:shadow-sm transition-all font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          添加新页面
        </button>
      </div>
    </div>
  );
}
