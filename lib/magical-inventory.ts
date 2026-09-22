'use client'

/**
 * Local "Magical Inventory" storage.
 *
 * A browser page cannot silently write to the user's Desktop — that is a hard
 * security boundary. The File System Access API is the only real mechanism:
 * the user grants a base directory once (they can pick their Desktop), and we
 * create `Magical Inventory/<stream start>/` inside it and write the session
 * files there. The chosen directory handle is remembered in IndexedDB so the
 * user only picks once. Browsers without the API fall back to file downloads.
 */

export const ROOT_FOLDER = 'Magical Inventory'

type PermissionMode = 'read' | 'readwrite'

// The File System Access API isn't fully described by lib.dom, so we model the
// slice we use ourselves to keep the module self-contained and type-safe.
type WritableStream = {
  write: (data: Blob | string) => Promise<void>
  close: () => Promise<void>
}
type FileHandle = {
  createWritable: () => Promise<WritableStream>
  getFile: () => Promise<File>
}
export type DirHandle = {
  name: string
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandle>
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FileHandle>
  queryPermission?: (o: { mode: PermissionMode }) => Promise<PermissionState>
  requestPermission?: (o: { mode: PermissionMode }) => Promise<PermissionState>
}

export function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Filesystem-safe timestamp, e.g. "2026-09-22_14-30-05". */
export function sessionFolderName(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  )
}

export async function pickBaseDirectory(): Promise<DirHandle | null> {
  if (!fsAccessSupported()) return null
  const w = window as unknown as {
    showDirectoryPicker: (o?: Record<string, unknown>) => Promise<DirHandle>
  }
  try {
    return await w.showDirectoryPicker({ id: 'magical-inventory', mode: 'readwrite', startIn: 'desktop' })
  } catch {
    // User dismissed the picker.
    return null
  }
}

async function ensurePermission(handle: DirHandle): Promise<boolean> {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  if (!handle.requestPermission) return false
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

async function writeFile(dir: DirHandle, name: string, data: Blob | string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const writable = await fh.createWritable()
  await writable.write(data)
  await writable.close()
}

export type SessionSave = {
  start: Date
  durationSec: number
  transcript: string
  demo: boolean
  listing?: unknown
  recording?: Blob | null
  frames?: string[] // JPEG data URLs
}

export type SaveResult = { path: string; folder: string; wroteRecording: boolean; frameCount: number }

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
  if (!m) return null
  const bytes = atob(m[2])
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: m[1] })
}

function sessionMeta(data: SessionSave) {
  return {
    startedAt: data.start.toISOString(),
    durationSeconds: data.durationSec,
    mode: data.demo ? 'demo' : 'live',
    words: data.transcript.trim() ? data.transcript.trim().split(/\s+/).length : 0,
    savedAt: new Date().toISOString(),
  }
}

/**
 * Writes the session into `<base>/Magical Inventory/<stream start>/`, creating
 * folders as needed, and appends to a root `index.json` acting as a simple
 * local database of all sessions.
 */
export async function saveSessionToDirectory(base: DirHandle, data: SessionSave): Promise<SaveResult> {
  if (!(await ensurePermission(base))) {
    throw new Error('Permission to write to the chosen folder was denied.')
  }

  const root = await base.getDirectoryHandle(ROOT_FOLDER, { create: true })
  const folder = sessionFolderName(data.start)
  const dir = await root.getDirectoryHandle(folder, { create: true })

  const meta = sessionMeta(data)

  await writeFile(dir, 'transcript.txt', data.transcript || '(no speech captured during the stream)')
  await writeFile(dir, 'transcript.json', JSON.stringify({ ...meta, transcript: data.transcript }, null, 2))
  await writeFile(dir, 'session.json', JSON.stringify(meta, null, 2))

  if (data.listing) {
    await writeFile(dir, 'listing.json', JSON.stringify(data.listing, null, 2))
  }

  let wroteRecording = false
  if (data.recording && data.recording.size > 0) {
    const ext = data.recording.type.includes('mp4') ? 'mp4' : 'webm'
    await writeFile(dir, `recording.${ext}`, data.recording)
    wroteRecording = true
  }

  let frameCount = 0
  if (data.frames?.length) {
    const framesDir = await dir.getDirectoryHandle('frames', { create: true })
    for (let i = 0; i < data.frames.length; i++) {
      const blob = dataUrlToBlob(data.frames[i])
      if (!blob) continue
      await writeFile(framesDir, `frame-${(i + 1).toString().padStart(2, '0')}.jpg`, blob)
      frameCount++
    }
  }

  await appendIndex(root, { folder, ...meta, recording: wroteRecording, frames: frameCount })

  return { path: `${ROOT_FOLDER}/${folder}`, folder, wroteRecording, frameCount }
}

async function appendIndex(root: DirHandle, entry: Record<string, unknown>): Promise<void> {
  let list: unknown[] = []
  try {
    const fh = await root.getFileHandle('index.json', { create: false })
    const parsed = JSON.parse(await (await fh.getFile()).text())
    if (Array.isArray(parsed)) list = parsed
  } catch {
    // No index yet — start a fresh one.
  }
  list.push(entry)
  await writeFile(root, 'index.json', JSON.stringify(list, null, 2))
}

/** Fallback for browsers without the File System Access API. */
export function downloadSessionFiles(data: SessionSave): void {
  const prefix = `${ROOT_FOLDER} - ${sessionFolderName(data.start)}`
  triggerDownload(new Blob([data.transcript || '(no speech captured)'], { type: 'text/plain' }), `${prefix} - transcript.txt`)
  triggerDownload(
    new Blob([JSON.stringify({ ...sessionMeta(data), transcript: data.transcript }, null, 2)], {
      type: 'application/json',
    }),
    `${prefix} - transcript.json`,
  )
  if (data.listing) {
    triggerDownload(new Blob([JSON.stringify(data.listing, null, 2)], { type: 'application/json' }), `${prefix} - listing.json`)
  }
  if (data.recording && data.recording.size > 0) {
    const ext = data.recording.type.includes('mp4') ? 'mp4' : 'webm'
    triggerDownload(data.recording, `${prefix} - recording.${ext}`)
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// --- Remembering the chosen directory across reloads (IndexedDB) ---

const DB_NAME = 'magical-inventory'
const STORE = 'handles'
const KEY = 'baseDir'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function rememberBaseDirectory(handle: DirHandle): Promise<void> {
  try {
    const db = await openDb()
    // FileSystemDirectoryHandle is structured-cloneable, so it persists as-is.
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY)
  } catch {
    // Non-fatal — the folder just won't be remembered next time.
  }
}

export async function loadRememberedDirectory(): Promise<DirHandle | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as DirHandle) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}
