import { describe, expect, it, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { newModel, parseModelFile, sampleMasses, scaleModel, snapshotOf, FILE_FORMAT, FILE_VERSION } from '../src/editor/model';
import { massArea } from '../src/editor/geom';
import { resetDBConnection } from '../src/db/db';
import { getModel, listModels, saveModel, putBlob, deleteModel, getBlob } from '../src/db/repo';
import { createBackup, importBackup } from '../src/db/backup';

beforeEach(async () => { await resetDBConnection(); globalThis.indexedDB = new IDBFactory(); });

describe('editor model', () => {
  it('sample has two editable masses matching the sample plan (36 m wide)', () => {
    const [main, hall] = sampleMasses();
    expect(massArea(main)).toBeCloseTo(26 * 22 - 2 * 8 - 0, 0);
    expect(hall.roof.type).toBe('barrel');
    expect(main.holes.length).toBe(0); // no courtyard is imposed
  });
  it('calibration scales masses and the image together', () => {
    const m = { ...newModel(), masses: sampleMasses(), reference: { blobId: 'b', mime: 'image/png', name: 'x', widthM: 40, aspect: 0.7, x: 20, z: 14, rot: 0, opacity: 0.5, locked: true, visible: true } };
    const s = scaleModel(m, 2);
    expect(s.reference!.widthM).toBe(80);
    expect(massArea(s.masses[0])).toBeCloseTo(massArea(m.masses[0]) * 4, 3);
  });
  it('file format round-trips and validates', () => {
    const m = { ...newModel('ملف'), masses: sampleMasses() };
    const text = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, savedAt: '', model: m, referenceImage: null });
    expect(parseModelFile(text).model.masses.length).toBe(2);
    expect(() => parseModelFile('{"format":"other"}')).toThrow();
    expect(() => parseModelFile('not json')).toThrow();
  });
  it('persists in IndexedDB (v3 store), survives reopen, and is included in backups', async () => {
    const m = { ...newModel('محفوظ'), masses: sampleMasses() };
    m.masses[0].height = 12.8;
    m.versions = [{ id: 'v1', name: 'نسخة 1', at: 1, snapshot: snapshotOf(m) }];
    m.reference = { blobId: 'ref1', mime: 'image/png', name: 'p.png', widthM: 40, aspect: 0.7, x: 0, z: 0, rot: 0, opacity: 0.5, locked: true, visible: true };
    await putBlob('ref1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    await saveModel(m);
    await resetDBConnection();
    const back = await getModel(m.id);
    expect(back!.masses[0].height).toBe(12.8);
    expect(back!.versions.length).toBe(1);
    const { bytes } = await createBackup();
    await resetDBConnection();
    globalThis.indexedDB = new IDBFactory();
    await importBackup(bytes, 'replace');
    expect((await listModels())[0].title).toBe('محفوظ');
    expect(await getBlob('ref1')).toBeTruthy();
    await deleteModel(m.id);
    expect(await getModel(m.id)).toBeUndefined();
  });
});
