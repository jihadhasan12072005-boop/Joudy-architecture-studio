// Editable massing model: data shape, versions, and the re-editable file format.
import type { Mass, V2 } from './geom';
import { massFromWorld, MASS_COLORS, rectangle } from './geom';

export interface RefImage {
  blobId: string;
  mime: string;
  name: string;
  widthM: number; // displayed width of the image in metres
  aspect: number; // height / width
  x: number; // centre
  z: number;
  rot: number; // degrees
  opacity: number; // 0..1
  locked: boolean;
  visible: boolean;
}

export interface ModelSnapshot {
  masses: Mass[];
  reference: RefImage | null;
  measured: boolean;
}

export interface ModelVersion {
  id: string;
  name: string;
  at: number;
  snapshot: ModelSnapshot;
}

export interface EditorModel extends ModelSnapshot {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  versions: ModelVersion[];
  scaleNote: string; // how the scale was set (shown to the user)
}

export const FILE_FORMAT = 'joudy-massing-model';
export const FILE_VERSION = 1;

export function newModel(title = 'نموذج كتل جديد', projectId: string | null = null): EditorModel {
  const now = Date.now();
  return {
    id: 'em' + Math.random().toString(36).slice(2, 10),
    title,
    projectId,
    createdAt: now,
    updatedAt: now,
    masses: [],
    reference: null,
    measured: false,
    versions: [],
    scaleNote: '',
  };
}

export function snapshotOf(m: ModelSnapshot): ModelSnapshot {
  return structuredClone({ masses: m.masses, reference: m.reference, measured: m.measured });
}

/** Scale all geometry (masses + reference image) about the origin — used when calibrating. */
export function scaleModel(m: ModelSnapshot, k: number): ModelSnapshot {
  const sp = ([x, z]: V2): V2 => [x * k, z * k];
  return {
    ...m,
    masses: m.masses.map((ms) => ({ ...ms, x: ms.x * k, z: ms.z * k, outline: ms.outline.map(sp), holes: ms.holes.map((h) => h.map(sp)), bulge: ms.bulge.map((b) => b * k), radius: ms.radius.map((r) => r * k) })),
    reference: m.reference ? { ...m.reference, widthM: m.reference.widthM * k, x: m.reference.x * k, z: m.reference.z * k } : null,
  };
}

// ---------------------------------------------------------------------------
// Re-editable file (.joudy-massing.json): model + reference image as data URL
// ---------------------------------------------------------------------------
export interface ModelFile {
  format: string;
  version: number;
  savedAt: string;
  model: EditorModel;
  referenceImage: string | null; // data URL
}

export function parseModelFile(text: string): ModelFile {
  let data: ModelFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('الملف ليس ملف نموذج صالحاً (JSON غير مقروء).');
  }
  if (data.format !== FILE_FORMAT) throw new Error('هذا الملف ليس ملف نموذج كتل من استوديو جودي.');
  if (data.version > FILE_VERSION) throw new Error('الملف من إصدار أحدث من التطبيق.');
  if (!data.model || !Array.isArray(data.model.masses)) throw new Error('بيانات النموذج ناقصة.');
  for (const m of data.model.masses) {
    if (!Array.isArray(m.outline) || m.outline.length < 3 || !(m.height >= 0)) throw new Error('إحدى الكتل في الملف غير صالحة.');
    m.bulge ??= m.outline.map(() => 0);
    m.radius ??= m.outline.map(() => 0);
    m.holes ??= [];
  }
  data.model.versions ??= [];
  return data;
}

// ---------------------------------------------------------------------------
// Sample model (matches the built-in sample plan: 36 m wide, origin at its top-left)
// ---------------------------------------------------------------------------
export function sampleMasses(): Mass[] {
  // Sample plan: 36 × 22 m L-shape (notch 12 × 8 at the bottom-right), courtyard 10 × 6 at (8,6).
  const main = massFromWorld(
    [[0, 0], [26, 0], [26, 14], [24, 14], [24, 22], [0, 22]],
    { name: 'الجناح الرئيسي', height: 6.4, color: MASS_COLORS[0] },
  );
  const hall = massFromWorld(rectangle(26, 0, 36, 14), {
    name: 'قاعة العرض',
    height: 7,
    floorHeight: 7,
    color: MASS_COLORS[1],
    roof: { type: 'barrel', rise: 3, dir: 90, waves: 2 },
  });
  hall.radius = [0, 3, 0, 0];
  return [main, hall];
}
