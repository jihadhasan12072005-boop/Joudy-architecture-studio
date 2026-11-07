import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { DB_NAME, getDB, resetDBConnection } from '../src/db/db';
import {
  addFile, createProject, deleteProject, duplicateProject, getBlob, getProject, getSettings, listFiles,
  listProjects, listRevisions, restoreRevision, saveProject, saveTask, listTasks, updateSettings, saveMistake, listMistakes,
} from '../src/db/repo';
import { createBackup, importBackup, readBackup } from '../src/db/backup';
import { DATA_VERSION } from '../src/db/migrations';

beforeEach(async () => {
  await resetDBConnection();
  // fresh in-memory IndexedDB per test
  globalThis.indexedDB = new IDBFactory();
});

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

describe('project persistence', () => {
  it('creates, edits and survives reopening the database', async () => {
    const p = await createProject({ name: 'مكتبة عامة' });
    await saveProject({ ...p, brief: 'مكتبة على الكورنيش', floors: 3 });
    await resetDBConnection(); // simulate closing & reopening the app
    const again = await getProject(p.id);
    expect(again?.name).toBe('مكتبة عامة');
    expect(again?.brief).toBe('مكتبة على الكورنيش');
    expect(again?.floors).toBe(3);
    expect((await getSettings()).currentProjectId).toBe(p.id);
  });

  it('stores file blobs and versions', async () => {
    const p = await createProject();
    const v1 = await addFile({ projectId: p.id, blob: new Blob([pngBytes], { type: 'image/png' }), name: 'plan.png', category: 'plan' });
    const v2 = await addFile({ projectId: p.id, blob: new Blob([pngBytes], { type: 'image/png' }), name: 'plan2.png', category: 'plan', sheetId: v1.sheetId });
    expect(v2.version).toBe(2);
    expect(v2.title).toBe(v1.title);
    const b = await getBlob(v1.id);
    expect(new Uint8Array(await b!.arrayBuffer())).toEqual(pngBytes);
  });

  it('duplicates with files and deletes with cascade', async () => {
    const p = await createProject({ name: 'A' });
    await addFile({ projectId: p.id, blob: new Blob([pngBytes]), name: 'x.pdf', category: 'brief' });
    const copy = await duplicateProject(p.id);
    expect((await listFiles(copy!.id)).length).toBe(1);
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
    expect((await listFiles(p.id)).length).toBe(0);
    expect((await listFiles(copy!.id)).length).toBe(1); // copy unaffected
  });

  it('keeps revisions and restores them', async () => {
    const p = await createProject({ name: 'قبل' });
    const revs = await listRevisions(p.id);
    expect(revs.length).toBe(1);
    await saveProject({ ...p, name: 'بعد' });
    const restored = await restoreRevision(revs[0]);
    expect(restored.name).toBe('قبل');
  });

  it('general tasks (no project) are listed', async () => {
    await saveTask({ id: 't1', projectId: null, title: 'امتحان', due: '2026-12-01', done: false, createdAt: 1 });
    expect((await listTasks(null)).length).toBe(1);
    expect((await listTasks()).length).toBe(1);
  });
});

describe('backup', () => {
  it('round-trips everything and never contains the AI token', async () => {
    const p = await createProject({ name: 'متحف' });
    await addFile({ projectId: p.id, blob: new Blob([pngBytes], { type: 'image/png' }), name: 'a.png', category: 'render' });
    await saveMistake({ id: 'm1', subjectId: 'rc-1', topic: '', question: 'q', myAnswer: 'a', correctAnswer: 'b', explanation: '', createdAt: 1, lastReviewedAt: 0, reviewCount: 0, mastered: false });
    await updateSettings({ aiToken: 'SECRET-TOKEN-123' });
    const { bytes } = await createBackup();
    const { data } = readBackup(bytes);
    expect(JSON.stringify(data)).not.toContain('SECRET-TOKEN-123');

    // Restore into a brand-new "device"
    await resetDBConnection();
    globalThis.indexedDB = new IDBFactory();
    const res = await importBackup(bytes, 'replace');
    expect(res.missingFiles).toBe(0);
    const projects = await listProjects();
    expect(projects[0].name).toBe('متحف');
    const files = await listFiles(projects[0].id);
    expect(files.length).toBe(1);
    expect(new Uint8Array(await (await getBlob(files[0].id))!.arrayBuffer())).toEqual(pngBytes);
    expect((await listMistakes()).length).toBe(1);
    expect((await getSettings()).aiToken).toBe('');
  });

  it('rejects foreign files', async () => {
    expect(() => readBackup(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('merge keeps existing data', async () => {
    const a = await createProject({ name: 'A' });
    const { bytes } = await createBackup();
    await createProject({ name: 'B' });
    await importBackup(bytes, 'merge');
    const names = (await listProjects()).map((p) => p.name).sort();
    expect(names).toEqual(['A', 'B']);
    expect((await getProject(a.id))?.name).toBe('A');
  });
});

describe('migrations / app updates', () => {
  it('upgrades legacy data without losing anything', async () => {
    // Simulate data written by an older build: project missing many fields, no dataVersion.
    const raw = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('meta');
        const s = db.createObjectStore('projects', { keyPath: 'id' });
        s.createIndex('byUpdated', 'updatedAt');
        for (const n of ['files', 'blobs', 'thumbs', 'tasks', 'activity', 'revisions', 'mistakes', 'conversations']) {
          const st = db.createObjectStore(n, { keyPath: 'id' });
          if (['files', 'tasks', 'activity', 'revisions', 'conversations'].includes(n)) st.createIndex('byProject', 'projectId');
          if (n === 'files') { st.createIndex('bySheet', 'sheetId'); st.createIndex('byCreated', 'createdAt'); }
          if (n === 'activity') st.createIndex('byAt', 'at');
          if (n === 'mistakes') st.createIndex('bySubject', 'subjectId');
          if (n === 'conversations') st.createIndex('byUpdated', 'updatedAt');
        }
        db.createObjectStore('subjects', { keyPath: 'subjectId' });
      },
    });
    await raw.put('projects', { id: 'old-1', name: 'مشروع قديم', brief: 'نص مهم', updatedAt: 5 });
    raw.close();

    const db = await getDB();
    expect(await db.get('meta', 'dataVersion')).toBe(DATA_VERSION);
    expect(db.objectStoreNames.contains('studies')).toBe(true); // v1 → v2 structure upgrade
    const p = await getProject('old-1');
    expect(p?.name).toBe('مشروع قديم');
    expect(p?.brief).toBe('نص مهم');
    expect(p?.site.latitude).toBeCloseTo(34.889);
    expect(Array.isArray(p?.program.spaces)).toBe(true);
  });
});
