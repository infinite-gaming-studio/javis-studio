"use client";
import { useCallback, useState } from "react";
import { Image as ImageIcon, X, GripVertical } from "lucide-react";
import { fileToBase64 } from "@/lib/api";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
    images: string[];
    onChange: (images: string[]) => void;
}

interface SortableImageProps {
    id: string;
    url: string;
    index: number;
    onRemove: (index: number) => void;
}

function SortableImage({ id, url, index, onRemove }: SortableImageProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group rounded-lg overflow-hidden aspect-square bg-slate-100 border border-slate-200 ${isDragging ? "opacity-50" : ""
                }`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={url}
                alt={`image-${index}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />

            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-1 left-1 bg-black/40 hover:bg-black/60 text-white rounded p-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Remove Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(index);
                }}
                className="absolute top-1 right-1 bg-black/40 hover:bg-red-500 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
            >
                <X className="w-3.5 h-3.5" />
            </button>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                <span className="text-[10px] font-medium text-white/90">图 {index + 1}</span>
            </div>
        </div>
    );
}

export default function ImageUploader({ images, onChange }: Props) {
    const [dragging, setDragging] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleFiles = useCallback(
        async (files: FileList | File[] | null) => {
            if (!files) return;
            const newImages: string[] = [];
            const remaining = 6 - images.length;
            if (remaining <= 0) return;

            const filesArray = Array.from(files).slice(0, remaining);

            for (const file of filesArray) {
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

    const onPaste = useCallback(
        (e: React.ClipboardEvent) => {
            const items = e.clipboardData.items;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) files.push(blob);
                }
            }
            if (files.length > 0) {
                handleFiles(files);
            }
        },
        [handleFiles]
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = images.indexOf(active.id as string);
            const newIndex = images.indexOf(over.id as string);
            onChange(arrayMove(images, oldIndex, newIndex));
        }
    };

    const remove = (idx: number) => {
        onChange(images.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    输入图片
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                    {images.length} / 6
                </span>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onPaste={onPaste}
                tabIndex={0}
                onClick={() => document.getElementById("img-input")?.click()}
                className={`
                    relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed 
                    cursor-pointer transition-all duration-200 py-6 px-4 text-center focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    ${dragging
                        ? "border-cyan-400 bg-cyan-50 shadow-inner scale-[1.01]"
                        : "border-slate-200 hover:border-cyan-300 bg-white/50 hover:bg-cyan-50/50"
                    }
                `}
            >
                <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center mb-1">
                    <ImageIcon className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-600">拖放图片、粘贴或点击上传</p>
                    <p className="text-[10px] text-slate-400 mt-1">支持 PNG, JPG, WEBP (最多 6 张)</p>
                </div>
                <input
                    id="img-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {/* Preview grid with Drag and Drop */}
            {images.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={images}
                        strategy={rectSortingStrategy}
                    >
                        <div className="grid grid-cols-3 gap-3">
                            {images.map((src, i) => (
                                <SortableImage
                                    key={src}
                                    id={src}
                                    url={src}
                                    index={i}
                                    onRemove={remove}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}
