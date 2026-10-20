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

/**
 * A count just cancelled (a setting changed) holds its mailbox until it has unwound — usually
 * well under a second. A start refused for that is retried this often before it is shown.
 */
export const COUNT_START_RETRIES = 4;
export const COUNT_START_RETRY_MS = 750;

const isCountInProgress = (error: unknown): boolean => {
  const failed = error as { status?: number; data?: { code?: unknown } } | null;
  return failed?.status === 409 && failed.data?.code === 'COUNT_IN_PROGRESS';
};

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
  let job: CountJob | null = null;
  for (let attempt = 0; job === null; attempt++) {
    try {
      const started = await apiClient.post<{ success: boolean; data: CountJob }>(
        `/api/integrations/${sourceId}/count-jobs`,
        { kind, params }
      );
      job = started.data.data;
    } catch (error) {
      if (isRouteAbsent(error)) return fallback();
      if (!isCountInProgress(error) || attempt >= COUNT_START_RETRIES) throw error;
      try {
        await wait(COUNT_START_RETRY_MS, signal);
      } catch {
        throw new CountPollStopped();
      }
    }
  }

  const jobUrl = `/api/integrations/${sourceId}/count-jobs/${job.jobId}`;
  // A cancel is sent the moment it is asked for, not after the poll in flight returns, so the
  // mailbox is free sooner. Best effort: a cancel that fails leaves a count that ends by itself.
  const cancel = () => {
    if (signal?.reason === CANCEL_COUNT) void apiClient.delete(jobUrl).catch(() => undefined);
  };
  if (signal?.aborted) {
    cancel();
    throw new CountPollStopped();
  }
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    let delay = COUNT_POLL_FIRST_MS;
    while (job.state !== 'done') {
      onProgress?.({ listed: job.listed, startedAt: job.startedAt });
      try {
        await wait(delay, signal);
      } catch {
        throw new CountPollStopped();
      }
      delay = COUNT_POLL_MS;
      let polled: { data: { data: CountJob } };
      try {
        polled = await apiClient.get<{ success: boolean; data: CountJob }>(jobUrl);
      } catch (error) {
        // Stopped while the poll was in flight: a failed poll is not news to anyone.
        if (signal?.aborted) throw new CountPollStopped();
        throw error;
      }
      if (signal?.aborted) throw new CountPollStopped();
      job = polled.data.data;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
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
