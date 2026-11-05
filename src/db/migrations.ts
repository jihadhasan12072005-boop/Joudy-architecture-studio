import type { DB } from './db';
import { normalizeProject } from './defaults';
import type { Project } from './types';

/**
 * DATA version — the shape of records inside the stores.
 * Each migration upgrades from (index) to (index + 1) and must be idempotent
 * and non-destructive: it may add or transform fields, never drop user data.
 */
export const DATA_VERSION = 1;

type Migration = (db: DB) => Promise<void>;

const migrations: Migration[] = [
  // 0 -> 1: initial release. Normalize any pre-existing project records so
  // they contain every field the UI expects.
  async (db) => {
    const tx = db.transaction('projects', 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      await cursor.update(normalizeProject(cursor.value as Project));
      cursor = await cursor.continue();
    }
    await tx.done;
  },
];

export async function runDataMigrations(db: DB): Promise<void> {
  const current = ((await db.get('meta', 'dataVersion')) as number | undefined) ?? 0;
  if (current > DATA_VERSION) {
    // Data written by a newer app version. Do not touch it.
    console.warn(`Data version ${current} is newer than app (${DATA_VERSION}).`);
    return;
  }
  for (let v = current; v < DATA_VERSION; v++) {
    await migrations[v](db);
    await db.put('meta', v + 1, 'dataVersion');
  }
}
