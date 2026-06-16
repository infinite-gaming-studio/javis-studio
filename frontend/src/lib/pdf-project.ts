// PDF-to-Video project types and persistence helpers.
// Reuses db.ts IndexedDB layer (same DB, separate project type).

import {
  dbSaveProject,
  dbLoadProject,
  dbListProjects,
  dbDeleteProject,
  dbSaveTempData,
  dbLoadTempData,
  isIndexedDBAvailable,
} from "./db";

import type { ProjectMeta } from "./db";
export type { ProjectMeta };

// ─── Data types (serializable subset of page state) ──────────────────────────

export interface PDFPageData {
  id: number;
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PDFCharacterData {
  id: string;
  name: string;
  color: string;
  spkAudioPrompt: string;
  spkAudioName: string;
  emoAlpha?: number;
  speed?: number;
}

export interface PDFSegmentData {
  id: string;
  speakerId: string;
  text: string;
  emotionMode: string;
  emoAlpha: number;
  emoVector: number[];
  emoText: string;
  speed: number;
  audioUrl?: string;
  durationSecs?: number;
  isDone: boolean;
}

export interface PDFPageSegmentData {
  pageId: number;
  segments: PDFSegmentData[];
}

export interface PDFRenderConfig {
  transitionType: string;
  transitionDuration: number;
  enableSubtitles: boolean;
}

export interface PDFProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  topic: string;
  fileName: string;
  fileSize: number;
  pages: PDFPageData[];
  characters: PDFCharacterData[];
  pageSegments: PDFPageSegmentData[];
  renderConfig: PDFRenderConfig;
  aiPrompt: string;
  videoFileName: string;
}

// ─── Serialization helpers ───────────────────────────────────────────────────

export interface PDFProjectSnapshot {
  fileName: string;
  fileSize: number;
  pages: PDFPageData[];
  characters: PDFCharacterData[];
  pageSegments: PDFPageSegmentData[];
  renderConfig: PDFRenderConfig;
  aiPrompt: string;
  videoFileName: string;
}

export function createProjectSnapshot(
  fileName: string,
  fileSize: number,
  pages: PDFPageData[],
  characters: PDFCharacterData[],
  pageSegments: Map<number, any[]>,
  renderConfig: PDFRenderConfig,
  aiPrompt: string,
  videoFileName: string,
): PDFProjectSnapshot {
  const segArr: PDFPageSegmentData[] = [];
  for (const [pageId, segs] of pageSegments) {
    segArr.push({
      pageId,
      segments: segs.map(s => ({
        id: s.id,
        speakerId: s.speakerId,
        text: s.text,
        emotionMode: s.emotionMode,
        emoAlpha: s.emoAlpha,
        emoVector: s.emoVector,
        emoText: s.emoText,
        speed: s.speed,
        audioUrl: s.audioUrl,
        durationSecs: s.durationSecs,
        isDone: s.isDone,
      })),
    });
  }
  return { fileName, fileSize, pages, characters, pageSegments: segArr, renderConfig, aiPrompt, videoFileName };
}

export interface ProjectStateRestore {
  pages: PDFPageData[];
  characters: PDFCharacterData[];
  pageSegments: Map<number, any[]>;
  aiPrompt: string;
  transitionType: string;
  transitionDuration: number;
  enableSubtitles: boolean;
  videoFileName: string;
}

export function restoreStateFromProject(project: PDFProject): ProjectStateRestore {
  const segMap = new Map<number, any[]>();
  for (const ps of project.pageSegments || []) {
    segMap.set(ps.pageId, ps.segments as any[]);
  }
  return {
    pages: project.pages || [],
    characters: project.characters || [],
    pageSegments: segMap,
    aiPrompt: project.aiPrompt || "",
    transitionType: project.renderConfig?.transitionType || "fade",
    transitionDuration: project.renderConfig?.transitionDuration || 1.0,
    enableSubtitles: project.renderConfig?.enableSubtitles ?? true,
    videoFileName: project.videoFileName || "",
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const TEMP_KEY = "pdf_to_video_temp";

export async function saveProjectToDB(
  projectId: string | null,
  projectName: string,
  snapshot: PDFProjectSnapshot,
): Promise<string> {
  const now = new Date().toISOString();
  const id = projectId || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  const name = projectName.trim() || `未命名项目 ${new Date().toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  const project: PDFProject = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    topic: "",
    ...snapshot,
  };

  await dbSaveProject(project);
  return id;
}

export async function loadProjectFromDB(id: string): Promise<PDFProject | null> {
  return dbLoadProject<PDFProject>(id);
}

export function listProjects(): Promise<ProjectMeta[]> {
  return dbListProjects();
}

export function deleteProjectFromDB(id: string): Promise<void> {
  return dbDeleteProject(id);
}

export async function saveTempSnapshot(snapshot: PDFProjectSnapshot): Promise<void> {
  await dbSaveTempData(TEMP_KEY, snapshot);
}

export async function loadTempSnapshot(): Promise<PDFProjectSnapshot | null> {
  return dbLoadTempData<PDFProjectSnapshot>(TEMP_KEY);
}

export { isIndexedDBAvailable };
