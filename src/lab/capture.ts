// Reliable WebGL capture: rendered content, model inside the frame, context alive.
import * as THREE from 'three';
import { ExportError, nextFrames } from '../lib/exportGuard';

/** True when every corner of the box projects inside the camera frame (with a small margin). */
export function boxInFrame(box: THREE.Box3, cam: THREE.Camera, margin = 0.96): boolean {
  const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  for (const p of pts) {
    const v = p.clone().project(cam);
    if (!(Math.abs(v.x) <= margin && Math.abs(v.y) <= margin && v.z > -1 && v.z < 1)) return false;
  }
  return true;
}

/** Move/zoom the camera (keeping its viewing direction) so the box fits. Returns a restore function. */
export function frameBox(box: THREE.Box3, cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, target: THREE.Vector3): () => void {
  const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), zoom: (cam as THREE.OrthographicCamera).zoom, target: target.clone() };
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = cam.getWorldDirection(new THREE.Vector3());
  if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const pc = cam as THREE.PerspectiveCamera;
    const fov = Math.min(pc.fov, (2 * Math.atan(Math.tan((pc.fov * Math.PI) / 360) * pc.aspect) * 180) / Math.PI);
    const dist = (sphere.radius * 1.12) / Math.sin((fov * Math.PI) / 360);
    pc.position.copy(sphere.center).addScaledVector(dir, -dist);
    pc.lookAt(sphere.center);
    pc.near = Math.max(0.05, dist - sphere.radius * 3);
    pc.far = dist + sphere.radius * 4;
    pc.updateProjectionMatrix();
  } else {
    const oc = cam as THREE.OrthographicCamera;
    const halfH = (oc.top - oc.bottom) / 2, halfW = (oc.right - oc.left) / 2;
    oc.position.copy(sphere.center).addScaledVector(dir, -sphere.radius * 6 - 100);
    oc.lookAt(sphere.center);
    oc.zoom = Math.min(halfH, halfW) / (sphere.radius * 1.1);
    oc.updateProjectionMatrix();
  }
  return () => {
    cam.position.copy(saved.pos);
    cam.quaternion.copy(saved.quat);
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) (cam as THREE.OrthographicCamera).zoom = saved.zoom;
    (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
    target.copy(saved.target);
  };
}

/**
 * Render the scene and capture it as PNG after the frame is really presented.
 * Throws ExportError when there is nothing to capture or WebGL was lost.
 */
export async function captureScene(opts: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  content: THREE.Object3D;
  scale?: number;
  width: number;
  height: number;
  before?: () => void;
  after?: () => void;
}): Promise<Blob> {
  const { renderer, scene, camera, content } = opts;
  if (renderer.getContext().isContextLost()) throw new ExportError('توقف عرض الرسوميات (WebGL) في المتصفح — أعيدي فتح الصفحة ثم صدّري مجدداً. لم يُنزَّل أي ملف.');
  const box = new THREE.Box3();
  content.traverse((o) => { if ((o as THREE.Mesh).isMesh) box.expandByObject(o); });
  if (box.isEmpty()) throw new ExportError('لا يوجد تصميم في المشهد لتصديره — ارسمي أو ولّدي كتلة أولاً.');
  const restore = boxInFrame(box, camera) ? null : frameBox(box, camera, opts.target);
  const prevRatio = renderer.getPixelRatio();
  try {
    opts.before?.();
    renderer.setPixelRatio(opts.scale ?? 2);
    renderer.setSize(opts.width, opts.height, false);
    renderer.render(scene, camera);
    await nextFrames(2);
    renderer.render(scene, camera); // render again right before reading the buffer
    const blob = await new Promise<Blob | null>((res) => renderer.domElement.toBlob(res, 'image/png'));
    if (!blob) throw new ExportError('تعذّر التقاط صورة المشهد.');
    return blob;
  } finally {
    restore?.();
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(opts.width, opts.height, false);
    opts.after?.();
    renderer.render(scene, camera);
  }
}
