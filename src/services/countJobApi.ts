import { apiClient } from '@/lib/api-client';
import { isRouteAbsent } from '@/lib/apiError';

/**
 * Background mailbox counts: "Check Messages Count" (Gmail / IMAP) and the KB history-range dry
 * run. Inside one request they stop at nginx's 60 s — a real mailbox read "At least 50,000" with
 * "Missing: 0" over the newest 50,000 of ~80,000. As a background job the backend lists and
 * compares the whole range; this starts the job, reports progress, and resolves with exactly
 * what the request route would have answered (or throws what it would have refused with).
 *
 * An older backend without the job route answers its default 404 page: the request route is used
 * then (`fallback`), with its old bounds.
 */
export type CountJobKind = 'gmail-count' | 'imap-count' | 'kb-history-range';

export type CountProgress = {
  /** Messages of the counted range listed so far. */
  listed: number;
  startedAt: string;
};

type CountJob = {
  jobId: string;
  state: 'running' | 'done';
  listed: number;
  startedAt: string;
  result: { status: number; body: { data?: unknown; error?: string; code?: string } } | null;
};

/** The first poll comes quickly (a small mailbox is done in seconds), later ones every 2 s. */
export const COUNT_POLL_FIRST_MS = 750;
export const COUNT_POLL_MS = 2_000;

/**
 * Pass to `AbortController.abort()` to also CANCEL the count on the server (the panel now asks
 * something else). Any other abort only stops following it: the count keeps running, and the
 * same count started again attaches to it.
 */
export const CANCEL_COUNT = 'cancel-count';

/** Stopped polling because the caller went away or cancelled. */
export class CountPollStopped extends Error {
  constructor() {
    super('Stopped following the count');
    this.name = 'CountPollStopped';
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CountPollStopped());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new CountPollStopped());
      },
      { once: true }
    );
  });

/** A refusal shaped like the api-client's (`status` + `data`), so the panels word it as before. */
const refusal = (status: number, body: { error?: string; code?: string }) =>
  Object.assign(new Error(body.error ?? 'The count failed.'), { status, data: body });

export const runCountJob = async <T>({
  sourceId,
  kind,
  params,
  onProgress,
  signal,
  fallback,
}: {
  sourceId: number;
  kind: CountJobKind;
  params: Record<string, unknown>;
  onProgress?: (progress: CountProgress) => void;
  signal?: AbortSignal;
  /** The request route, for a backend without the job route. */
  fallback: () => Promise<T>;
}): Promise<T> => {
  let job: CountJob;
  try {
    const started = await apiClient.post<{ success: boolean; data: CountJob }>(
      `/api/integrations/${sourceId}/count-jobs`,
      { kind, params }
    );
    job = started.data.data;
  } catch (error) {
    if (isRouteAbsent(error)) return fallback();
    throw error;
  }

  const jobUrl = `/api/integrations/${sourceId}/count-jobs/${job.jobId}`;
  const stopped = () => {
    // Best effort: a cancel that fails leaves a count that ends by itself.
    if (signal?.reason === CANCEL_COUNT) void apiClient.delete(jobUrl).catch(() => undefined);
    return new CountPollStopped();
  };
  let delay = COUNT_POLL_FIRST_MS;
  while (job.state !== 'done') {
    onProgress?.({ listed: job.listed, startedAt: job.startedAt });
    try {
      await wait(delay, signal);
    } catch {
      throw stopped();
    }
    delay = COUNT_POLL_MS;
    const polled = await apiClient.get<{ success: boolean; data: CountJob }>(jobUrl);
    if (signal?.aborted) throw stopped();
    job = polled.data.data;
  }

  const result = job.result;
  if (!result) throw refusal(500, { error: 'The count ended without an answer. Count again.' });
  if (result.status >= 200 && result.status < 300) return result.body.data as T;
  throw refusal(result.status, result.body);
};

/** "63,500 messages listed so far · 2 min" — the line a panel shows while a count runs. */
export const countProgressText = (progress: CountProgress | null, now = Date.now()): string => {
  if (!progress) return 'Counting…';
  const listed = progress.listed.toLocaleString('en-US');
  const minutes = Math.floor((now - new Date(progress.startedAt).getTime()) / 60_000);
  const elapsed = minutes >= 1 ? ` · ${minutes} min` : '';
  return progress.listed > 0
    ? `Counting… ${listed} message${progress.listed === 1 ? '' : 's'} listed so far${elapsed}`
    : `Counting…${elapsed}`;
};
