import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '../db/repo';

/**
 * Run an async loader and re-run it whenever the database changes.
 * Returns undefined while loading the first time.
 */
export function useLive<T>(loader: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let alive = true;
    const run = () => loaderRef.current().then((v) => alive && setValue(v)).catch((e) => console.error(e));
    run();
    const unsub = subscribe(run);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Object URL for a Blob that is revoked automatically. */
export function useObjectUrl(blob: Blob | undefined | null): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Debounced autosave: call `schedule(value)`; `flush()` saves immediately. */
export function useAutosave<T>(save: (v: T) => Promise<unknown>, delay = 700) {
  const [saving, setSaving] = useState(false);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    pending.current = null;
    if (v !== null) {
      try {
        await saveRef.current(v);
      } finally {
        setSaving(false);
      }
    }
  }, []);

  const schedule = useCallback(
    (v: T) => {
      pending.current = v;
      setSaving(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, saving };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
