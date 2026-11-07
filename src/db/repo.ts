import { getDB } from './db';
import { newProject, normalizeProject } from './defaults';
import type {
  Activity,
  Conversation,
  FileCategory,
  FileMeta,
  ID,
  Mistake,
  PlanStudy,
  Project,
  Revision,
  Settings,
  SubjectProgress,
  Task,
} from './types';
import { uid } from '../lib/id';

// ---------------------------------------------------------------------------
// Change notifications (so open screens refresh after writes elsewhere)
// ---------------------------------------------------------------------------
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS: Settings = {
  welcomeSeen: false,
  aiEndpoint: '',
  aiToken: '',
  currentProjectId: null,
  lastBackupAt: 0,
};

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const s = (await db.get('meta', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDB();
  const next = { ...(await getSettings()), ...patch };
  await db.put('meta', next, 'settings');
  emit();
  return next;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
export async function logActivity(text: string, projectId: ID | null = null): Promise<void> {
  const db = await getDB();
  const a: Activity = { id: uid(), projectId, at: Date.now(), text };
  await db.put('activity', a);
}

export async function recentActivity(limit = 12): Promise<Activity[]> {
  const db = await getDB();
  const out: Activity[] = [];
  let cursor = await db.transaction('activity').store.index('byAt').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value as Activity);
    cursor = await cursor.continue();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export async function listProjects(): Promise<Project[]> {
  const db = await getDB();
  const all = (await db.getAll('projects')) as Project[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: ID): Promise<Project | undefined> {
  const db = await getDB();
  const p = (await db.get('projects', id)) as Project | undefined;
  return p ? normalizeProject(p) : undefined;
}

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_REVISIONS = 40;

export async function saveProject(p: Project, opts: { snapshot?: boolean } = { snapshot: true }): Promise<Project> {
  const db = await getDB();
  const next = { ...p, updatedAt: Date.now() };
  await db.put('projects', next);
  if (opts.snapshot) await maybeSnapshot(next);
  emit();
  return next;
}

export async function createProject(partial: Partial<Project> = {}): Promise<Project> {
  const p = newProject(partial);
  const db = await getDB();
  await db.put('projects', p);
  await addRevision(p, 'إنشاء المشروع');
  await logActivity(`أنشأتِ مشروع «${p.name}»`, p.id);
  await updateSettings({ currentProjectId: p.id });
  return p;
}

export async function duplicateProject(id: ID): Promise<Project | undefined> {
  const src = await getProject(id);
  if (!src) return undefined;
  const db = await getDB();
  const copy: Project = {
    ...structuredClone(src),
    id: uid(),
    name: `${src.name} (نسخة)`,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // Copy files (metadata + blobs), keeping version groups intact.
  const files = await listFiles(id);
  const sheetMap = new Map<string, string>();
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (!sheetMap.has(f.sheetId)) sheetMap.set(f.sheetId, uid());
    const newId = uid();
    fileMap.set(f.id, newId);
    const blob = await db.get('blobs', f.id);
    const thumb = await db.get('thumbs', f.id);
    await db.put('files', { ...f, id: newId, projectId: copy.id, sheetId: sheetMap.get(f.sheetId)! });
    if (blob) await db.put('blobs', { id: newId, blob: blob.blob });
    if (thumb) await db.put('thumbs', { id: newId, blob: thumb.blob });
  }
  if (copy.coverFileId) copy.coverFileId = fileMap.get(copy.coverFileId);
  copy.concept.options = copy.concept.options.map((o) => ({
    ...o,
    imageFileId: o.imageFileId ? fileMap.get(o.imageFileId) : undefined,
  }));
  await db.put('projects', copy);
  await addRevision(copy, `نسخة من «${src.name}»`);
  await logActivity(`أنشأتِ نسخة من مشروع «${src.name}»`, copy.id);
  emit();
  return copy;
}

export async function setProjectStatus(id: ID, status: Project['status']): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  await saveProject({ ...p, status }, { snapshot: false });
  await logActivity(status === 'archived' ? `أرشفتِ «${p.name}»` : `أعدتِ «${p.name}» من الأرشيف`, id);
  emit();
}

export async function deleteProject(id: ID): Promise<void> {
  const db = await getDB();
  const p = await getProject(id);
  const files = await listFiles(id);
  const tx = db.transaction(['projects', 'files', 'blobs', 'thumbs', 'tasks', 'revisions', 'conversations', 'activity'], 'readwrite');
  for (const f of files) {
    tx.objectStore('files').delete(f.id);
    tx.objectStore('blobs').delete(f.id);
    tx.objectStore('thumbs').delete(f.id);
  }
  for (const store of ['tasks', 'revisions', 'conversations', 'activity'] as const) {
    const keys = await tx.objectStore(store).index('byProject').getAllKeys(id);
    for (const k of keys) tx.objectStore(store).delete(k);
  }
  tx.objectStore('projects').delete(id);
  await tx.done;
  const s = await getSettings();
  if (s.currentProjectId === id) await updateSettings({ currentProjectId: null });
  if (p) await logActivity(`حذفتِ مشروع «${p.name}»`);
  emit();
}

// ---------------------------------------------------------------------------
// Revisions (project history)
// ---------------------------------------------------------------------------
export async function addRevision(p: Project, label: string): Promise<void> {
  const db = await getDB();
  const r: Revision = { id: uid(), projectId: p.id, at: Date.now(), label, snapshot: structuredClone(p) };
  await db.put('revisions', r);
  await pruneRevisions(p.id);
}

async function pruneRevisions(projectId: ID) {
  const list = await listRevisions(projectId);
  if (list.length <= MAX_REVISIONS) return;
  const db = await getDB();
  for (const r of list.slice(MAX_REVISIONS)) await db.delete('revisions', r.id);
}

async function maybeSnapshot(p: Project) {
  const list = await listRevisions(p.id);
  const last = list[0];
  if (!last || Date.now() - last.at > SNAPSHOT_INTERVAL_MS) {
    await addRevision(p, 'حفظ تلقائي');
  }
}

export async function listRevisions(projectId: ID): Promise<Revision[]> {
  const db = await getDB();
  const all = (await db.getAllFromIndex('revisions', 'byProject', projectId)) as Revision[];
  return all.sort((a, b) => b.at - a.at);
}

export async function restoreRevision(rev: Revision): Promise<Project> {
  const current = await getProject(rev.projectId);
  if (current) await addRevision(current, 'قبل الاستعادة');
  const restored = normalizeProject({ ...rev.snapshot, updatedAt: Date.now() });
  const db = await getDB();
  await db.put('projects', restored);
  await logActivity(`استعدتِ نسخة سابقة من «${restored.name}»`, restored.id);
  emit();
  return restored;
}

// ---------------------------------------------------------------------------
// Files (drawings, images, PDFs)
// ---------------------------------------------------------------------------
export const MAX_FILE_BYTES = 80 * 1024 * 1024;

export interface AddFileInput {
  projectId: ID;
  blob: Blob;
  name: string;
  category: FileCategory;
  title?: string;
  sheetId?: ID; // pass to add a new version of an existing drawing
  note?: string;
  thumb?: Blob | null;
  width?: number;
  height?: number;
}

export async function addFile(input: AddFileInput): Promise<FileMeta> {
  if (input.blob.size > MAX_FILE_BYTES) {
    throw new Error(`الملف أكبر من ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} ميغابايت.`);
  }
  const db = await getDB();
  let version = 1;
  const sheetId = input.sheetId ?? uid();
  let inherited: FileMeta | undefined;
  if (input.sheetId) {
    const versions = (await db.getAllFromIndex('files', 'bySheet', input.sheetId)) as FileMeta[];
    version = versions.reduce((m, f) => Math.max(m, f.version), 0) + 1;
    inherited = versions[0];
  }
  const meta: FileMeta = {
    id: uid(),
    projectId: input.projectId,
    category: inherited?.category ?? input.category,
    sheetId,
    title: inherited?.title ?? (input.title?.trim() || input.name.replace(/\.[^.]+$/, '')),
    version,
    name: input.name,
    mime: input.blob.type || guessMime(input.name),
    size: input.blob.size,
    width: input.width,
    height: input.height,
    createdAt: Date.now(),
    note: input.note ?? '',
  };
  const tx = db.transaction(['files', 'blobs', 'thumbs'], 'readwrite');
  tx.objectStore('files').put(meta);
  tx.objectStore('blobs').put({ id: meta.id, blob: input.blob });
  if (input.thumb) tx.objectStore('thumbs').put({ id: meta.id, blob: input.thumb });
  await tx.done;
  await logActivity(
    version > 1 ? `أضفتِ النسخة ${version} من «${meta.title}»` : `رفعتِ «${meta.title}»`,
    input.projectId,
  );
  emit();
  return meta;
}

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

export async function listFiles(projectId: ID): Promise<FileMeta[]> {
  const db = await getDB();
  const all = (await db.getAllFromIndex('files', 'byProject', projectId)) as FileMeta[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function recentFiles(limit = 8): Promise<FileMeta[]> {
  const db = await getDB();
  const out: FileMeta[] = [];
  let cursor = await db.transaction('files').store.index('byCreated').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value as FileMeta);
    cursor = await cursor.continue();
  }
  return out;
}

export async function getFileMeta(id: ID): Promise<FileMeta | undefined> {
  const db = await getDB();
  return (await db.get('files', id)) as FileMeta | undefined;
}

export async function getBlob(id: ID): Promise<Blob | undefined> {
  const db = await getDB();
  return ((await db.get('blobs', id)) as { blob: Blob } | undefined)?.blob;
}

export async function getThumb(id: ID): Promise<Blob | undefined> {
  const db = await getDB();
  return ((await db.get('thumbs', id)) as { blob: Blob } | undefined)?.blob;
}

export async function updateFileMeta(id: ID, patch: Partial<Pick<FileMeta, 'title' | 'category' | 'note'>>): Promise<void> {
  const db = await getDB();
  const f = (await db.get('files', id)) as FileMeta | undefined;
  if (!f) return;
  const next = { ...f, ...patch };
  // Keep the title consistent across all versions of a sheet.
  if (patch.title || patch.category) {
    const siblings = (await db.getAllFromIndex('files', 'bySheet', f.sheetId)) as FileMeta[];
    for (const s of siblings) {
      if (s.id === id) continue;
      await db.put('files', { ...s, title: next.title, category: next.category });
    }
  }
  await db.put('files', next);
  emit();
}

export async function deleteFile(id: ID): Promise<void> {
  const db = await getDB();
  const f = (await db.get('files', id)) as FileMeta | undefined;
  const tx = db.transaction(['files', 'blobs', 'thumbs'], 'readwrite');
  tx.objectStore('files').delete(id);
  tx.objectStore('blobs').delete(id);
  tx.objectStore('thumbs').delete(id);
  await tx.done;
  if (f) await logActivity(`حذفتِ «${f.title}» (نسخة ${f.version})`, f.projectId);
  emit();
}

// ---------------------------------------------------------------------------
// Tasks & deadlines
// ---------------------------------------------------------------------------
export async function listTasks(projectId?: ID | null): Promise<Task[]> {
  const db = await getDB();
  let all = (await db.getAll('tasks')) as Task[];
  // null projectId = general (non-project) task; null keys are not indexed, so filter manually.
  if (projectId !== undefined) all = all.filter((t) => t.projectId === projectId);
  return all.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt);
}

export async function saveTask(t: Task): Promise<void> {
  const db = await getDB();
  await db.put('tasks', t);
  emit();
}

export async function deleteTask(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete('tasks', id);
  emit();
}

// ---------------------------------------------------------------------------
// Academy: subject tracking & mistake notebook
// ---------------------------------------------------------------------------
export async function getSubjectProgress(subjectId: string): Promise<SubjectProgress | undefined> {
  const db = await getDB();
  return (await db.get('subjects', subjectId)) as SubjectProgress | undefined;
}

export async function listSubjectProgress(): Promise<SubjectProgress[]> {
  const db = await getDB();
  return (await db.getAll('subjects')) as SubjectProgress[];
}

export async function saveSubjectProgress(sp: SubjectProgress): Promise<void> {
  const db = await getDB();
  await db.put('subjects', { ...sp, updatedAt: Date.now() });
  emit();
}

export async function listMistakes(): Promise<Mistake[]> {
  const db = await getDB();
  const all = (await db.getAll('mistakes')) as Mistake[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveMistake(m: Mistake): Promise<void> {
  const db = await getDB();
  await db.put('mistakes', m);
  emit();
}

export async function deleteMistake(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete('mistakes', id);
  emit();
}

// ---------------------------------------------------------------------------
// AI conversations
// ---------------------------------------------------------------------------
export async function listConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = (await db.getAll('conversations')) as Conversation[];
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export async function saveConversation(c: Conversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', { ...c, updatedAt: Date.now() });
  emit();
}

export async function deleteConversation(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
  emit();
}

// ---------------------------------------------------------------------------
// Plan studies (massing lab)
// ---------------------------------------------------------------------------
export async function listStudies(): Promise<PlanStudy[]> {
  const db = await getDB();
  const all = (await db.getAll('studies')) as PlanStudy[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getStudy(id: ID): Promise<PlanStudy | undefined> {
  const db = await getDB();
  return (await db.get('studies', id)) as PlanStudy | undefined;
}

export async function createStudy(study: PlanStudy, source: Blob): Promise<PlanStudy> {
  const db = await getDB();
  const tx = db.transaction(['studies', 'blobs'], 'readwrite');
  tx.objectStore('blobs').put({ id: study.sourceBlobId, blob: source });
  tx.objectStore('studies').put(study);
  await tx.done;
  await logActivity(`بدأتِ دراسة كتلة «${study.title}»`, study.projectId);
  emit();
  return study;
}

export async function saveStudy(study: PlanStudy): Promise<void> {
  const db = await getDB();
  await db.put('studies', { ...study, updatedAt: Date.now() });
  emit();
}

export async function deleteStudy(id: ID): Promise<void> {
  const db = await getDB();
  const s = (await db.get('studies', id)) as PlanStudy | undefined;
  const tx = db.transaction(['studies', 'blobs'], 'readwrite');
  tx.objectStore('studies').delete(id);
  if (s) tx.objectStore('blobs').delete(s.sourceBlobId);
  await tx.done;
  emit();
}
