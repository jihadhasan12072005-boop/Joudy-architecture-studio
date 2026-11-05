// Number & date formatting. We use Western digits (0-9) for technical values —
// standard practice in Syrian engineering drawings — with Arabic text around them.

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtFixed(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b)) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

/** Levantine month names, as used in Syria. */
export function fmtDate(input: string | number | Date): string {
  const d = typeof input === 'string' ? new Date(input + (input.length === 10 ? 'T00:00:00' : '')) : new Date(input);
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${fmtDate(d)} — ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.round(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return fmtDate(ms);
}

/** Whole days from today to an ISO date (negative = overdue). */
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function dueLabel(iso: string): { text: string; kind: 'danger' | 'warn' | 'sage' | '' } {
  const n = daysUntil(iso);
  if (n === null) return { text: 'بدون موعد', kind: '' };
  if (n < 0) return { text: `متأخر ${-n} يوم`, kind: 'danger' };
  if (n === 0) return { text: 'اليوم', kind: 'danger' };
  if (n === 1) return { text: 'غداً', kind: 'warn' };
  if (n <= 7) return { text: `بعد ${n} أيام`, kind: 'warn' };
  return { text: `بعد ${n} يوم`, kind: 'sage' };
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
