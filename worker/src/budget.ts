// Monthly spending ledger — a genuine server-side hard limit.
// Every AI request first RESERVES its worst-case cost (estimated input tokens
// + the full max_tokens of output, priced at the configured rates, plus a
// safety margin). If the reservation would push the month over the limit,
// the request is refused BEFORE the provider is called. After the response,
// the reservation is settled to the actual cost reported by the provider.
// The ledger lives in a single Durable Object, so concurrent requests are
// serialized and cannot race past the limit.

export interface Prices {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  usdToEur: number;
}

export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function costEur(inputTokens: number, outputTokens: number, p: Prices): number {
  return ((inputTokens * p.inputUsdPerMTok + outputTokens * p.outputUsdPerMTok) / 1e6) * p.usdToEur;
}

/**
 * Conservative token estimate. Arabic text usually costs MORE tokens per
 * character than English, so we assume 1 token per 2 characters, and a fixed
 * (configurable) budget per image.
 */
export function estimateInputTokens(totalChars: number, images: number, tokensPerImage: number): number {
  return Math.ceil(totalChars / 2) + images * tokensPerImage + 50;
}

export interface LedgerState {
  month: string;
  spentEur: number; // settled + outstanding reservations
  reservations: Record<string, { amount: number; at: number }>;
  day: string;
  requestsToday: number;
}

export function emptyState(now = new Date()): LedgerState {
  return { month: monthKey(now), spentEur: 0, reservations: {}, day: dayKey(now), requestsToday: 0 };
}

export type ReserveResult = { ok: true; id: string; state: LedgerState } | { ok: false; error: 'budget_exceeded' | 'rate_limited'; state: LedgerState };

/** Pure reservation logic (unit-tested). */
export function reserve(s: LedgerState, amount: number, limitEur: number, maxPerDay: number, id: string, now = new Date()): ReserveResult {
  let state = { ...s, reservations: { ...s.reservations } };
  if (state.month !== monthKey(now)) state = emptyState(now);
  if (state.day !== dayKey(now)) state = { ...state, day: dayKey(now), requestsToday: 0 };
  // Stale reservations (>15 min, e.g. worker crashed mid-request) stay counted
  // as spent — conservative — but are removed from the outstanding map.
  for (const [rid, r] of Object.entries(state.reservations)) {
    if (now.getTime() - r.at > 15 * 60 * 1000) delete state.reservations[rid];
  }
  if (state.requestsToday >= maxPerDay) return { ok: false, error: 'rate_limited', state };
  if (state.spentEur + amount > limitEur) return { ok: false, error: 'budget_exceeded', state };
  state.spentEur += amount;
  state.requestsToday += 1;
  state.reservations[id] = { amount, at: now.getTime() };
  return { ok: true, id, state };
}

/** Replace a reservation with the actual cost. Unknown ids are ignored. */
export function settle(s: LedgerState, id: string, actual: number): LedgerState {
  const r = s.reservations[id];
  if (!r) return s;
  const reservations = { ...s.reservations };
  delete reservations[id];
  return { ...s, reservations, spentEur: Math.max(0, s.spentEur - r.amount + Math.max(0, actual)) };
}

// ---------------------------------------------------------------------------
// Durable Object wrapper
// ---------------------------------------------------------------------------
interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
export interface DOState {
  storage: DOStorage;
}

export class BudgetLedger {
  constructor(private ctx: DOState) {}

  private async load(): Promise<LedgerState> {
    const s = (await this.ctx.storage.get<LedgerState>('ledger')) ?? emptyState();
    if (s.month !== monthKey()) return emptyState();
    return s;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/reserve') {
      const { amount, limitEur, maxPerDay, id } = (await req.json()) as { amount: number; limitEur: number; maxPerDay: number; id: string };
      const r = reserve(await this.load(), amount, limitEur, maxPerDay, id);
      await this.ctx.storage.put('ledger', r.state);
      return Response.json(r.ok ? { ok: true, spentEur: r.state.spentEur } : { ok: false, error: r.error, spentEur: r.state.spentEur });
    }
    if (url.pathname === '/settle') {
      const { id, actual } = (await req.json()) as { id: string; actual: number };
      const next = settle(await this.load(), id, actual);
      await this.ctx.storage.put('ledger', next);
      return Response.json({ ok: true, spentEur: next.spentEur });
    }
    const s = await this.load();
    return Response.json({ month: s.month, spentEur: s.spentEur, requestsToday: s.day === dayKey() ? s.requestsToday : 0 });
  }
}
