import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { CheckItem } from '../data/checklists';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface ToastMsg { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Modal & confirm
// ---------------------------------------------------------------------------
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="إغلاق"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmOpts { title: string; body?: ReactNode; confirm?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Modal
          title={state.title}
          onClose={() => done(false)}
          footer={
            <>
              <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
                {state.confirm ?? 'تأكيد'}
              </button>
              <button className="btn ghost" onClick={() => done(false)}>إلغاء</button>
            </>
          }
        >
          <div className="muted">{state.body}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function TextField({ label, value, onChange, placeholder, hint, className, type = 'text', dirLtr }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; className?: string; type?: string; dirLtr?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value} placeholder={placeholder} dir={dirLtr ? 'ltr' : undefined} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, hint, rows = 4, className }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; rows?: number; className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/**
 * Numeric input that keeps the raw text while typing (so "1." or "" are
 * allowed) and reports a parsed number. Accepts Arabic-Indic digits.
 */
export function NumField({ label, value, onChange, unit, hint, min, max, step, className, allowEmpty }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; hint?: string; min?: number; max?: number; step?: number; className?: string; allowEmpty?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(fmtInput(value, allowEmpty));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(fmtInput(value, allowEmpty));
      last.current = value;
    }
  }, [value, allowEmpty]);
  const parsed = parseNum(text);
  const invalid = text.trim() !== '' && (isNaN(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max));
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className={unit ? 'input-unit' : undefined}>
        <input
          id={id}
          className={`input num-input ${invalid ? 'invalid' : ''}`}
          inputMode="decimal"
          value={text}
          step={step}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNum(e.target.value);
            if (e.target.value.trim() === '') {
              last.current = 0;
              onChange(0);
            } else if (!isNaN(n)) {
              last.current = n;
              onChange(n);
            }
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {invalid ? <span className="hint" style={{ color: 'var(--danger)' }}>قيمة غير صالحة{min !== undefined ? ` (≥ ${min})` : ''}{max !== undefined ? ` (≤ ${max})` : ''}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function fmtInput(v: number, allowEmpty?: boolean) {
  if (allowEmpty && v === 0) return '';
  return Number.isFinite(v) ? String(v) : '';
}

export function parseNum(s: string): number {
  const western = s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,]/g, '.')
    .trim();
  if (western === '' || !/^-?\d*\.?\d*(e-?\d+)?$/i.test(western)) return NaN;
  return Number(western);
}

export function Select<T extends string>({ label, value, onChange, options, className }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ icon = 'folder', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Note({ kind = 'info', icon, children }: { kind?: 'info' | 'warn' | 'danger' | 'bronze' | 'sage'; icon?: string; children: ReactNode }) {
  const ic = icon ?? (kind === 'warn' || kind === 'danger' ? 'alert' : 'info');
  return (
    <div className={`note ${kind === 'info' ? '' : kind}`}>
      <Icon name={ic} />
      <div>{children}</div>
    </div>
  );
}

export function Stat({ k, v, unit }: { k: ReactNode; v: ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <span className="v">{v}{unit && <span className="small" style={{ fontWeight: 400, marginInlineStart: 4 }}>{unit}</span>}</span>
      <span className="k">{k}</span>
    </div>
  );
}

export function Checklist({ items, state, onToggle }: { items: CheckItem[]; state: Record<string, boolean>; onToggle: (id: string, v: boolean) => void }) {
  return (
    <div className="stack sm">
      {items.map((it) => (
        <label key={it.id} className={`check ${state[it.id] ? 'done' : ''}`}>
          <input type="checkbox" checked={!!state[it.id]} onChange={(e) => onToggle(it.id, e.target.checked)} />
          <span>
            {it.text}
            {it.hint && <span className="en" style={{ display: 'block' }}>{it.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function SaveIndicator({ saving }: { saving: boolean }) {
  return <span className={`save-dot ${saving ? 'saving' : ''}`}>{saving ? 'جارٍ الحفظ…' : 'محفوظ على هذا الجهاز'}</span>;
}

/** Simple list of strings with add/remove (used for opportunities, constraints...). */
export function ChipEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, t]);
    setDraft('');
  };
  return (
    <div className="stack sm">
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button className="btn" type="button" onClick={add}><Icon name="plus" />إضافة</button>
      </div>
      {items.length > 0 && (
        <div className="chip-list">
          {items.map((t, i) => (
            <span className="chip" key={i}>
              {t}
              <button type="button" aria-label={`حذف ${t}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="close" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Label-less numeric input for table cells (keeps raw text while typing). */
export function NumInput({ value, onChange, ariaLabel, integer }: { value: number; onChange: (v: number) => void; ariaLabel: string; integer?: boolean }) {
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value ? String(value) : '');
      last.current = value;
    }
  }, [value]);
  return (
    <input
      className="input num-input"
      inputMode={integer ? 'numeric' : 'decimal'}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        let n = e.target.value.trim() === '' ? 0 : parseNum(e.target.value);
        if (isNaN(n)) return;
        if (integer) n = Math.round(n);
        last.current = n;
        onChange(n);
      }}
    />
  );
}
