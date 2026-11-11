import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { getDB } from './db';
import { DATA_VERSION } from './migrations';
import { normalizeProject } from './defaults';
import type { FileMeta, PlanStudy, Project, Settings } from './types';
import type { EditorModel } from '../editor/model';

export const BACKUP_APP_ID = 'joudy-architecture-studio';
export const BACKUP_FORMAT = 1;

const RECORD_STORES = ['projects', 'files', 'tasks', 'activity', 'revisions', 'subjects', 'mistakes', 'conversations', 'studies', 'models'] as const;
type RecordStore = (typeof RECORD_STORES)[number];

export interface BackupManifest {
  app: string;
  format: number;
  dataVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
}

export interface BackupData {
  settings: Partial<Settings>;
  stores: Record<RecordStore, unknown[]>;
}

/** Build a .zip backup containing every record and every stored file. */
export async function createBackup(): Promise<{ bytes: Uint8Array; manifest: BackupManifest }> {
  const db = await getDB();
  const stores = {} as Record<RecordStore, unknown[]>;
  for (const s of RECORD_STORES) stores[s] = await db.getAll(s);

  const settings = { ...((await db.get('meta', 'settings')) as Settings | undefined) };
  // The AI access token is a credential: never written into backup files.
  delete (settings as Partial<Settings>).aiToken;

  const zip: Zippable = {};
  for (const f of stores.files as FileMeta[]) {
    const b = (await db.get('blobs', f.id)) as { blob: Blob } | undefined;
    if (b) zip[`blobs/${f.id}`] = [new Uint8Array(await b.blob.arrayBuffer()), { level: 0 }];
    const t = (await db.get('thumbs', f.id)) as { blob: Blob } | undefined;
    if (t) zip[`thumbs/${f.id}`] = [new Uint8Array(await t.blob.arrayBuffer()), { level: 0 }];
  }
  for (const em of stores.models as EditorModel[]) {
    const ids = new Set<string>();
    if (em.reference) ids.add(em.reference.blobId);
    for (const v of em.versions ?? []) if (v.snapshot.reference) ids.add(v.snapshot.reference.blobId);
    for (const id of ids) {
      const b = (await db.get('blobs', id)) as { blob: Blob } | undefined;
      if (b) zip[`blobs/${id}`] = [new Uint8Array(await b.blob.arrayBuffer()), { level: 0 }];
    }
  }
  for (const st of stores.studies as PlanStudy[]) {
    const b = (await db.get('blobs', st.sourceBlobId)) as { blob: Blob } | undefined;
    if (b) zip[`blobs/${st.sourceBlobId}`] = [new Uint8Array(await b.blob.arrayBuffer()), { level: 0 }];
  }

  const manifest: BackupManifest = {
    app: BACKUP_APP_ID,
    format: BACKUP_FORMAT,
    dataVersion: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(RECORD_STORES.map((s) => [s, stores[s].length])),
  };
  const data: BackupData = { settings, stores };
  zip['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  zip['data.json'] = strToU8(JSON.stringify(data));
  return { bytes: zipSync(zip, { level: 6 }), manifest };
}

export interface ImportResult {
  manifest: BackupManifest;
  counts: Record<string, number>;
  missingFiles: number;
}

/** Parse and validate a backup without writing anything. */
export function readBackup(bytes: Uint8Array): { manifest: BackupManifest; data: BackupData; files: Record<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('الملف ليس نسخة احتياطية صالحة (تعذّر فك الضغط).');
  }
  if (!entries['manifest.json'] || !entries['data.json']) {
    throw new Error('الملف لا يحتوي على بيانات جودي ستوديو.');
  }
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as BackupManifest;
  if (manifest.app !== BACKUP_APP_ID) throw new Error('هذه النسخة الاحتياطية ليست من تطبيق جودي ستوديو.');
  if (manifest.format > BACKUP_FORMAT || manifest.dataVersion > DATA_VERSION) {
    throw new Error('هذه النسخة الاحتياطية من إصدار أحدث من التطبيق. حدّثي التطبيق أولاً.');
  }
  const data = JSON.parse(strFromU8(entries['data.json'])) as BackupData;
  return { manifest, data, files: entries };
}

/**
 * Restore a backup.
 * - "merge": records with the same id are overwritten; everything else is kept.
 * - "replace": all existing data (except the AI token) is cleared first.
 */
export async function importBackup(bytes: Uint8Array, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const { manifest, data, files } = readBackup(bytes);
  const db = await getDB();
  const all = [...RECORD_STORES, 'blobs', 'thumbs', 'meta'] as const;
  const currentSettings = ((await db.get('meta', 'settings')) as Settings | undefined) ?? undefined;

  const tx = db.transaction(all as unknown as string[], 'readwrite');
  if (mode === 'replace') {
    for (const s of [...RECORD_STORES, 'blobs', 'thumbs'] as const) tx.objectStore(s).clear();
  }
  const counts: Record<string, number> = {};
  let missingFiles = 0;
  for (const s of RECORD_STORES) {
    const rows = (data.stores?.[s] ?? []) as Record<string, unknown>[]; // older backups have no 'studies'
    counts[s] = rows.length;
    for (const row of rows) {
      if (s === 'projects') {
        tx.objectStore(s).put(normalizeProject(row as unknown as Project));
      } else if (s === 'files') {
        const f = row as unknown as FileMeta;
        const blobBytes = files[`blobs/${f.id}`];
        if (!blobBytes) {
          missingFiles++;
          continue;
        }
        tx.objectStore('files').put(f);
        tx.objectStore('blobs').put({ id: f.id, blob: new Blob([blobBytes], { type: f.mime }) });
        const th = files[`thumbs/${f.id}`];
        if (th) tx.objectStore('thumbs').put({ id: f.id, blob: new Blob([th], { type: 'image/jpeg' }) });
      } else if (s === 'models') {
        const em = row as unknown as EditorModel;
        const refs = new Map<string, string>();
        if (em.reference) refs.set(em.reference.blobId, em.reference.mime);
        for (const v of em.versions ?? []) if (v.snapshot.reference) refs.set(v.snapshot.reference.blobId, v.snapshot.reference.mime);
        for (const [id, mime] of refs) {
          const bytes = files[`blobs/${id}`];
          if (bytes) tx.objectStore('blobs').put({ id, blob: new Blob([bytes], { type: mime }) });
        }
        tx.objectStore('models').put(em);
      } else if (s === 'studies') {
        const st = row as unknown as PlanStudy;
        const bytes = files[`blobs/${st.sourceBlobId}`];
        if (!bytes) {
          missingFiles++;
          continue;
        }
        tx.objectStore('blobs').put({ id: st.sourceBlobId, blob: new Blob([bytes], { type: st.sourceMime }) });
        tx.objectStore('studies').put(st);
      } else {
        tx.objectStore(s).put(row);
      }
    }
  }
  // Settings: keep this device's AI token; take the rest from the backup.
  const merged = { ...(currentSettings ?? {}), ...(data.settings ?? {}), aiToken: currentSettings?.aiToken ?? '' };
  tx.objectStore('meta').put(merged, 'settings');
  await tx.done;
  return { manifest, counts, missingFiles };
}

export function backupFileName(date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `joudy-studio-backup-${d}.zip`;
}
