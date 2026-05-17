/**
 * IndexedDB wrapper for persistent project storage.
 * Replaces localStorage which has a ~5MB quota limit causing history data loss.
 *
 * Storage layout:
 *   DB: javis_studio_db  (version 1)
 *   Stores:
 *     - projects: full ProjectHistory objects, keyed by `id`
 *     - meta: lightweight index records (id, name, updatedAt, topic) for fast listing
 */

const DB_NAME = "javis_studio_db";
const DB_VERSION = 2;
const STORE_PROJECTS = "projects";
const STORE_META = "meta";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        const metaStore = db.createObjectStore(STORE_META, { keyPath: "id" });
        metaStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("kv_store")) {
        db.createObjectStore("kv_store");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (stores: IDBObjectStore[]) => IDBRequest<T> | Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(names, mode);
    const stores = names.map((n) => transaction.objectStore(n));
    transaction.onerror = () => reject(transaction.error);

    try {
      const result = fn(stores);
      if (result instanceof IDBRequest) {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      } else {
        result.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  topic: string;
  pageCount: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save or update a project (both full data and meta index). */
export async function dbSaveProject<T extends { id: string; name: string; updatedAt: string; createdAt: string; topic: string; pages: unknown[] }>(
  project: T
): Promise<void> {
  const db = await openDB();
  const meta: ProjectMeta = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    topic: project.topic,
    pageCount: project.pages.length,
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS, STORE_META], "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    transaction.objectStore(STORE_PROJECTS).put(project);
    transaction.objectStore(STORE_META).put(meta);
  });
}

/** Load a single project by ID (full data). */
export async function dbLoadProject<T>(id: string): Promise<T | null> {
  const db = await openDB();
  return tx<T | null>(db, STORE_PROJECTS, "readonly", ([store]) =>
    store.get(id) as IDBRequest<T | null>
  );
}

/** List all project meta records, sorted newest first. */
export async function dbListProjects(): Promise<ProjectMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_META, "readonly");
    const store = transaction.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => {
      const items: ProjectMeta[] = req.result || [];
      items.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete a project by ID (both stores). */
export async function dbDeleteProject(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS, STORE_META], "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    transaction.objectStore(STORE_PROJECTS).delete(id);
    transaction.objectStore(STORE_META).delete(id);
  });
}

/** Save temporary data to IndexedDB (bypassing sessionStorage limits). */
export async function dbSaveTempData(key: string, data: any): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("kv_store", "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore("kv_store").put(data, key);
  });
}

/** Load temporary data from IndexedDB. */
export async function dbLoadTempData<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction("kv_store", "readonly");
    const request = transaction.objectStore("kv_store").get(key);
    request.onsuccess = () => resolve(request.result as T || null);
    request.onerror = () => reject(request.error);
  });
}

/** Check if IndexedDB is available (SSR guard). */
export function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}
