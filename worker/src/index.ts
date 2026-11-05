// Joudy Architecture Studio — private AI backend (Cloudflare Worker).
//
// Responsibilities:
//  * keep the provider API key server-side (Worker secret, never sent to the browser)
//  * authenticate the single user with a personal access token (only its SHA-256 is stored)
//  * enforce request/image size limits and a per-day request cap
//  * enforce a HARD monthly spending cap via the BudgetLedger Durable Object
//  * talk to any OpenAI-compatible chat-completions API (provider is configuration)
//
// AI_ENABLED defaults to "false". Only enable it with a provider whose terms
// permit use by an end user located in Syria (see docs/AI-FEASIBILITY.md).

import { BudgetLedger, costEur, estimateInputTokens, type Prices } from './budget';
import { SYSTEM_PROMPT } from './prompt';

export { BudgetLedger };

interface DONamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface Env {
  LEDGER: DONamespace;
  AI_ENABLED?: string;
  PROVIDER_NAME?: string;
  PROVIDER_BASE_URL?: string; // e.g. https://api.example.com/v1
  PROVIDER_MODEL?: string;
  PROVIDER_API_KEY?: string; // secret
  ACCESS_TOKEN_SHA256?: string; // secret: hex sha256 of Joudy's access token
  ALLOWED_ORIGINS?: string; // comma separated, e.g. https://user.github.io
  PRICE_INPUT_USD_PER_MTOK?: string;
  PRICE_OUTPUT_USD_PER_MTOK?: string;
  USD_TO_EUR?: string;
  MONTHLY_LIMIT_EUR?: string;
  MAX_OUTPUT_TOKENS?: string;
  MAX_REQUESTS_PER_DAY?: string;
  MAX_IMAGE_BYTES?: string;
  TOKENS_PER_IMAGE?: string;
  SAFETY_MARGIN?: string;
}

const MAX_MESSAGES = 12;
const MAX_TEXT_CHARS = 24000;
const MAX_IMAGES = 2;
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function config(env: Env) {
  return {
    enabled: env.AI_ENABLED === 'true',
    provider: env.PROVIDER_NAME ?? 'unconfigured',
    model: env.PROVIDER_MODEL ?? '',
    prices: {
      inputUsdPerMTok: num(env.PRICE_INPUT_USD_PER_MTOK, 0),
      outputUsdPerMTok: num(env.PRICE_OUTPUT_USD_PER_MTOK, 0),
      usdToEur: num(env.USD_TO_EUR, 0.95),
    } as Prices,
    limitEur: Math.min(num(env.MONTHLY_LIMIT_EUR, 4.5), 5), // never above €5
    maxOut: Math.min(num(env.MAX_OUTPUT_TOKENS, 1200), 4000),
    maxPerDay: num(env.MAX_REQUESTS_PER_DAY, 60),
    maxImageBytes: num(env.MAX_IMAGE_BYTES, 1_500_000),
    tokensPerImage: num(env.TOKENS_PER_IMAGE, 1800),
    safety: Math.max(1, num(env.SAFETY_MARGIN, 1.25)),
  };
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function authorized(req: Request, env: Env): Promise<boolean> {
  const expected = (env.ACCESS_TOKEN_SHA256 ?? '').toLowerCase().trim();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  const m = /^Bearer\s+(.+)$/.exec(req.headers.get('Authorization') ?? '');
  if (!m) return false;
  return timingSafeEqual(await sha256Hex(m[1].trim()), expected);
}

interface InPart { type: 'text' | 'image'; text?: string; dataUrl?: string }
interface InMessage { role: 'user' | 'assistant'; content: InPart[] }

export type Validated =
  | { ok: true; messages: InMessage[]; context: string; chars: number; images: number }
  | { ok: false; error: string };

export function validate(body: unknown, maxImageBytes: number): Validated {
  const b = body as { messages?: unknown; context?: unknown };
  if (!b || !Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return { ok: false, error: 'bad_request' };
  let chars = 0;
  let images = 0;
  const context = typeof b.context === 'string' ? b.context.slice(0, 4000) : '';
  chars += context.length;
  const out: InMessage[] = [];
  for (const raw of b.messages as InMessage[]) {
    if (!raw || (raw.role !== 'user' && raw.role !== 'assistant') || !Array.isArray(raw.content)) return { ok: false, error: 'bad_request' };
    const parts: InPart[] = [];
    for (const p of raw.content) {
      if (p?.type === 'text' && typeof p.text === 'string') {
        chars += p.text.length;
        parts.push({ type: 'text', text: p.text });
      } else if (p?.type === 'image' && typeof p.dataUrl === 'string' && raw.role === 'user') {
        const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(p.dataUrl);
        if (!m) return { ok: false, error: 'bad_request' };
        if (Math.floor((m[2].length * 3) / 4) > maxImageBytes) return { ok: false, error: 'too_large' };
        images++;
        parts.push({ type: 'image', dataUrl: p.dataUrl });
      } else return { ok: false, error: 'bad_request' };
    }
    out.push({ role: raw.role, content: parts });
  }
  if (chars > MAX_TEXT_CHARS || images > MAX_IMAGES) return { ok: false, error: 'too_large' };
  if (out[out.length - 1].role !== 'user') return { ok: false, error: 'bad_request' };
  return { ok: true, messages: out, context, chars: chars + SYSTEM_PROMPT.length, images };
}

/** OpenAI-compatible chat/completions payload (supported by many providers). */
export function providerPayload(model: string, maxOut: number, v: Extract<Validated, { ok: true }>) {
  const system = SYSTEM_PROMPT + (v.context ? `\n\nسياق المشروع الحالي (من بيانات جودي):\n${v.context}` : '');
  return {
    model,
    max_tokens: maxOut,
    temperature: 0.4,
    messages: [
      { role: 'system', content: system },
      ...v.messages.map((m) => ({
        role: m.role,
        content: m.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: p.dataUrl } })),
      })),
    ],
  };
}

async function ledger(env: Env, path: string, body?: unknown) {
  const stub = env.LEDGER.get(env.LEDGER.idFromName('joudy'));
  const r = await stub.fetch(`https://ledger${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  return (await r.json()) as { ok?: boolean; error?: string; spentEur: number; requestsToday?: number; month?: string };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const cfg = config(env);

    if (!(await authorized(req, env))) return json({ error: 'unauthorized' }, 401, h);

    if (url.pathname === '/v1/status' && req.method === 'GET') {
      const s = await ledger(env, '/status');
      const ready = cfg.enabled && !!env.PROVIDER_API_KEY && !!env.PROVIDER_BASE_URL && !!cfg.model && cfg.prices.inputUsdPerMTok > 0;
      return json(
        {
          enabled: ready,
          provider: cfg.provider,
          model: cfg.model,
          month: s.month,
          spentEur: s.spentEur,
          limitEur: cfg.limitEur,
          remainingEur: Math.max(0, cfg.limitEur - s.spentEur),
          requestsToday: s.requestsToday ?? 0,
          maxRequestsPerDay: cfg.maxPerDay,
          maxImageBytes: cfg.maxImageBytes,
          message: ready ? undefined : 'AI is disabled on the server (AI_ENABLED is not "true" or provider settings/prices are missing).',
        },
        200,
        h,
      );
    }

    if (url.pathname === '/v1/chat' && req.method === 'POST') {
      if (!cfg.enabled || !env.PROVIDER_API_KEY || !env.PROVIDER_BASE_URL || !cfg.model || cfg.prices.inputUsdPerMTok <= 0) {
        return json({ error: 'disabled' }, 503, h);
      }
      const len = Number(req.headers.get('Content-Length') ?? '0');
      if (len > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, h);
      let body: unknown;
      try {
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413, h);
        body = JSON.parse(text);
      } catch {
        return json({ error: 'bad_request' }, 400, h);
      }
      const v = validate(body, cfg.maxImageBytes);
      if (!v.ok) return json({ error: v.error }, v.error === 'too_large' ? 413 : 400, h);

      const estIn = estimateInputTokens(v.chars, v.images, cfg.tokensPerImage);
      const reserveAmount = costEur(estIn, cfg.maxOut, cfg.prices) * cfg.safety;
      const id = crypto.randomUUID();
      const r = await ledger(env, '/reserve', { amount: reserveAmount, limitEur: cfg.limitEur, maxPerDay: cfg.maxPerDay, id });
      if (!r.ok) return json({ error: r.error, spentEur: r.spentEur, limitEur: cfg.limitEur }, r.error === 'rate_limited' ? 429 : 402, h);

      let actual = reserveAmount; // if anything unexpected happens, keep the conservative charge
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 80000);
        const res = await fetch(env.PROVIDER_BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PROVIDER_API_KEY}` },
          body: JSON.stringify(providerPayload(cfg.model, cfg.maxOut, v)),
        }).finally(() => clearTimeout(timer));
        if (!res.ok) {
          actual = 0; // providers do not bill rejected requests
          console.warn('provider status', res.status); // no content logged
          return json({ error: 'provider_error' }, 502, h);
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const text = data.choices?.[0]?.message?.content ?? '';
        if (data.usage?.prompt_tokens !== undefined && data.usage?.completion_tokens !== undefined) {
          actual = costEur(data.usage.prompt_tokens, data.usage.completion_tokens, cfg.prices);
        }
        const settled = await ledger(env, '/settle', { id, actual });
        actual = -1; // settled
        return json({ text, costEur: data.usage ? costEur(data.usage.prompt_tokens ?? 0, data.usage.completion_tokens ?? 0, cfg.prices) : reserveAmount, spentEur: settled.spentEur, limitEur: cfg.limitEur }, 200, h);
      } catch (e) {
        console.warn('provider call failed', (e as Error).name);
        return json({ error: (e as Error).name === 'AbortError' ? 'timeout' : 'provider_error' }, 504, h);
      } finally {
        if (actual >= 0) await ledger(env, '/settle', { id, actual });
      }
    }

    return json({ error: 'not_found' }, 404, h);
  },
};
