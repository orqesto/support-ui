import { apiClient } from '@/lib/api-client';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import type { ApiResponse } from '@/types';

/**
 * Zendesk import — mirrors BE `zendeskImportController` (`/api/imports/zendesk/runs…`, org admins).
 *
 * Upload is chunked: create the run (name + size), PUT each part as `application/octet-stream`,
 * then `complete`, which starts the preview on the worker. The export never travels as one
 * request: a real one is 61 MB zipped.
 */

const BASE = '/api/imports/zendesk/runs';

export type ZendeskRunStatus =
  | 'uploading'
  | 'previewing'
  | 'previewed'
  | 'applying'
  | 'applied'
  | 'attachments'
  | 'failed'
  | 'cancelled';

export type ZendeskImportOptions = {
  includeSpam: boolean;
  includeProbable: boolean;
  /** Zendesk group name → Odly department id. */
  groupDepartments: Record<string, number>;
  defaultDepartmentId: number | null;
  defaultSourceId: number | null;
  /**
   * Zendesk agent email (lower-cased) → Odly user id, for an agent whose Zendesk address is not the
   * one their Odly account has. Absent from a server that predates it.
   */
  agentUsers: Record<string, number>;
};

/** Counts keyed as the BE writes them (`new`, `messageId`, `skipped_spam`, `spam_new`, …). */
export type ZendeskCounts = Record<string, number>;

export type ZendeskPreview = {
  subdomain: string;
  tickets: number;
  unreadableLines: number;
  notTickets: number;
  counts: ZendeskCounts;
  conflicts: Array<{ ticketId: number; conversationIds: number[] }>;
  conflictsListed: number;
  /** Zendesk group name → tickets in it. */
  groups: Record<string, number>;
  toAddresses: Record<string, { count: number; ours: boolean }>;
  assignees: Record<string, { count: number; odlyUserId: number | null }>;
};

export type ZendeskReport = {
  tickets: number;
  counts: ZendeskCounts;
  conflicts: Array<{ ticketId: number; conversationIds: number[] }>;
  failures: Array<{ ticketId: number; error: string }>;
  unmatchedAssignees: Record<string, number>;
  reconciled: number;
  attachments?: {
    counts: ZendeskCounts;
    failures: Array<{ ticketId: number; attachmentId: number; error: string }>;
    /**
     * Copying stopped before the end (newer backend): the plan's storage is full, the step was
     * stopped (platform pause, time budget) or failed. Absent ⇒ it finished.
     */
    stoppedReason?: 'storage_full' | 'stopped' | 'failed';
    stoppedMessage?: string;
  };
};

export type ZendeskRun = {
  id: number;
  status: ZendeskRunStatus;
  fileName: string | null;
  fileSize: number | null;
  source: string | null;
  options: ZendeskImportOptions;
  preview: ZendeskPreview | null;
  report: ZendeskReport | null;
  progress: { phase: string; done: number; total?: number; counts?: ZendeskCounts } | null;
  error: string | null;
  partsUploaded: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

const unwrap = <T>(res: { data: ApiResponse<T> }): T => {
  if (res.data.data === undefined) throw new Error(res.data.error ?? 'Empty response');
  return res.data.data;
};

/**
 * `progress` is the step's position only once a step has written it. Until then the server's column
 * holds the upload's own bookkeeping (byte counts per part, the "upload unfinished" mark) with no
 * `done`, and a run shown as 'previewing' straight after its upload would read `done` as undefined.
 */
const normalizeRun = (run: ZendeskRun): ZendeskRun => ({
  ...run,
  progress: typeof run.progress?.done === 'number' ? run.progress : null,
  // A server without agent choices sends no `agentUsers`.
  options: run.options ? { ...run.options, agentUsers: run.options.agentUsers ?? {} } : run.options,
});

/** Upload part size. The BE accepts up to 16 MB per part. */
export const PART_BYTES = 8 * 1024 * 1024;

/** How long one try of a part may take: a part is up to 8 MB on a possibly slow uplink. */
export const PART_TIMEOUT_MS = 5 * 60_000;

export const zendeskImportService = {
  list: async (): Promise<ZendeskRun[]> =>
    unwrap(await apiClient.get<ApiResponse<ZendeskRun[]>>(BASE)).map(normalizeRun),

  get: async (runId: number): Promise<ZendeskRun> =>
    normalizeRun(unwrap(await apiClient.get<ApiResponse<ZendeskRun>>(`${BASE}/${runId}`))),

  create: async (file: { name: string; size: number }): Promise<ZendeskRun> =>
    normalizeRun(
      unwrap(
        await apiClient.post<ApiResponse<ZendeskRun>>(BASE, {
          fileName: file.name,
          fileSize: file.size,
        })
      )
    ),

  uploadPart: async (
    runId: number,
    index: number,
    part: Blob,
    signal?: AbortSignal
  ): Promise<void> => {
    await apiClient.put(`${BASE}/${runId}/parts/${index}`, part, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: PART_TIMEOUT_MS,
      // "Stop upload" aborts the part on the wire, not only the parts after it.
      signal,
    });
  },

  complete: async (runId: number): Promise<ZendeskRun> =>
    normalizeRun(
      unwrap(await apiClient.post<ApiResponse<ZendeskRun>>(`${BASE}/${runId}/complete`, {}))
    ),

  updateOptions: async (
    runId: number,
    options: Partial<ZendeskImportOptions>
  ): Promise<ZendeskRun> =>
    normalizeRun(
      unwrap(await apiClient.put<ApiResponse<ZendeskRun>>(`${BASE}/${runId}/options`, options))
    ),

  preview: async (runId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${runId}/preview`, {});
  },

  apply: async (runId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${runId}/apply`, {});
  },

  attachments: async (runId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${runId}/attachments`, {});
  },

  cancel: async (runId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${runId}/cancel`, {});
  },

  remove: async (runId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${runId}`);
  },

  conflictsCsv: async (runId: number): Promise<Blob> => {
    try {
      return (await apiClient.get<Blob>(`${BASE}/${runId}/conflicts.csv`, { responseType: 'blob' }))
        .data;
    } catch (error) {
      throw await withBlobErrorBody(error);
    }
  },
};

/** `Blob.text()`, with a FileReader fallback for engines that lack it (jsdom among them). */
const blobText = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the response'));
        reader.readAsText(blob);
      });

/**
 * With `responseType: 'blob'` an error body arrives as a Blob, so the backend's reason
 * (`{ success: false, error }`) is not on the error. Read it, and hand back an error that carries
 * it the way every other call does. A 5xx keeps the masked message the interceptor chose.
 */
export const withBlobErrorBody = async (error: unknown): Promise<unknown> => {
  const body = (error as { data?: unknown } | null | undefined)?.data;
  if (!(body instanceof Blob)) return error;
  const status = apiErrorStatus(error);
  let reason: string | null = null;
  try {
    const parsed = JSON.parse(await blobText(body)) as { error?: unknown; message?: unknown };
    const text = parsed.error ?? parsed.message;
    reason = typeof text === 'string' && text.trim() ? text : null;
  } catch {
    reason = null;
  }
  if (!reason || (status !== undefined && status >= 500)) return error;
  const readable = new Error(reason) as Error & { status?: number; data?: unknown };
  readable.status = status;
  readable.data = { success: false, error: reason };
  return readable;
};

/** A user's "Stop upload" (axios `CanceledError`), as opposed to a failure. */
export const isAbortError = (error: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) ||
  (error as { name?: string; code?: string } | null | undefined)?.code === 'ERR_CANCELED' ||
  (error as { name?: string } | null | undefined)?.name === 'CanceledError' ||
  (error as { name?: string } | null | undefined)?.name === 'AbortError';

/** Pause before re-sending a failed part: a blip on the uplink usually needs a moment. */
export const PART_RETRY_DELAYS_MS = [1000, 4000];

/**
 * A 4xx is the server refusing this part (run deleted, upload already complete, too large):
 * sending it again gets the same answer. 408 (timeout) and 429 (slow down) are the exceptions.
 */
const isRetryable = (error: unknown): boolean => {
  const status = apiErrorStatus(error);
  if (status === undefined || status === 0) return true;
  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
};

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Upload `file` in parts, each tried up to 3 times with a pause between tries (none after a 4xx).
 * `onProgress` receives the bytes sent so far. Parts are sent one after another: the bottleneck
 * is the uplink, and a failed part is re-sent alone. An abort through `signal` stops the part in
 * flight and rejects with the abort itself (see `isAbortError`), never retried.
 */
export const uploadZendeskExport = async (
  runId: number,
  file: Blob,
  onProgress: (sent: number) => void,
  signal?: AbortSignal,
  retryDelaysMs: number[] = PART_RETRY_DELAYS_MS
): Promise<void> => {
  const parts = Math.ceil(file.size / PART_BYTES);
  for (let index = 0; index < parts; index += 1) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    const part = file.slice(index * PART_BYTES, (index + 1) * PART_BYTES);
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        if (attempt > 0) await wait(retryDelaysMs[attempt - 1] ?? 0, signal);
        await zendeskImportService.uploadPart(runId, index, part, signal);
        lastError = undefined;
        break;
      } catch (error) {
        if (isAbortError(error, signal)) throw error;
        lastError = error;
        if (!isRetryable(error)) break;
      }
    }
    // Thrown as an Error carrying the backend's own reason (a part refused, the run gone).
    if (lastError) {
      throw new Error(
        apiErrorMessage(lastError, `Part ${index + 1} of ${parts} could not be uploaded`)
      );
    }
    onProgress(Math.min(file.size, (index + 1) * PART_BYTES));
  }
};
