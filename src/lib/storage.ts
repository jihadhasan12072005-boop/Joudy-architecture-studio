import { fmtBytes } from './format';

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean | null;
  supported: boolean;
}

export async function storageInfo(): Promise<StorageInfo> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, persisted: null, supported: false };
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return { usage, quota, persisted, supported: true };
}

/** Returns a warning message when storage is getting full, otherwise null. */
export async function checkStorage(): Promise<string | null> {
  const s = await storageInfo();
  if (!s.supported || !s.quota) return null;
  const ratio = s.usage / s.quota;
  if (ratio > 0.9) return `تحذير: مساحة التخزين شبه ممتلئة (${fmtBytes(s.usage)} من ${fmtBytes(s.quota)}). خذي نسخة احتياطية واحذفي ملفات غير ضرورية.`;
  if (ratio > 0.75) return `انتباه: استُهلك ${Math.round(ratio * 100)}٪ من مساحة التخزين المتاحة للتطبيق.`;
  return null;
}
