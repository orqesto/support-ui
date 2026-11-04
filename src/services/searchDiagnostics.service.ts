import { apiClient } from '@/lib/api-client';
import { apiErrorMessage, apiErrorStatus, isRouteAbsent } from '@/lib/apiError';

/**
 * Console → Maintenance: platform-admin search diagnostics (BE `POST /api/admin/search-explain`,
 * `GET /api/admin/workspace-sizes`, 2026-11-04). Read-only on the backend. A backend without them
 * answers 404 — reported as `unavailable`, never a crash (FE can reach prod before the BE).
 */

export type ExplainedStatement = {
  /** Its place in the backend's list — a stable key. */
  position: number;
  query: string;
  params: unknown[];
  plan?: string;
  error?: string;
  skipped?: string;
  ms?: number;
};

export type SearchExplain = {
  search: {
    ms: number | null;
    rows: number | null;
    total: number | null;
    totalCapped: boolean | null;
    countTimedOut: boolean | null;
    timedOut: boolean | null;
    walk: string | null;
    scopeKnown: boolean;
  };
  statements: ExplainedStatement[];
  note: string | null;
};

type Spread = {
  p50: number | null;
  p95: number | null;
  max: number | null;
  sampled: number | null;
};
type TableSize = { bytes: number | null; rowsEstimate: number | null };

export type WorkspaceSizes = {
  threads: number | null;
  messages: number | null;
  messagesPerThread: Spread | null;
  bodyBytes: Spread | null;
  wordListBytes: Spread | null;
  resolvedOver90DaysShare: number | null;
  tables: { conversations: TableSize | null; messageEvents: TableSize | null };
};

export type DiagnosticsOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unavailable' }
  | { kind: 'busy'; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const spread = (value: unknown): Spread | null =>
  isRecord(value)
    ? { p50: num(value.p50), p95: num(value.p95), max: num(value.max), sampled: num(value.sampled) }
    : null;
const tableSize = (value: unknown): TableSize | null =>
  isRecord(value) ? { bytes: num(value.bytes), rowsEstimate: num(value.rowsEstimate) } : null;

export const normaliseExplain = (raw: unknown): SearchExplain => {
  const data = isRecord(raw) ? raw : {};
  const search = isRecord(data.search) ? data.search : {};
  const reading = isRecord(search.reading) ? search.reading : {};
  return {
    search: {
      ms: num(search.ms),
      rows: num(search.rows),
      total: num(search.total),
      totalCapped: bool(search.totalCapped),
      countTimedOut: bool(search.countTimedOut),
      timedOut: bool(search.timedOut),
      walk: text(reading.walk) ?? null,
      scopeKnown: search.scopeKnown === true,
    },
    statements: (Array.isArray(data.statements) ? data.statements : [])
      .filter(isRecord)
      .map((row, position) => ({
        position,
        query: text(row.query) ?? '',
        params: Array.isArray(row.params) ? row.params : [],
        plan: text(row.plan),
        error: text(row.error),
        skipped: text(row.skipped),
        ms: num(row.ms) ?? undefined,
      })),
    note: text(data.note) ?? null,
  };
};

export const normaliseSizes = (raw: unknown): WorkspaceSizes => {
  const data = isRecord(raw) ? raw : {};
  const tables = isRecord(data.tables) ? data.tables : {};
  return {
    threads: num(data.threads),
    messages: num(data.messages),
    messagesPerThread: spread(data.messagesPerThread),
    bodyBytes: spread(data.bodyBytes),
    wordListBytes: spread(data.wordListBytes),
    resolvedOver90DaysShare: num(data.resolvedOver90DaysShare),
    tables: {
      conversations: tableSize(tables.conversations),
      messageEvents: tableSize(tables.messageEvents),
    },
  };
};

/** No such route on this backend: unavailable. 429: busy or paced — the backend's message. */
const outcomeOf = async <T>(read: () => Promise<T>): Promise<DiagnosticsOutcome<T>> => {
  try {
    return { kind: 'ok', data: await read() };
  } catch (error) {
    if (isRouteAbsent(error)) return { kind: 'unavailable' };
    if (apiErrorStatus(error) === 429) {
      return { kind: 'busy', message: apiErrorMessage(error, 'Busy — try again in a minute.') };
    }
    throw error;
  }
};

const searchDiagnosticsService = {
  explainSearch: (input: { organizationId: number; search: string; lifecycle: string }) =>
    outcomeOf(async () => {
      const response = await apiClient.post<{ data?: unknown }>('/api/admin/search-explain', input);
      return normaliseExplain(response.data.data);
    }),

  workspaceSizes: (organizationId: number) =>
    outcomeOf(async () => {
      const response = await apiClient.get<{ data?: unknown }>('/api/admin/workspace-sizes', {
        params: { organizationId },
      });
      return normaliseSizes(response.data.data);
    }),
};

export default searchDiagnosticsService;
