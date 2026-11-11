// Interactive massing editor engine (Three.js). Owns the scene, cameras and
// pointer interaction; the React UI owns the data and history. The engine
// reports edits through callbacks: onChange(model, commit) — commit=false
// while dragging, true when an edit is finished (pushed to undo history).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  bbox, buildMassMesh, insertVertex, massFromWorld, MASS_COLORS, massWorldRings, rectangle, scaleMass, signedArea, subtractFromMass, intersects,
  toLocal, toWorld, type Mass, type V2,
} from './geom';
import type { EditorModel } from './model';
import { captureScene } from '../lab/capture';
import { ExportError } from '../lib/exportGuard';

export type Tool = 'select' | 'rect' | 'poly' | 'edit' | 'void' | 'scale' | 'image';
export type View = 'plan' | '3d' | 'N' | 'E' | 'S' | 'W';

export interface EngineState {
  model: EditorModel;
  selection: string[];
  vertex: number | null;
  tool: Tool;
  view: View;
  snap: boolean;
  gridStep: number;
  floorLines: boolean;
  refUrl: string | null;
}

export interface EngineCallbacks {
  onChange: (m: EditorModel, commit: boolean, label: string) => void;
  onSelect: (ids: string[], vertex: number | null) => void;
  onHint: (text: string) => void;
  onScalePoints: (a: V2, b: V2) => void;
  onNeedPlanView: () => void;
}

type Drag =
  | { kind: 'move'; start: V2; orig: Map<string, { x: number; z: number }> }
  | { kind: 'image'; start: V2; orig: { x: number; z: number } }
  | { kind: 'corner' | 'side'; idx: number; mass: Mass }
  | { kind: 'rotate'; mass: Mass; startAngle: number }
  | { kind: 'height'; mass: Mass; startY: number; perPx: number }
  | { kind: 'vertex'; idx: number; mass: Mass }
  | { kind: 'bulge'; idx: number; mass: Mass }
  | { kind: 'rect'; start: V2; cur: V2 };

const SEL = new THREE.Color('#b5844f');
const HANDLE_PX = 7;

export class MassEditorEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  private ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, -5000, 5000);
  private controls: OrbitControls;
  private massGroup = new THREE.Group();
  private overlay = new THREE.Group();
  private refMesh: THREE.Mesh | null = null;
  private refUrlLoaded: string | null = null;
  private grid: THREE.Group;
  private groundLine: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private needsRender = true;
  private raf = 0;
  private ro: ResizeObserver;
  private st: EngineState;
  private drag: Drag | null = null;
  private draft: V2[] = []; // polygon being drawn
  private hover: V2 | null = null;
  private scalePts: V2[] = [];
  private lastClick = 0;
  private lastXY: [number, number] = [-99, -99];
  private draggedModel: EditorModel | null = null;

  constructor(private host: HTMLElement, private cb: EngineCallbacks, initial: EngineState) {
    this.st = initial;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.scene.background = new THREE.Color('#f4efe6');
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#b8aa94', 1.7));
    const sun = new THREE.DirectionalLight('#fff3e0', 1.8);
    sun.position.set(-60, 120, -40);
    this.scene.add(sun);
    this.grid = this.makeGrid();
    this.groundLine = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: '#d9cfbf' }));
    this.groundLine.rotation.x = -Math.PI / 2;
    this.groundLine.position.y = -0.05;
    this.groundLine.visible = false;
    this.scene.add(this.grid, this.groundLine, this.massGroup, this.overlay);
    this.overlay.renderOrder = 10;
    this.controls = new OrbitControls(this.persp, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.invalidate());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown, { capture: true });
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resize();
    this.applyView(true);
    this.rebuild();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.needsRender) {
        this.needsRender = false;
        this.updateHandleScale();
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ state
  setState(next: EngineState) {
    const prev = this.st;
    this.st = next;
    if (prev.view !== next.view) this.applyView(false);
    if (prev.tool !== next.tool) {
      this.draft = [];
      this.scalePts = [];
      this.hint();
    }
    if (next.refUrl !== this.refUrlLoaded || prev.model.reference !== next.model.reference) this.syncReference();
    if (prev.model.masses !== next.model.masses || prev.selection !== next.selection || prev.vertex !== next.vertex || prev.floorLines !== next.floorLines || prev.tool !== next.tool) this.rebuild();
    this.drawOverlay();
    this.invalidate();
  }

  invalidate() {
    this.needsRender = true;
  }

  get camera(): THREE.Camera {
    return this.st.view === '3d' ? this.persp : this.ortho;
  }

  // ------------------------------------------------------------------ scene
  private makeGrid() {
    const g = new THREE.Group();
    const minor = new THREE.GridHelper(600, 600, '#e3dacd', '#ebe4d8');
    (minor.material as THREE.Material).transparent = true;
    (minor.material as THREE.Material).opacity = 0.55;
    const major = new THREE.GridHelper(600, 120, '#cdbfaa', '#d6cab8');
    minor.position.y = -0.02;
    major.position.y = -0.01;
    g.add(minor, major);
    return g;
  }

  private syncReference() {
    const ref = this.st.model.reference;
    if (!ref || !this.st.refUrl || !ref.visible) {
      if (this.refMesh) this.refMesh.visible = false;
      if (ref && this.refMesh && this.st.refUrl === this.refUrlLoaded) this.placeReference();
      return;
    }
    if (this.st.refUrl !== this.refUrlLoaded || !this.refMesh) {
      this.refUrlLoaded = this.st.refUrl;
      if (this.refMesh) {
        this.scene.remove(this.refMesh);
        ((this.refMesh.material as THREE.MeshBasicMaterial).map as THREE.Texture | null)?.dispose();
      }
      const tex = new THREE.TextureLoader().load(this.st.refUrl, () => this.invalidate());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      this.refMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      this.refMesh.rotation.x = -Math.PI / 2;
      this.refMesh.renderOrder = -1;
      this.scene.add(this.refMesh);
    }
    this.placeReference();
  }

  private placeReference() {
    const ref = this.st.model.reference;
    if (!ref || !this.refMesh) return;
    this.refMesh.visible = ref.visible;
    this.refMesh.scale.set(ref.widthM, ref.widthM * ref.aspect, 1);
    this.refMesh.position.set(ref.x, 0.005, ref.z);
    this.refMesh.rotation.set(-Math.PI / 2, 0, -(ref.rot * Math.PI) / 180);
    (this.refMesh.material as THREE.MeshBasicMaterial).opacity = ref.opacity;
    this.invalidate();
  }

  private rebuild() {
    for (const c of [...this.massGroup.children]) {
      this.massGroup.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
    }
    const sel = new Set(this.st.selection);
    for (const m of this.st.model.masses) this.massGroup.add(this.massObject(m, sel.has(m.id)));
    this.drawOverlay();
    this.invalidate();
  }

  private massObject(m: Mass, selected: boolean): THREE.Group {
    const g = new THREE.Group();
    g.userData.massId = m.id;
    const data = buildMassMesh(m, { floorLines: this.st.floorLines });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.computeVertexNormals();
    const color = new THREE.Color(m.color);
    if (selected) color.lerp(SEL, 0.2);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: this.st.view === 'plan', opacity: this.st.view === 'plan' ? 0.82 : 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.massId = m.id;
    mesh.name = m.name;
    g.add(mesh);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(data.lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: selected ? '#9a6a3c' : '#2e2b27' })));
    if (data.floorLines.length) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(data.floorLines, 3));
      g.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: '#7d7569', transparent: true, opacity: 0.5 })));
    }
    return g;
  }

  // ------------------------------------------------------------------ views
  private resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const halfH = (this.ortho.top - this.ortho.bottom) / 2 || 50;
    this.ortho.left = (-halfH * w) / h;
    this.ortho.right = (halfH * w) / h;
    this.ortho.updateProjectionMatrix();
    this.invalidate();
  }

  private sceneBounds(): { cx: number; cz: number; r: number; top: number } {
    const pts: V2[] = [];
    let top = 3;
    for (const m of this.st.model.masses) {
      for (const r of massWorldRings(m)) pts.push(...r);
      top = Math.max(top, m.base + m.height + (m.roof.type === 'flat' ? 0 : m.roof.rise));
    }
    const ref = this.st.model.reference;
    if (ref && ref.visible && !pts.length) {
      const hw = ref.widthM / 2, hh = (ref.widthM * ref.aspect) / 2;
      pts.push([ref.x - hw, ref.z - hh], [ref.x + hw, ref.z + hh]);
    }
    if (!pts.length) return { cx: 0, cz: 0, r: 30, top };
    const b = bbox(pts);
    return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, r: Math.max(8, Math.hypot(b.w, b.d) / 2), top };
  }

  fit() {
    this.applyView(true);
  }

  private applyView(fit: boolean) {
    const v = this.st.view;
    const { cx, cz, r, top } = this.sceneBounds();
    const c = this.controls;
    c.object = v === '3d' ? this.persp : this.ortho;
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    if (v === '3d') {
      c.enableRotate = true;
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      c.maxPolarAngle = Math.PI / 2 - 0.01;
      if (fit || this.persp.position.lengthSq() === 0) {
        this.persp.position.set(cx + r * 1.6, Math.max(top * 1.4, r * 1.3), cz + r * 1.9);
        c.target.set(cx, top * 0.25, cz);
      }
    } else {
      c.enableRotate = false;
      c.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
      const half = r * 1.25;
      this.ortho.top = half;
      this.ortho.bottom = -half;
      this.ortho.left = (-half * w) / h;
      this.ortho.right = (half * w) / h;
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
      if (v === 'plan') {
        this.ortho.up.set(0, 0, -1);
        this.ortho.position.set(cx, 300, cz);
        c.target.set(cx, 0, cz);
      } else {
        const d: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
        const [dx, dz] = d[v];
        this.ortho.up.set(0, 1, 0);
        this.ortho.position.set(cx + dx * 400, top * 0.45, cz + dz * 400);
        c.target.set(cx, top * 0.45, cz);
        this.ortho.top = Math.max(half * 0.6, top * 0.75);
        this.ortho.bottom = -this.ortho.top;
        this.ortho.left = (this.ortho.bottom * w) / h;
        this.ortho.right = (this.ortho.top * w) / h;
        this.ortho.updateProjectionMatrix();
      }
    }
    this.grid.visible = v === 'plan' || v === '3d';
    this.groundLine.visible = !this.grid.visible; // elevations: ground band below the masses
    c.update();
    this.rebuild();
    this.invalidate();
  }

  // ------------------------------------------------------------------ helpers
  private ndc(e: PointerEvent | MouseEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Intersection of the pointer ray with the horizontal plane y = h. */
  private ground(e: PointerEvent | MouseEvent, h = 0): V2 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p);
    return hit ? [p.x, p.z] : null;
  }

  /** World metres per screen pixel at a point (plan / elevation: constant). */
  private perPx(at?: THREE.Vector3): number {
    const h = this.renderer.domElement.clientHeight || 600;
    if (this.camera === this.ortho) return (this.ortho.top - this.ortho.bottom) / this.ortho.zoom / h;
    const d = at ? this.persp.position.distanceTo(at) : this.persp.position.distanceTo(this.controls.target);
    return (2 * d * Math.tan((this.persp.fov * Math.PI) / 360)) / h;
  }

  private snapPt(p: V2, e: PointerEvent | MouseEvent, from?: V2): V2 {
    if (e.altKey || !this.st.snap) return p;
    // vertex snap (other masses), 10 px
    const tol = this.perPx() * 10;
    let best: V2 | null = null, bd = tol;
    for (const m of this.st.model.masses) for (const v of m.outline.map((q) => toWorld(m, q))) {
      const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) return best;
    if (from && e.shiftKey) {
      const ang = Math.atan2(p[1] - from[1], p[0] - from[0]);
      const step = Math.PI / 12;
      const a = Math.round(ang / step) * step;
      const L = Math.hypot(p[0] - from[0], p[1] - from[1]);
      const L2 = Math.round(L / this.st.gridStep) * this.st.gridStep;
      return [from[0] + Math.cos(a) * L2, from[1] + Math.sin(a) * L2];
    }
    const g = this.st.gridStep;
    return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
  }

  private massAt(e: PointerEvent | MouseEvent): string | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const meshes: THREE.Object3D[] = [];
    this.massGroup.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) return hit.object.userData.massId as string;
    // plan view: also accept clicks inside the footprint
    if (this.st.view === 'plan') {
      const p = this.ground(e);
      if (!p) return null;
      for (const m of [...this.st.model.masses].reverse()) {
        const [o, ...holes] = massWorldRings(m);
        if (pip(p, o) && !holes.some((hh) => pip(p, hh))) return m.id;
      }
    }
    return null;
  }

  private handleAt(e: PointerEvent | MouseEvent): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    this.raycaster.params.Line = { threshold: this.perPx() * 4 };
    const hs: THREE.Object3D[] = this.overlay.children.filter((o) => o.userData.handle);
    const hit = this.raycaster.intersectObjects(hs, false)[0];
    return hit?.object ?? null;
  }

  private selected(): Mass | null {
    if (this.st.selection.length !== 1) return null;
    return this.st.model.masses.find((m) => m.id === this.st.selection[0]) ?? null;
  }

  private emitMasses(masses: Mass[], commit: boolean, label: string) {
    const model = { ...this.st.model, masses };
    this.draggedModel = model;
    this.st = { ...this.st, model };
    this.rebuild();
    this.cb.onChange(model, commit, label);
  }

  private replaceMass(m: Mass, commit: boolean, label: string) {
    this.emitMasses(this.st.model.masses.map((x) => (x.id === m.id ? m : x)), commit, label);
  }

  // ------------------------------------------------------------------ overlay (handles, previews)
  private handle(pos: THREE.Vector3, kind: string, idx: number, color = '#ffffff', shape: 'box' | 'sphere' = 'box') {
    const geo = shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(0.6, 16, 12);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false }));
    mesh.position.copy(pos);
    mesh.userData = { handle: kind, idx };
    mesh.renderOrder = 20;
    const border = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2e2b27', depthTest: false, wireframe: true }));
    border.position.copy(pos);
    border.renderOrder = 21;
    border.userData = { scaleWith: true };
    this.overlay.add(mesh, border);
  }

  private line(points: V2[], y: number, color: string, closed = false, dashed = false) {
    const pts = points.map(([x, z]) => new THREE.Vector3(x, y, z));
    if (closed && pts.length) pts.push(pts[0].clone());
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: this.perPx() * 8, gapSize: this.perPx() * 5, depthTest: false })
      : new THREE.LineBasicMaterial({ color, depthTest: false });
    const l = new THREE.Line(g, mat);
    if (dashed) l.computeLineDistances();
    l.renderOrder = 15;
    this.overlay.add(l);
  }

  private drawOverlay() {
    for (const c of [...this.overlay.children]) {
      this.overlay.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const v = this.st.view;
    const m = this.selected();
    const y = v === 'plan' ? 0.3 : 0.05;
    if (m && (this.st.tool === 'select' || this.st.tool === 'image') && v !== 'N' && v !== 'E' && v !== 'S' && v !== 'W') {
      const b = bbox(m.outline);
      const corners: V2[] = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
      const wc = corners.map((p) => toWorld(m, p));
      this.line(wc, y, '#9a6a3c', true, true);
      if (v === 'plan') {
        wc.forEach((p, i) => this.handle(new THREE.Vector3(p[0], y, p[1]), 'corner', i));
        const mids: V2[] = [[(b.minX + b.maxX) / 2, b.minZ], [b.maxX, (b.minZ + b.maxZ) / 2], [(b.minX + b.maxX) / 2, b.maxZ], [b.minX, (b.minZ + b.maxZ) / 2]];
        mids.forEach((p, i) => { const w = toWorld(m, p); this.handle(new THREE.Vector3(w[0], y, w[1]), 'side', i, '#f1e5d5'); });
        const rp = toWorld(m, [(b.minX + b.maxX) / 2, b.minZ - Math.max(2, b.d * 0.18)]);
        const top = toWorld(m, [(b.minX + b.maxX) / 2, b.minZ]);
        this.line([top, rp], y, '#9a6a3c');
        this.handle(new THREE.Vector3(rp[0], y, rp[1]), 'rotate', 0, '#b5844f', 'sphere');
      }
      if (v === '3d') {
        const c = toWorld(m, [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]);
        this.handle(new THREE.Vector3(c[0], m.base + m.height + 0.6, c[1]), 'height', 0, '#b5844f', 'sphere');
      }
    }
    if (m && this.st.tool === 'edit' && v === 'plan') {
      const ring = m.outline.map((p) => toWorld(m, p));
      this.line(ring, y, '#9a6a3c', true);
      ring.forEach((p, i) => this.handle(new THREE.Vector3(p[0], y, p[1]), 'vertex', i, i === this.st.vertex ? '#b5844f' : '#ffffff'));
      for (let i = 0; i < m.outline.length; i++) {
        const a = m.outline[i], bb = m.outline[(i + 1) % m.outline.length];
        const mid = bulgeMid(a, bb, m.bulge[i] ?? 0, signedArea(m.outline) > 0);
        const w = toWorld(m, mid);
        this.handle(new THREE.Vector3(w[0], y, w[1]), 'bulge', i, '#d9c3a5', 'sphere');
      }
    }
    if ((this.st.tool === 'poly' || this.st.tool === 'void') && this.draft.length) {
      const pts = this.hover ? [...this.draft, this.hover] : this.draft;
      this.line(pts, y, this.st.tool === 'void' ? '#a4443a' : '#9a6a3c');
      this.draft.forEach((p, i) => this.handle(new THREE.Vector3(p[0], y, p[1]), 'draft', i, i === 0 ? '#b5844f' : '#ffffff'));
    }
    if (this.drag?.kind === 'rect') {
      const r = rectangle(this.drag.start[0], this.drag.start[1], this.drag.cur[0], this.drag.cur[1]);
      this.line(r, y, '#9a6a3c', true);
    }
    if (this.st.tool === 'scale') {
      const pts = this.hover && this.scalePts.length === 1 ? [...this.scalePts, this.hover] : this.scalePts;
      if (pts.length) this.line(pts, y, '#a4443a');
      this.scalePts.forEach((p, i) => this.handle(new THREE.Vector3(p[0], y, p[1]), 'draft', i, '#a4443a'));
    }
    this.updateHandleScale();
    this.invalidate();
  }

  private updateHandleScale() {
    for (const o of this.overlay.children) {
      if (o.userData.handle !== undefined || o.userData.scaleWith) {
        const s = this.perPx(o.position) * HANDLE_PX * 2;
        o.scale.setScalar(s);
      }
    }
  }

  // ------------------------------------------------------------------ hints
  private hint(extra = '') {
    const t: Record<Tool, string> = {
      select: 'تحديد: انقري على كتلة لتحديدها (Shift لإضافة أخرى) واسحبيها لتحريكها. المربعات تغيّر الطول والعرض، الدائرة البرونزية تدوّر. في المنظور: الكرة فوق الكتلة ترفع الارتفاع.',
      rect: 'مستطيل: اسحبي على المخطط من زاوية إلى الزاوية المقابلة.',
      poly: 'شكل حر: انقري لإضافة النقاط. أغلقي الشكل بالنقر على النقطة الأولى أو Enter أو نقر مزدوج. Backspace يحذف آخر نقطة، Esc يلغي، Shift لزوايا 15°.',
      edit: 'تعديل الحدود: اسحبي النقاط البيضاء لتحريكها، والدوائر في منتصف الأضلاع لتقويس الضلع. نقر مزدوج على دائرة الضلع يضيف نقطة.',
      void: 'فراغ: ارسمي شكلاً فوق كتلة لاقتطاعه منها (فناء أو تجويف). أغلقي الشكل كالشكل الحر.',
      scale: 'المقياس: انقري على بداية بُعد معروف في صورة المسقط ثم على نهايته، ثم أدخلي طوله الحقيقي.',
      image: 'تحريك الصورة: اسحبي صورة المسقط لتحريكها (يجب أن تكون غير مثبتة).',
    };
    this.cb.onHint(extra || t[this.st.tool]);
  }

  // ------------------------------------------------------------------ drawing commands (from keyboard)
  closeDraft() {
    if (this.draft.length < 3) return;
    const pts = this.draft;
    this.draft = [];
    if (this.st.tool === 'void') this.applyVoid(pts);
    else this.addMass(pts);
    this.drawOverlay();
  }
  cancelDraft() {
    this.draft = [];
    this.scalePts = [];
    this.drag = null;
    this.drawOverlay();
    this.hint();
  }
  undoPoint() {
    this.draft.pop();
    this.drawOverlay();
  }

  private addMass(world: V2[]) {
    if (Math.abs(signedArea(world)) < 0.25) return this.hint('الشكل صغير جداً.');
    const n = this.st.model.masses.length;
    const m = massFromWorld(world, { name: `كتلة ${n + 1}`, color: MASS_COLORS[n % MASS_COLORS.length] });
    const masses = [...this.st.model.masses, m];
    this.emitMasses(masses, true, 'رسم كتلة');
    this.cb.onSelect([m.id], null);
  }

  private applyVoid(world: V2[]) {
    const hits = this.st.model.masses.filter((m) => intersects(m, world));
    if (!hits.length) return this.hint('ارسمي الفراغ فوق كتلة موجودة ليُقتطع منها.');
    const out: Mass[] = [];
    for (const m of this.st.model.masses) out.push(...(hits.includes(m) ? subtractFromMass(m, world) : [m]));
    this.emitMasses(out, true, 'إضافة فراغ');
  }

  // ------------------------------------------------------------------ pointer handling
  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.focus();
    if (e.button !== 0) return; // right / middle → camera
    const tool = this.st.tool;
    const view = this.st.view;
    const isElev = view !== 'plan' && view !== '3d';
    const now = performance.now();
    // A double-click must be two quick clicks at (almost) the same spot.
    const dbl = now - this.lastClick < 350 && Math.hypot(e.clientX - this.lastXY[0], e.clientY - this.lastXY[1]) < 6;
    this.lastClick = now;
    this.lastXY = [e.clientX, e.clientY];

    if ((tool === 'rect' || tool === 'poly' || tool === 'void' || tool === 'scale') && view !== 'plan') {
      this.cb.onNeedPlanView();
      return;
    }
    const takeOver = () => {
      this.controls.enabled = false;
      e.stopPropagation();
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };

    if (tool === 'scale') {
      const p = this.ground(e);
      if (!p) return;
      takeOver();
      this.scalePts.push(p);
      if (this.scalePts.length === 2) {
        const [a, b] = this.scalePts;
        this.scalePts = [];
        this.cb.onScalePoints(a, b);
      }
      this.drawOverlay();
      return;
    }
    if (tool === 'rect') {
      const p = this.ground(e);
      if (!p) return;
      takeOver();
      const s = this.snapPt(p, e);
      this.drag = { kind: 'rect', start: s, cur: s };
      return;
    }
    if (tool === 'poly' || tool === 'void') {
      const raw = this.ground(e);
      if (!raw) return;
      takeOver();
      const p = this.snapPt(raw, e, this.draft[this.draft.length - 1]);
      const first = this.draft[0];
      if (first && this.draft.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) < this.perPx() * 12) return this.closeDraft();
      if (dbl && this.draft.length >= 3) return this.closeDraft();
      this.draft.push(p);
      this.drawOverlay();
      return;
    }

    // handles first
    const h = this.handleAt(e);
    const m = this.selected();
    if (h && m) {
      takeOver();
      const kind = h.userData.handle as string;
      const idx = h.userData.idx as number;
      if (kind === 'corner' || kind === 'side') this.drag = { kind, idx, mass: m };
      else if (kind === 'rotate') {
        const p = this.ground(e)!;
        this.drag = { kind: 'rotate', mass: m, startAngle: Math.atan2(p[1] - m.z, p[0] - m.x) };
      } else if (kind === 'height') this.drag = { kind: 'height', mass: m, startY: e.clientY, perPx: this.perPx(h.position) };
      else if (kind === 'vertex') {
        this.drag = { kind: 'vertex', idx, mass: m };
        this.cb.onSelect([m.id], idx);
      } else if (kind === 'bulge') {
        if (dbl) {
          this.drag = null;
          this.replaceMass(insertVertex(m, idx), true, 'إضافة نقطة');
          this.cb.onSelect([m.id], idx + 1);
          return;
        }
        this.drag = { kind: 'bulge', idx, mass: m };
      }
      return;
    }

    if (tool === 'image') {
      const ref = this.st.model.reference;
      const p = this.ground(e);
      if (ref && !ref.locked && p) {
        takeOver();
        this.drag = { kind: 'image', start: p, orig: { x: ref.x, z: ref.z } };
      }
      return;
    }

    const id = this.massAt(e);
    if (id) {
      let sel = this.st.selection;
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      this.cb.onSelect(sel, null);
      this.st = { ...this.st, selection: sel };
      if (isElev || tool === 'edit') return;
      const p = this.ground(e);
      if (!p) return;
      takeOver();
      const orig = new Map<string, { x: number; z: number }>();
      for (const mm of this.st.model.masses) if (sel.includes(mm.id)) orig.set(mm.id, { x: mm.x, z: mm.z });
      this.drag = { kind: 'move', start: p, orig };
      return;
    }
    if (!e.shiftKey && this.st.selection.length && (view === 'plan' || isElev)) this.cb.onSelect([], null);
    if (!e.shiftKey && this.st.selection.length && view === '3d') this.cb.onSelect([], null);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.ground(e);
    if (!this.drag) {
      if ((this.st.tool === 'poly' || this.st.tool === 'void') && this.draft.length && p) {
        this.hover = this.snapPt(p, e, this.draft[this.draft.length - 1]);
        const last = this.draft[this.draft.length - 1];
        this.cb.onHint(`طول الضلع: ${Math.hypot(this.hover[0] - last[0], this.hover[1] - last[1]).toFixed(2)} م${this.st.model.measured ? '' : ' (تقريبي)'} — Enter للإغلاق، Backspace لحذف آخر نقطة`);
        this.drawOverlay();
      } else if (this.st.tool === 'scale' && this.scalePts.length === 1 && p) {
        this.hover = p;
        this.drawOverlay();
      }
      return;
    }
    const d = this.drag;
    if (d.kind === 'rect' && p) {
      d.cur = this.snapPt(p, e);
      this.cb.onHint(`${Math.abs(d.cur[0] - d.start[0]).toFixed(2)} × ${Math.abs(d.cur[1] - d.start[1]).toFixed(2)} م${this.st.model.measured ? '' : ' (تقريبي)'}`);
      this.drawOverlay();
      return;
    }
    if (d.kind === 'move' && p) {
      let dx = p[0] - d.start[0], dz = p[1] - d.start[1];
      if (this.st.snap && !e.altKey) { const g = this.st.gridStep; dx = Math.round(dx / g) * g; dz = Math.round(dz / g) * g; }
      this.emitMasses(this.st.model.masses.map((m) => { const o = d.orig.get(m.id); return o ? { ...m, x: o.x + dx, z: o.z + dz } : m; }), false, 'تحريك');
      this.cb.onHint(`إزاحة: ${dx.toFixed(2)} ، ${dz.toFixed(2)} م`);
      return;
    }
    if (d.kind === 'image' && p) {
      const ref = this.st.model.reference!;
      const model = { ...this.st.model, reference: { ...ref, x: d.orig.x + p[0] - d.start[0], z: d.orig.z + p[1] - d.start[1] } };
      this.st = { ...this.st, model };
      this.draggedModel = model;
      this.placeReference();
      this.cb.onChange(model, false, 'تحريك الصورة');
      return;
    }
    if ((d.kind === 'corner' || d.kind === 'side') && p) {
      const m = d.mass;
      const b = bbox(m.outline);
      const lp = toLocal(m, this.snapPt(p, e));
      let sx = 1, sz = 1;
      let anchor: V2 = [0, 0];
      const i = d.idx;
      if (d.kind === 'corner') {
        const opp: V2 = [[b.maxX, b.maxZ], [b.minX, b.maxZ], [b.minX, b.minZ], [b.maxX, b.minZ]][i] as V2;
        anchor = opp;
        sx = Math.abs(lp[0] - opp[0]) / Math.max(1e-6, b.w);
        sz = Math.abs(lp[1] - opp[1]) / Math.max(1e-6, b.d);
        if (e.shiftKey) sx = sz = Math.max(sx, sz);
      } else {
        if (i === 0 || i === 2) { anchor = [0, i === 0 ? b.maxZ : b.minZ]; sz = Math.abs(lp[1] - anchor[1]) / Math.max(1e-6, b.d); }
        else { anchor = [i === 1 ? b.minX : b.maxX, 0]; sx = Math.abs(lp[0] - anchor[0]) / Math.max(1e-6, b.w); }
      }
      const nm = scaleMass(m, Math.max(0.05, sx), Math.max(0.05, sz), anchor);
      const nb = bbox(nm.outline);
      this.replaceMass(nm, false, 'تغيير الأبعاد');
      this.cb.onHint(`الطول ${nb.w.toFixed(2)} م × العرض ${nb.d.toFixed(2)} م${this.st.model.measured ? '' : ' (تقريبي)'}`);
      return;
    }
    if (d.kind === 'rotate' && p) {
      const a = Math.atan2(p[1] - d.mass.z, p[0] - d.mass.x);
      let deg = d.mass.rot + ((a - d.startAngle) * 180) / Math.PI;
      if (!e.altKey) deg = Math.round(deg / (e.shiftKey ? 15 : 1)) * (e.shiftKey ? 15 : 1);
      deg = ((deg % 360) + 360) % 360;
      this.replaceMass({ ...d.mass, rot: deg }, false, 'تدوير');
      this.cb.onHint(`الدوران: ${deg.toFixed(0)}°`);
      return;
    }
    if (d.kind === 'height') {
      let hgt = d.mass.height + (d.startY - e.clientY) * d.perPx;
      if (this.st.snap && !e.altKey) hgt = Math.round(hgt / 0.1) * 0.1;
      hgt = Math.max(0.3, hgt);
      this.replaceMass({ ...d.mass, height: hgt }, false, 'تغيير الارتفاع');
      this.cb.onHint(`الارتفاع: ${hgt.toFixed(2)} م ≈ ${(hgt / d.mass.floorHeight).toFixed(1)} طابق`);
      return;
    }
    if (d.kind === 'vertex' && p) {
      const m = d.mass;
      const lp = toLocal(m, this.snapPt(p, e));
      const outline = m.outline.map((q, k) => (k === d.idx ? lp : q));
      this.replaceMass({ ...m, outline }, false, 'تحريك نقطة');
      return;
    }
    if (d.kind === 'bulge' && p) {
      const m = d.mass;
      const a = m.outline[d.idx], b = m.outline[(d.idx + 1) % m.outline.length];
      const lp = toLocal(m, p);
      const ccw = signedArea(m.outline) > 0;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const nx = ccw ? dz / L : -dz / L, nz = ccw ? -dx / L : dx / L;
      let s = (lp[0] - (a[0] + b[0]) / 2) * nx + (lp[1] - (a[1] + b[1]) / 2) * nz;
      if (Math.abs(s) < this.perPx() * 6) s = 0;
      const bulge = m.bulge.slice();
      bulge[d.idx] = Math.round(s * 20) / 20;
      this.replaceMass({ ...m, bulge }, false, 'تقويس ضلع');
      this.cb.onHint(`تقوّس الضلع: ${bulge[d.idx].toFixed(2)} م (موجب = للخارج)`);
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.controls.enabled = true;
    if (!d) return;
    this.drag = null;
    try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (d.kind === 'rect') {
      const r = rectangle(d.start[0], d.start[1], d.cur[0], d.cur[1]);
      this.drawOverlay();
      if (Math.abs(d.cur[0] - d.start[0]) > 0.3 && Math.abs(d.cur[1] - d.start[1]) > 0.3) this.addMass(r);
      else this.hint();
      return;
    }
    if (this.draggedModel) {
      const labels: Record<string, string> = { move: 'تحريك', image: 'تحريك الصورة', corner: 'تغيير الأبعاد', side: 'تغيير الأبعاد', rotate: 'تدوير', height: 'تغيير الارتفاع', vertex: 'تحريك نقطة', bulge: 'تقويس ضلع' };
      this.cb.onChange(this.draggedModel, true, labels[d.kind] ?? 'تعديل');
      this.draggedModel = null;
    }
    this.hint();
  };

  /** Screen (client) coordinates of a world point — used by tests and tooltips. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  get model() {
    return this.st.model;
  }

  // ------------------------------------------------------------------ export
  async snapshotPng(scale = 2): Promise<Blob> {
    if (!this.st.model.masses.length) throw new ExportError('لا توجد كتل بعد — ارسمي كتلة واحدة على الأقل قبل التصدير.');
    const bg = this.scene.background;
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    try {
      return await captureScene({
        renderer: this.renderer, scene: this.scene, camera: this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera, target: this.controls.target,
        content: this.massGroup, scale, width: w, height: h,
        before: () => { this.overlay.visible = false; this.scene.background = new THREE.Color('#ffffff'); },
        after: () => { this.overlay.visible = true; this.scene.background = bg; },
      });
    } finally {
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.setSize(w, h);
      this.invalidate();
    }
  }

  exportGLB(): Promise<Blob> {
    if (!this.st.model.masses.length) return Promise.reject(new ExportError('لا توجد كتل لتصديرها.'));
    const root = new THREE.Group();
    root.name = this.st.model.title;
    for (const m of this.st.model.masses) {
      const data = buildMassMesh(m);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.85, side: THREE.DoubleSide }));
      mesh.name = m.name;
      mesh.userData = { height_m: m.height, base_m: m.base, roof: m.roof.type };
      root.add(mesh);
    }
    return new Promise((resolve, reject) =>
      new GLTFExporter().parse(root, (r) => resolve(new Blob([r as ArrayBuffer], { type: 'model/gltf-binary' })), reject, { binary: true }),
    );
  }
}

function pip([x, z]: V2, r: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function bulgeMid(a: V2, b: V2, s: number, ccw: boolean): V2 {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz) || 1;
  const nx = ccw ? dz / L : -dz / L, nz = ccw ? -dx / L : dx / L;
  return [(a[0] + b[0]) / 2 + s * nx, (a[1] + b[1]) / 2 + s * nz];
}
