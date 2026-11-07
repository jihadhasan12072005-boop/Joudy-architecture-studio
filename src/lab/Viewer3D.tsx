import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import type { Volume } from './model';
import type { Polygon } from './trace';

export interface ViewerApi {
  snapshot: (scale?: number) => Promise<Blob>;
  exportGLB: () => Promise<Blob>;
  exportOBJ: () => Blob;
  setView: (v: 'persp' | 'axon' | 'top' | 'front') => void;
}

export interface ViewerProps {
  volumes: Volume[];
  mPerPx: number;
  center: [number, number]; // px
  colorOf: (v: Volume, i: number) => string;
  edges: boolean;
  sun: { altitude: number; azimuth: number } | null;
  northAngle: number;
  floorHeight: number;
  floorLines: boolean;
  onReady?: (api: ViewerApi) => void;
  height?: number | string;
}

function shapeFrom(p: Polygon, m: number, c: [number, number]): THREE.Shape {
  // Shape lives in XY; after rotateX(-90°) plan y (down) maps to world +Z.
  const toV = ([x, y]: [number, number]) => new THREE.Vector2((x - c[0]) * m, -(y - c[1]) * m);
  const s = new THREE.Shape(p.outer.map(toV));
  for (const h of p.holes) s.holes.push(new THREE.Path(h.map(toV)));
  return s;
}

export function Viewer3D(props: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera;
    cam: THREE.Camera; controls: OrbitControls; group: THREE.Group; sun: THREE.DirectionalLight; ground: THREE.Mesh; radius: number; render: () => void;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Init once
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3eee5');
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    const ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, -5000, 5000);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    scene.add(new THREE.HemisphereLight('#fffaf0', '#b9ab95', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ebe4d8', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const group = new THREE.Group();
    scene.add(group);
    const s = { renderer, scene, persp, ortho, cam: persp as THREE.Camera, controls, group, sun, ground, radius: 30, render: () => {} };
    s.render = () => renderer.render(scene, s.cam);
    controls.addEventListener('change', s.render);
    st.current = s;

    const resize = () => {
      const w = el.clientWidth || 600, h = el.clientHeight || 400;
      renderer.setSize(w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      const r = s.radius * 1.3;
      ortho.left = (-r * w) / h; ortho.right = (r * w) / h; ortho.top = r; ortho.bottom = -r;
      ortho.updateProjectionMatrix();
      s.render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const setView = (v: 'persp' | 'axon' | 'top' | 'front') => {
      const R = s.radius;
      controls.object = v === 'persp' ? persp : ortho;
      s.cam = controls.object as THREE.Camera;
      const pos: Record<string, [number, number, number]> = {
        persp: [R * 2.2, R * 1.75, R * 2.6],
        axon: [R * 2, R * 2 * 0.8165, R * 2],
        top: [0, R * 4, 0.001],
        front: [0, R * 0.35, R * 4],
      };
      s.cam.position.set(...pos[v]);
      controls.target.set(0, v === 'front' ? R * 0.2 : 0, 0);
      if (s.cam instanceof THREE.OrthographicCamera) { s.cam.zoom = 1; s.cam.updateProjectionMatrix(); }
      controls.update();
      s.render();
    };

    const api: ViewerApi = {
      setView,
      snapshot: (scale = 2) =>
        new Promise((resolve) => {
          const w = el.clientWidth, h = el.clientHeight;
          renderer.setPixelRatio(scale);
          renderer.setSize(w, h);
          s.render();
          renderer.domElement.toBlob((b) => {
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(w, h);
            s.render();
            resolve(b!);
          }, 'image/png');
        }),
      exportGLB: () =>
        new Promise((resolve, reject) =>
          new GLTFExporter().parse(group, (r) => resolve(new Blob([r as ArrayBuffer], { type: 'model/gltf-binary' })), reject, { binary: true }),
        ),
      exportOBJ: () => new Blob([new OBJExporter().parse(group)], { type: 'text/plain' }),
    };
    (s as unknown as { api: ViewerApi }).api = api;
    propsRef.current.onReady?.(api);
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      st.current = null;
    };
  }, []);

  // Rebuild geometry when inputs change
  const { volumes, mPerPx, center, edges, floorLines, floorHeight } = props;
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    s.group.clear();
    let maxX = 1, maxZ = 1, maxY = 1;
    volumes.forEach((v, i) => {
      const color = propsRef.current.colorOf(v, i);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const lineMat = new THREE.LineBasicMaterial({ color: '#2e2b27' });
      const floorMat = new THREE.LineBasicMaterial({ color: '#6e675d', transparent: true, opacity: 0.55 });
      for (const p of v.polys) {
        const shape = shapeFrom(p, mPerPx, center);
        const depth = Math.max(0.05, v.z1 - v.z0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, v.z0, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `volume-${i}-floors-${v.floors}`;
        s.group.add(mesh);
        if (edges) s.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMat));
        if (floorLines && v.floors > 1) {
          for (let k = 1; k < v.floors; k++) {
            const y = v.z0 + k * floorHeight;
            for (const ring of [p.outer, ...p.holes]) {
              const pts = ring.map(([x, z]) => new THREE.Vector3((x - center[0]) * mPerPx, y, (z - center[1]) * mPerPx));
              pts.push(pts[0].clone());
              s.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), floorMat));
            }
          }
        }
        for (const [x, y] of p.outer) {
          maxX = Math.max(maxX, Math.abs((x - center[0]) * mPerPx));
          maxZ = Math.max(maxZ, Math.abs((y - center[1]) * mPerPx));
        }
        maxY = Math.max(maxY, v.z1);
      }
    });
    const R = Math.max(maxX, maxZ, maxY * 0.9, 5);
    const first = s.radius === 30 && volumes.length > 0;
    s.radius = R;
    s.ground.scale.set(R * 8, R * 8, 1);
    const cam = s.sun.shadow.camera;
    cam.left = -R * 1.8; cam.right = R * 1.8; cam.top = R * 1.8; cam.bottom = -R * 1.8; cam.near = 0.5; cam.far = R * 10;
    cam.updateProjectionMatrix();
    s.persp.far = R * 40;
    s.persp.updateProjectionMatrix();
    if (first) (s as unknown as { api: ViewerApi }).api.setView('persp');
    s.render();
  }, [volumes, mPerPx, center, edges, floorLines, floorHeight]);

  // Sun
  const { sun, northAngle } = props;
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const R = s.radius;
    let alt = 45, az = 135;
    if (sun) { alt = sun.altitude; az = sun.azimuth; }
    const visible = alt > 0.5;
    const th = ((az + northAngle) * Math.PI) / 180, a = (Math.max(alt, 2) * Math.PI) / 180;
    s.sun.position.set(Math.sin(th) * Math.cos(a) * R * 4, Math.sin(a) * R * 4, -Math.cos(th) * Math.cos(a) * R * 4);
    s.sun.target.position.set(0, 0, 0);
    s.sun.intensity = visible ? 2.2 : 0.15;
    s.sun.castShadow = !!sun && visible;
    s.render();
  }, [sun, northAngle]);

  return <div ref={host} className="viewer3d" style={{ height: props.height ?? 520 }} />;
}

export default Viewer3D;
