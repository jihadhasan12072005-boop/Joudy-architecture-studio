// Browser client for Joudy's private AI backend (see /worker).
// The provider API key NEVER reaches the browser: the browser only holds a
// personal access token for the backend, which the backend verifies (hashed).

import type { Project } from '../db/types';
import { summarizeProgram } from '../lib/program';

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string;
  month: string;
  spentEur: number;
  limitEur: number;
  remainingEur: number;
  requestsToday: number;
  maxRequestsPerDay: number;
  maxImageBytes: number;
  message?: string;
}

export interface AiMessagePart {
  type: 'text' | 'image';
  text?: string;
  dataUrl?: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: AiMessagePart[];
}

export interface AiReply {
  text: string;
  costEur: number;
  spentEur: number;
  limitEur: number;
}

export class AiError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

const ERR_AR: Record<string, string> = {
  network: 'تعذّر الوصول إلى خادم المساعد. تحققي من الإنترنت أو جرّبي لاحقاً — باقي التطبيق يعمل بدون إنترنت.',
  unauthorized: 'رمز الوصول غير صحيح. تحققي منه في الإعدادات.',
  budget_exceeded: 'وصل استهلاك هذا الشهر إلى الحد الأقصى للميزانية. سيعود المساعد مع بداية الشهر القادم.',
  rate_limited: 'تم تجاوز عدد الطلبات المسموح اليوم. جرّبي غداً.',
  disabled: 'المساعد غير مفعّل على الخادم بعد.',
  too_large: 'الطلب أو الصورة أكبر من الحد المسموح.',
  provider_error: 'مزود الذكاء الاصطناعي أعاد خطأ. جرّبي بعد قليل.',
  timeout: 'استغرق الرد وقتاً طويلاً. جرّبي سؤالاً أقصر أو صورة أصغر.',
};

async function call<T>(endpoint: string, token: string, path: string, init?: RequestInit, timeoutMs = 90000): Promise<T> {
  const base = endpoint.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new AiError(ERR_AR[(e as Error).name === 'AbortError' ? 'timeout' : 'network'], 'network');
  } finally {
    clearTimeout(timer);
  }
  let body: { error?: string; message?: string } & Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const code = body.error ?? (res.status === 401 ? 'unauthorized' : 'provider_error');
    throw new AiError(ERR_AR[code] ?? body.message ?? `خطأ ${res.status}`, code);
  }
  return body as T;
}

export function getStatus(endpoint: string, token: string): Promise<AiStatus> {
  return call<AiStatus>(endpoint, token, '/v1/status', { method: 'GET' }, 15000);
}

export function sendChat(endpoint: string, token: string, messages: AiChatMessage[], context: string): Promise<AiReply> {
  return call<AiReply>(endpoint, token, '/v1/chat', { method: 'POST', body: JSON.stringify({ messages, context }) });
}

/** Compact project summary sent as context (kept short to control cost). */
export function projectContext(p: Project | undefined): string {
  if (!p) return '';
  const s = summarizeProgram(p);
  const lines = [
    `المشروع: ${p.name}${p.type ? ` (${p.type})` : ''} — ${p.location}`,
    s.site ? `مساحة الموقع: ${Math.round(s.site)} م²${p.siteWidth && p.siteDepth ? ` (${p.siteWidth}×${p.siteDepth} م)` : ''}` : '',
    `عدد الطوابق: ${p.floors}${p.basements ? ` + ${p.basements} قبو` : ''}`,
    p.orientation ? `التوجيه: ${p.orientation}` : '',
    p.brief ? `البرنامج: ${p.brief.slice(0, 900)}` : '',
    p.constraints ? `المحددات: ${p.constraints.slice(0, 400)}` : '',
    p.concept.statement ? `الفكرة: ${p.concept.statement.slice(0, 400)}` : '',
    p.site.opportunities.length ? `فرص الموقع: ${p.site.opportunities.join('، ').slice(0, 300)}` : '',
    p.site.constraints.length ? `محددات الموقع: ${p.site.constraints.join('، ').slice(0, 300)}` : '',
    p.program.spaces.length
      ? `جدول الفراغات (صافي ${Math.round(s.net)} م²، إجمالي تقديري ${Math.round(s.gross)} م²): ` +
        p.program.spaces.slice(0, 25).map((r) => `${r.name} ${r.quantity}×${r.unitArea}م² ط${r.floor}`).join('؛ ')
      : '',
  ];
  return lines.filter(Boolean).join('\n').slice(0, 3500);
}
