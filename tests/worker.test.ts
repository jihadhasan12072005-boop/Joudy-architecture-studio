import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { BudgetLedger, sha256Hex, validate, type Env } from '../worker/src/index';
import { costEur, emptyState, reserve, settle, monthKey } from '../worker/src/budget';

function fakeLedgerNamespace() {
  const store = new Map<string, unknown>();
  const obj = new BudgetLedger({ storage: { get: async (k: string) => store.get(k) as never, put: async (k: string, v: unknown) => void store.set(k, v) } });
  return { idFromName: () => 'x', get: () => ({ fetch: (u: string, init?: RequestInit) => obj.fetch(new Request(u, init)) }) };
}

const TOKEN = 'joudy-secret-token';
async function env(over: Partial<Env> = {}): Promise<Env> {
  return {
    LEDGER: fakeLedgerNamespace(),
    AI_ENABLED: 'true',
    PROVIDER_NAME: 'test',
    PROVIDER_BASE_URL: 'https://provider.test/v1',
    PROVIDER_MODEL: 'model-x',
    PROVIDER_API_KEY: 'sk-provider-secret',
    ACCESS_TOKEN_SHA256: await sha256Hex(TOKEN),
    ALLOWED_ORIGINS: 'https://joudy.github.io',
    PRICE_INPUT_USD_PER_MTOK: '1',
    PRICE_OUTPUT_USD_PER_MTOK: '4',
    USD_TO_EUR: '1',
    MONTHLY_LIMIT_EUR: '4.5',
    ...over,
  };
}
const chat = (text = 'هل توزيع الغرف منطقي؟', token = TOKEN) =>
  new Request('https://w/v1/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://joudy.github.io' }, body: JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text }] }], context: '' }) });

afterEach(() => vi.restoreAllMocks());

describe('budget ledger (pure)', () => {
  it('refuses when the reservation would exceed the limit', () => {
    let s = emptyState();
    const a = reserve(s, 4, 4.5, 100, 'a');
    expect(a.ok).toBe(true);
    s = a.state;
    const b = reserve(s, 1, 4.5, 100, 'b');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toBe('budget_exceeded');
  });
  it('settles to actual cost and frees the difference', () => {
    const r = reserve(emptyState(), 2, 4.5, 100, 'a');
    if (!r.ok) throw new Error();
    expect(settle(r.state, 'a', 0.1).spentEur).toBeCloseTo(0.1);
  });
  it('resets each month and caps requests per day', () => {
    const old = { ...emptyState(), month: '2000-01', spentEur: 99 };
    expect(reserve(old, 1, 4.5, 100, 'z').ok).toBe(true);
    const full = { ...emptyState(), requestsToday: 5 };
    const r = reserve(full, 0.01, 4.5, 5, 'y');
    expect(r.ok).toBe(false);
    expect(monthKey(new Date('2026-11-05'))).toBe('2026-11');
  });
  it('cost formula', () => {
    expect(costEur(1_000_000, 0, { inputUsdPerMTok: 1, outputUsdPerMTok: 4, usdToEur: 0.9 })).toBeCloseTo(0.9);
  });
});

describe('worker endpoint', () => {
  it('rejects missing or wrong tokens', async () => {
    const e = await env();
    expect((await worker.fetch(chat('x', 'wrong'), e)).status).toBe(401);
  });
  it('is disabled by default', async () => {
    const e = await env({ AI_ENABLED: 'false' });
    const r = await worker.fetch(chat(), e);
    expect(r.status).toBe(503);
  });
  it('calls the provider server-side, returns text and records spend; never leaks the key', async () => {
    const e = await env();
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ملاحظة' } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }), { status: 200 }),
    );
    const r = await worker.fetch(chat(), e);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.text).toBe('ملاحظة');
    expect(body.spentEur).toBeCloseTo((1000 * 1 + 500 * 4) / 1e6, 8);
    expect(JSON.stringify(body)).not.toContain('sk-provider-secret');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://joudy.github.io');
    const [, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-provider-secret' });
  });
  it('stops at the hard monthly limit before calling the provider', async () => {
    const e = await env({ MONTHLY_LIMIT_EUR: '0.0001' });
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await worker.fetch(chat(), e);
    expect(r.status).toBe(402);
    expect(spy).not.toHaveBeenCalled();
  });
  it('limit is clamped to €5 even if misconfigured', async () => {
    const e = await env({ MONTHLY_LIMIT_EUR: '500' });
    const r = await worker.fetch(new Request('https://w/v1/status', { headers: { Authorization: `Bearer ${TOKEN}` } }), e);
    expect((await r.json()).limitEur).toBe(5);
  });
  it('provider errors release the reservation', async () => {
    const e = await env();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    expect((await worker.fetch(chat(), e)).status).toBe(502);
    const st = await (await worker.fetch(new Request('https://w/v1/status', { headers: { Authorization: `Bearer ${TOKEN}` } }), e)).json();
    expect(st.spentEur).toBe(0);
  });
  it('validates images and sizes', () => {
    expect(validate({ messages: [{ role: 'user', content: [{ type: 'image', dataUrl: 'data:image/gif;base64,AAAA' }] }] }, 1000).ok).toBe(false);
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
    expect(validate({ messages: [{ role: 'user', content: [{ type: 'image', dataUrl: big }, { type: 'text', text: 'x' }] }] }, 1000)).toEqual({ ok: false, error: 'too_large' });
  });
});
