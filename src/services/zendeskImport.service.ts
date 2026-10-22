import { apiClient } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/apiError';
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

/** Upload part size. The BE accepts up to 16 MB per part. */
export const PART_BYTES = 8 * 1024 * 1024;

export const zendeskImportService = {
  list: async (): Promise<ZendeskRun[]> =>
    unwrap(await apiClient.get<ApiResponse<ZendeskRun[]>>(BASE)),

  get: async (runId: number): Promise<ZendeskRun> =>
    unwrap(await apiClient.get<ApiResponse<ZendeskRun>>(`${BASE}/${runId}`)),

  create: async (file: { name: string; size: number }): Promise<ZendeskRun> =>
    unwrap(
      await apiClient.post<ApiResponse<ZendeskRun>>(BASE, {
        fileName: file.name,
        fileSize: file.size,
      })
    ),

  uploadPart: async (runId: number, index: number, part: Blob): Promise<void> => {
    await apiClient.put(`${BASE}/${runId}/parts/${index}`, part, {
      headers: { 'Content-Type': 'application/octet-stream' },
      // A part is up to 8 MB on a possibly slow uplink.
      timeout: 5 * 60_000,
    });
  },

  complete: async (runId: number): Promise<ZendeskRun> =>
    unwrap(await apiClient.post<ApiResponse<ZendeskRun>>(`${BASE}/${runId}/complete`, {})),

  updateOptions: async (
    runId: number,
    options: Partial<ZendeskImportOptions>
  ): Promise<ZendeskRun> =>
    unwrap(await apiClient.put<ApiResponse<ZendeskRun>>(`${BASE}/${runId}/options`, options)),

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

  conflictsCsv: async (runId: number): Promise<Blob> =>
    (await apiClient.get<Blob>(`${BASE}/${runId}/conflicts.csv`, { responseType: 'blob' })).data,
};

/**
 * Upload `file` in parts, each tried up to 3 times. `onProgress` receives the bytes sent so far.
 * Parts are sent one after another: the bottleneck is the uplink, and a failed part is re-sent alone.
 */
export const uploadZendeskExport = async (
  runId: number,
  file: Blob,
  onProgress: (sent: number) => void,
  signal?: AbortSignal
): Promise<void> => {
  const parts = Math.ceil(file.size / PART_BYTES);
  for (let index = 0; index < parts; index += 1) {
    if (signal?.aborted) throw new Error('Upload cancelled');
    const part = file.slice(index * PART_BYTES, (index + 1) * PART_BYTES);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await zendeskImportService.uploadPart(runId, index, part);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
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
