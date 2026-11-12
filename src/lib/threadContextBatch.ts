import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

/*
  The thread header's five side reads — labels, tickets, merges, participants, KB references —
  in ONE request (support-service `GET /api/messages/:id/context`).

  Opening a thread, and every return to an open tab (its pane remounts and reads again), sent
  these as five requests. Each component still asks for its own part exactly as before; this
  sits under `apiClient` as its transport and folds the asks that arrive together for one
  thread into one composite request, then answers each caller as its own route would have —
  `data`, `status`, an AxiosError for a refusal — so the interceptors, the services and their
  callers see no difference.

  - One ask alone (a refresh after a label write, a socket event) goes out as it always did.
  - Asks are folded only when they share the thread AND every header that scopes the answer
    (workspace, teams, alliance) — a composite is one request, it carries one set.
  - Anything wrong with the composite itself (an older backend without the route, a network
    error, a 401 the refresh interceptor must see on the real route): every ask goes out alone,
    as before. A 404 for the route turns folding off for the rest of the session.
*/

const PART_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/api\/labels\/messages\/(\d+)$/, 'labels'],
  [/^\/api\/messages\/(\d+)\/tickets$/, 'tickets'],
  [/^\/api\/messages\/(\d+)\/merges$/, 'merges'],
  [/^\/api\/messages\/(\d+)\/participants$/, 'participants'],
  [/^\/api\/messages\/(\d+)\/kb-references$/, 'kbReferences'],
];

/** Headers that change what a route answers: an ask is folded only with asks that share them. */
const SCOPING_HEADERS = [
  'authorization',
  'x-organization-context',
  'x-department-context',
  'x-alliance-context',
];

/** How long the first ask waits for the others of the same render (they arrive within a tick). */
const FOLD_WINDOW_MS = 0;

type PartAnswer = { status: number; body: unknown };
type Ask = {
  part: string;
  config: InternalAxiosRequestConfig;
  resolve: (response: AxiosResponse) => void;
  reject: (reason: unknown) => void;
};
type Batch = { thread: string; asks: Ask[] };

/** The part and thread an ask is for, or null when it is not one of the five plain reads. */
export const contextPartOf = (
  config: InternalAxiosRequestConfig
): { part: string; thread: string } | null => {
  if ((config.method ?? 'get').toLowerCase() !== 'get') return null;
  if (config.params || config.responseType || config.signal) return null;
  const path = new URL(config.url ?? '', 'http://context.local').pathname;
  for (const [pattern, part] of PART_ROUTES) {
    const match = pattern.exec(path);
    if (match) return { part, thread: match[1] };
  }
  return null;
};

const headerOf = (config: InternalAxiosRequestConfig, name: string): string => {
  const headers = AxiosHeaders.from(config.headers as never);
  const value = headers.get(name);
  return value === undefined || value === null ? '' : String(value);
};

const scopeOf = (config: InternalAxiosRequestConfig): string =>
  SCOPING_HEADERS.map((name) => headerOf(config, name)).join('\u0000');

/** The answer a single route would have given, in axios' own shape (and error for a refusal). */
const answerAs = (ask: Ask, answer: PartAnswer): void => {
  const response: AxiosResponse = {
    data: answer.body,
    status: answer.status,
    statusText: String(answer.status),
    headers: new AxiosHeaders({ 'content-type': 'application/json' }),
    config: ask.config,
    request: {},
  };
  const valid = ask.config.validateStatus
    ? ask.config.validateStatus(answer.status)
    : answer.status >= 200 && answer.status < 300;
  if (valid) {
    ask.resolve(response);
    return;
  }
  ask.reject(
    new AxiosError(
      `Request failed with status code ${answer.status}`,
      answer.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      ask.config,
      {},
      response
    )
  );
};

/**
 * `next` with the five side reads of one thread folded into one request. `next` is the transport
 * underneath (the browser's, or a test's / the demo's).
 */
export const withThreadContextBatching = (next: AxiosAdapter): AxiosAdapter => {
  let supported = true;
  const pending = new Map<string, Batch>();

  const alone = (ask: Ask) => {
    next(ask.config).then(ask.resolve, ask.reject);
  };

  const flush = (key: string) => {
    const batch = pending.get(key);
    pending.delete(key);
    if (!batch) return;
    const { asks, thread } = batch;
    if (asks.length < 2 || !supported) {
      asks.forEach(alone);
      return;
    }
    const parts = [...new Set(asks.map((ask) => ask.part))];
    const base = asks[0].config;
    const composite: InternalAxiosRequestConfig = {
      ...base,
      url: `/api/messages/${thread}/context`,
      params: { parts: parts.join(',') },
    };
    next(composite).then(
      (response) => {
        const answers = (response.data as { data?: { parts?: Record<string, PartAnswer> } } | null)
          ?.data?.parts;
        asks.forEach((ask) => {
          const answer = answers?.[ask.part];
          // A part the backend did not answer (an older one with fewer parts): its own route.
          if (answer && typeof answer.status === 'number') answerAs(ask, answer);
          else alone(ask);
        });
      },
      (error: unknown) => {
        if (error instanceof AxiosError && error.response?.status === 404) supported = false;
        asks.forEach(alone);
      }
    );
  };

  return (config) => {
    const target = supported ? contextPartOf(config) : null;
    if (!target) return next(config);
    return new Promise<AxiosResponse>((resolve, reject) => {
      const key = `${target.thread}\u0000${scopeOf(config)}`;
      let batch = pending.get(key);
      if (!batch) {
        batch = { thread: target.thread, asks: [] };
        pending.set(key, batch);
        setTimeout(() => flush(key), FOLD_WINDOW_MS);
      }
      batch.asks.push({ part: target.part, config, resolve, reject });
    });
  };
};
