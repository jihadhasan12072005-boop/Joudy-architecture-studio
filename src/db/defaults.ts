import type {
  ConceptData,
  PresentationData,
  ProgramData,
  Project,
  SiteAnalysis,
} from './types';
import { uid } from '../lib/id';

// Tartous city centre (approx.). Editable per project.
export const TARTOUS = { latitude: 34.889, longitude: 35.887, utcOffset: 3 };

export function defaultSite(): SiteAnalysis {
  return {
    latitude: TARTOUS.latitude,
    longitude: TARTOUS.longitude,
    utcOffset: TARTOUS.utcOffset,
    northAngle: 0,
    topography: '',
    soil: '',
    climateNotes: '',
    windNotes: '',
    windSource: '',
    accessPoints: '',
    pedestrianFlow: '',
    vehicleFlow: '',
    surroundings: '',
    environmental: '',
    views: '',
    privacy: '',
    noise: '',
    opportunities: [],
    constraints: [],
    checks: {},
  };
}

export function defaultConcept(): ConceptData {
  return {
    statement: '',
    options: [],
    criteria: [
      { id: uid(), label: 'الوظيفية — Functionality', weight: 3 },
      { id: uid(), label: 'الاستجابة المناخية — Climatic response', weight: 2 },
      { id: uid(), label: 'وضوح الحركة — Circulation clarity', weight: 2 },
      { id: uid(), label: 'العلاقة مع السياق — Context', weight: 2 },
      { id: uid(), label: 'القوة التعبيرية — Architectural expression', weight: 1 },
    ],
    zones: [
      { id: uid(), name: 'عام — Public', color: '#C9A27A', description: '' },
      { id: uid(), name: 'شبه عام — Semi-public', color: '#9FB0A0', description: '' },
      { id: uid(), name: 'خاص — Private', color: '#8C8FB0', description: '' },
      { id: uid(), name: 'خدمات — Service', color: '#B9B2A6', description: '' },
    ],
    log: [],
  };
}

export function defaultProgram(): ProgramData {
  return {
    spaces: [],
    adjacency: {},
    circulationPct: 25,
    wallsPct: 10,
    maxCoveragePct: 0,
    maxFar: 0,
    checks: {},
  };
}

export function defaultPresentation(): PresentationData {
  return {
    conceptStatement: '',
    description: '',
    boardChecklist: {},
    boards: [],
    milestones: [],
    finalNotes: '',
  };
}

export function newProject(partial: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: uid(),
    name: 'مشروع جديد',
    type: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    course: 'تصميم معماري 3',
    professor: '',
    location: 'طرطوس',
    siteDescription: '',
    siteWidth: 0,
    siteDepth: 0,
    siteAreaOverride: 0,
    orientation: '',
    floors: 1,
    basements: 0,
    requirements: '',
    brief: '',
    constraints: '',
    deadline: '',
    notes: '',
    references: [],
    decisions: [],
    site: defaultSite(),
    concept: defaultConcept(),
    program: defaultProgram(),
    reviews: [],
    presentation: defaultPresentation(),
    stageDone: {},
    ...partial,
  };
}

/**
 * Fill any fields missing from an older/foreign project object with defaults,
 * without overwriting existing data. Used by migrations and backup import.
 */
export function normalizeProject(p: Partial<Project> & { id: string }): Project {
  const base = newProject();
  return {
    ...base,
    ...p,
    site: { ...defaultSite(), ...(p.site ?? {}) },
    concept: { ...defaultConcept(), ...(p.concept ?? {}) },
    program: { ...defaultProgram(), ...(p.program ?? {}) },
    presentation: { ...defaultPresentation(), ...(p.presentation ?? {}) },
    references: p.references ?? [],
    decisions: p.decisions ?? [],
    reviews: p.reviews ?? [],
    stageDone: p.stageDone ?? {},
  };
}
