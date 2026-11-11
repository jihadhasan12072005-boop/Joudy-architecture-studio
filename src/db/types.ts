// Data model for Joudy Architecture Studio.
// Every persisted shape lives here. When a shape changes, bump DATA_VERSION in
// migrations.ts and add a migration step — never rename fields silently.

export type ID = string;

export type ProjectStatus = 'active' | 'archived';

export type StageKey = 'site' | 'concept' | 'program' | 'drawings' | 'review' | 'presentation';

export interface SiteAnalysis {
  latitude: number;
  longitude: number;
  utcOffset: number;
  /** Angle (degrees, clockwise) from the top of the site drawing to true north. */
  northAngle: number;
  topography: string;
  soil: string;
  climateNotes: string;
  windNotes: string;
  windSource: string;
  accessPoints: string;
  pedestrianFlow: string;
  vehicleFlow: string;
  surroundings: string;
  environmental: string;
  views: string;
  privacy: string;
  noise: string;
  opportunities: string[];
  constraints: string[];
  checks: Record<string, boolean>;
}

export interface ConceptOption {
  id: ID;
  title: string;
  narrative: string;
  keywords: string;
  strengths: string;
  weaknesses: string;
  /** criterionId -> score 1..5 */
  scores: Record<string, number>;
  chosen: boolean;
  imageFileId?: ID;
}

export interface Criterion {
  id: ID;
  label: string;
  weight: number;
}

export interface Zone {
  id: ID;
  name: string;
  color: string;
  description: string;
}

export interface ConceptLogEntry {
  id: ID;
  at: number;
  text: string;
}

export interface ConceptData {
  statement: string;
  options: ConceptOption[];
  criteria: Criterion[];
  zones: Zone[];
  log: ConceptLogEntry[];
}

export interface SpaceRow {
  id: ID;
  name: string;
  zoneId: string;
  floor: number;
  quantity: number;
  unitArea: number;
  occupants: number;
  notes: string;
}

/** 2 = essential, 1 = desirable, 0 = neutral, -1 = avoid */
export type AdjacencyValue = -1 | 0 | 1 | 2;

export interface ProgramData {
  spaces: SpaceRow[];
  /** key `${a}|${b}` with a < b */
  adjacency: Record<string, AdjacencyValue>;
  circulationPct: number;
  wallsPct: number;
  maxCoveragePct: number;
  maxFar: number;
  checks: Record<string, boolean>;
}

export interface ReviewScore {
  score: number; // 0 = not assessed, 1..5
  notes: string;
}

export interface ReviewRound {
  id: ID;
  date: string;
  title: string;
  reviewer: string; // e.g. "مراجعة ذاتية" or professor name
  scores: Record<string, ReviewScore>;
  summary: string;
  actions: { id: ID; text: string; done: boolean }[];
}

export interface Milestone {
  id: ID;
  title: string;
  date: string;
  done: boolean;
}

export interface PresentationData {
  conceptStatement: string;
  description: string;
  boardChecklist: Record<string, boolean>;
  boards: { id: ID; title: string; contents: string; done: boolean }[];
  milestones: Milestone[];
  finalNotes: string;
}

export interface Reference {
  id: ID;
  title: string;
  url: string;
  note: string;
}

export interface Decision {
  id: ID;
  at: number;
  title: string;
  reason: string;
}

export interface Project {
  id: ID;
  name: string;
  type: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  course: string;
  professor: string;
  location: string;
  siteDescription: string;
  siteWidth: number;
  siteDepth: number;
  /** If >0, overrides width × depth (irregular sites). */
  siteAreaOverride: number;
  orientation: string;
  floors: number;
  basements: number;
  requirements: string;
  brief: string;
  constraints: string;
  deadline: string;
  notes: string;
  coverFileId?: ID;
  references: Reference[];
  decisions: Decision[];
  site: SiteAnalysis;
  concept: ConceptData;
  program: ProgramData;
  reviews: ReviewRound[];
  presentation: PresentationData;
  stageDone: Partial<Record<StageKey, boolean>>;
}

export type FileCategory =
  | 'plan'
  | 'elevation'
  | 'section'
  | 'site'
  | 'detail'
  | 'diagram'
  | 'render'
  | 'reference'
  | 'brief'
  | 'other';

export interface FileMeta {
  id: ID;
  projectId: ID;
  category: FileCategory;
  /** Files sharing a sheetId are versions of the same drawing. */
  sheetId: ID;
  title: string;
  version: number;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: number;
  note: string;
}

export interface BlobRecord {
  id: ID;
  blob: Blob;
}

export interface Task {
  id: ID;
  projectId: ID | null;
  title: string;
  due: string;
  done: boolean;
  createdAt: number;
}

export interface Activity {
  id: ID;
  projectId: ID | null;
  at: number;
  text: string;
}

export interface Revision {
  id: ID;
  projectId: ID;
  at: number;
  label: string;
  snapshot: Project;
}

export interface SubjectTopic {
  id: ID;
  title: string;
  done: boolean;
}

export interface SubjectProgress {
  subjectId: string;
  topics: SubjectTopic[];
  notes: string;
  examDate: string;
  /** For the programming subject: the language actually taught. */
  language?: string;
  updatedAt: number;
}

export interface Mistake {
  id: ID;
  subjectId: string;
  topic: string;
  question: string;
  myAnswer: string;
  correctAnswer: string;
  explanation: string;
  createdAt: number;
  lastReviewedAt: number;
  reviewCount: number;
  mastered: boolean;
}

export interface ChatAttachment {
  kind: 'image';
  fileId?: ID;
  dataUrl: string;
  name: string;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant' | 'error';
  text: string;
  at: number;
  attachments?: ChatAttachment[];
  costEur?: number;
}

export interface Conversation {
  id: ID;
  projectId: ID | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  messages: ChatMessage[];
}

export interface Settings {
  welcomeSeen: boolean;
  aiEndpoint: string;
  aiToken: string;
  currentProjectId: ID | null;
  lastBackupAt: number;
}

export interface PlanStudy {
  id: ID;
  projectId: ID | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourceBlobId: ID; // original upload, stored in the 'blobs' store
  sourceName: string;
  sourceMime: string;
  pdfPage: number;
  workMaxSide: number; // working raster size used for extraction
  params: import('../lab/model').ExtractParams;
  spaces: import('../lab/model').SpaceSetting[];
  scale: import('../lab/model').ScaleInfo | null;
  defaultFloors: number;
  floorHeight: number;
  mode: import('../lab/model').MassingMode;
  explodeGap: number;
  entrances: [number, number][];
  travelLimit: number;
  northAngle: number;
  step: number; // tutorial / workflow step reached
}

export const STORE_NAMES = [
  'meta',
  'projects',
  'files',
  'blobs',
  'thumbs',
  'tasks',
  'activity',
  'revisions',
  'subjects',
  'mistakes',
  'conversations',
  'studies',
  'models',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];
