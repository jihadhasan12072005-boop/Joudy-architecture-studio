import { openDB, type IDBPDatabase } from 'idb';
import type {
  Activity,
  BlobRecord,
  Conversation,
  FileMeta,
  Mistake,
  Project,
  Revision,
  SubjectProgress,
  Task,
} from './types';
import { runDataMigrations } from './migrations';

export const DB_NAME = 'joudy-architecture-studio';
/**
 * IndexedDB *structure* version (object stores & indexes).
 * Only ever add stores/indexes in new branches of `upgrade` — never delete
 * a store that holds user data.
 */
export const DB_VERSION = 1;

export interface JoudyDB {
  meta: { key: string; value: unknown };
  projects: { key: string; value: Project; indexes: { byUpdated: number } };
  files: { key: string; value: FileMeta; indexes: { byProject: string; bySheet: string; byCreated: number } };
  blobs: { key: string; value: BlobRecord };
  thumbs: { key: string; value: BlobRecord };
  tasks: { key: string; value: Task; indexes: { byProject: string } };
  activity: { key: string; value: Activity; indexes: { byAt: number; byProject: string } };
  revisions: { key: string; value: Revision; indexes: { byProject: string } };
  subjects: { key: string; value: SubjectProgress };
  mistakes: { key: string; value: Mistake; indexes: { bySubject: string } };
  conversations: { key: string; value: Conversation; indexes: { byProject: string; byUpdated: number } };
}

// The idb typings want a DBSchema; we keep it loose to avoid generic gymnastics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = IDBPDatabase<any>;

let dbPromise: Promise<DB> | null = null;

export function getDB(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('meta');
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('byUpdated', 'updatedAt');
          const files = db.createObjectStore('files', { keyPath: 'id' });
          files.createIndex('byProject', 'projectId');
          files.createIndex('bySheet', 'sheetId');
          files.createIndex('byCreated', 'createdAt');
          db.createObjectStore('blobs', { keyPath: 'id' });
          db.createObjectStore('thumbs', { keyPath: 'id' });
          const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
          tasks.createIndex('byProject', 'projectId');
          const activity = db.createObjectStore('activity', { keyPath: 'id' });
          activity.createIndex('byAt', 'at');
          activity.createIndex('byProject', 'projectId');
          const revisions = db.createObjectStore('revisions', { keyPath: 'id' });
          revisions.createIndex('byProject', 'projectId');
          db.createObjectStore('subjects', { keyPath: 'subjectId' });
          const mistakes = db.createObjectStore('mistakes', { keyPath: 'id' });
          mistakes.createIndex('bySubject', 'subjectId');
          const conv = db.createObjectStore('conversations', { keyPath: 'id' });
          conv.createIndex('byProject', 'projectId');
          conv.createIndex('byUpdated', 'updatedAt');
        }
        // Future: `if (oldVersion < 2) { ...add stores/indexes only... }`
      },
      blocked() {
        console.warn('Database upgrade blocked by another open tab.');
      },
      blocking() {
        // A newer version of the app wants to upgrade: close so it can proceed.
        dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    }).then(async (db) => {
      await runDataMigrations(db);
      return db;
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export async function resetDBConnection(): Promise<void> {
  if (dbPromise) {
    const d = await dbPromise;
    d.close();
  }
  dbPromise = null;
}
