import { apiClient } from '@/lib/api-client';
import { runCountJob, type CountProgress } from './countJobApi';
import type { GmailCountResult, ImapCountResult } from './integrations.service';

/**
 * The mailbox counts behind "Check Messages Count" and "Compare with Odly", run as background
 * counts (countJobApi.ts). Exposed as `integrationsService.countGmailMessages` / `countImapMessages`.
 *
 * "Check Messages Count" for a Gmail source — the messages its FIRST sync will import, counted
 * with the same query the sync issues. Works on a paused source; the overrides recount a
 * changed setting without saving it. `capped` means AT LEAST `count` (counting stopped).
 * Runs as a background count (countJobApi.ts): the whole range, with progress.
 */
export const countGmailMessages = async (
  id: number,
  overrides: { searchQuery?: string; bulkImportDays?: number; isKnowledgeBase?: boolean } = {},
  follow: { onProgress?: (progress: CountProgress) => void; signal?: AbortSignal } = {}
): Promise<GmailCountResult> =>
  runCountJob<GmailCountResult>({
    sourceId: id,
    kind: 'gmail-count',
    params: overrides,
    ...follow,
    fallback: async () => {
      const response = await apiClient.post<{ success: boolean; data: GmailCountResult }>(
        `/api/integrations/${id}/gmail-count`,
        overrides
      );
      return response.data.data;
    },
  });

/**
 * Reconcile a SAVED IMAP source against Odly: how many messages the mailbox holds in the
 * sync window, how many of them are already in Odly (matched by Message-ID) and how many are
 * missing. `unverifiable` = no Message-ID header — never counted as missing.
 * Runs as a background count (countJobApi.ts): the whole window, with progress.
 */
export const countImapMessages = async (
  id: number,
  opts: { days?: number } = {},
  follow: { onProgress?: (progress: CountProgress) => void; signal?: AbortSignal } = {}
): Promise<ImapCountResult> => {
  const params = opts.days === undefined ? undefined : { days: opts.days };
  return runCountJob<ImapCountResult>({
    sourceId: id,
    kind: 'imap-count',
    params: params ?? {},
    ...follow,
    fallback: async () => {
      const response = await apiClient.post<{ success: boolean; data: ImapCountResult }>(
        `/api/integrations/${id}/imap-count`,
        params
      );
      return response.data.data;
    },
  });
};
