import { useEffect, useState } from 'react';
import { Icon } from './Icon';

// Service-worker update prompt. Updating replaces only the app code; all of
// Joudy's data lives in IndexedDB and is untouched (and migrated if needed).
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
const subs = new Set<() => void>();
let needRefresh = false;

export async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateFn = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      subs.forEach((s) => s());
    },
    onRegisterError(e: unknown) {
      console.warn('SW registration failed', e);
    },
  });
}

export function UpdateBanner() {
  const [show, setShow] = useState(needRefresh);
  useEffect(() => {
    const s = () => setShow(true);
    subs.add(s);
    return () => {
      subs.delete(s);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="note bronze" style={{ margin: '12px var(--gutter) 0', alignItems: 'center' }}>
      <Icon name="refresh" />
      <div style={{ flex: 1 }}>يتوفر إصدار أحدث من التطبيق. مشاريعك وملفاتك محفوظة ولن تتأثر بالتحديث.</div>
      <button className="btn sm bronze" onClick={() => updateFn?.(true)}>تحديث الآن</button>
      <button className="btn sm ghost" onClick={() => setShow(false)}>لاحقاً</button>
    </div>
  );
}
