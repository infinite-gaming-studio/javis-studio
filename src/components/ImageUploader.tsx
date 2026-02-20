"use client";
import { useCallback, useState } from "react";
import { fileToBase64 } from "@/lib/api";

interface Props {
    images: string[];
    onChange: (images: string[]) => void;
}

export default function ImageUploader({ images, onChange }: Props) {
    const [dragging, setDragging] = useState(false);

    const handleFiles = useCallback(
        async (files: FileList | null) => {
            if (!files) return;
            const newImages: string[] = [];
            for (const file of Array.from(files)) {
                if (!file.type.startsWith("image/")) continue;
                const b64 = await fileToBase64(file);
                newImages.push(b64);
            }
            onChange([...images, ...newImages]);
        },
        [images, onChange]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
        },
        [handleFiles]
    );

    const remove = (idx: number) => {
        onChange(images.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                输入图片
            </label>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById("img-input")?.click()}
                className={`
          relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed 
          cursor-pointer transition-all duration-200 py-6 px-4 text-center
          ${dragging
                        ? "border-violet-400 bg-violet-500/10 scale-[1.01]"
                        : "border-slate-600 hover:border-slate-400 bg-slate-800/40"
                    }
        `}
            >
                <span className="text-3xl">🖼️</span>
                <p className="text-sm text-slate-400">拖放图片或点击上传</p>
                <p className="text-xs text-slate-600">PNG / JPG / WEBP</p>
                <input
                    id="img-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {/* Preview grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {images.map((src, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden aspect-square bg-slate-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={src}
                                alt={`image-${i}`}
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <button
                                onClick={(e) => { e.stopPropagation(); remove(i); }}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                ✕
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                                <span className="text-xs text-white/70">图 {i + 1}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
