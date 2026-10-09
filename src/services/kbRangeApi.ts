import { apiClient } from '@/lib/api-client';
import type { KbRangeRequest, KbRangeResult } from './kbRangeTypes';

/**
 * The KB history range of a Gmail / IMAP source: `{}` reads the policy, `{ days }` is a dry run
 * (counts and estimate, nothing saved), `{ days, apply: true }` saves it and, when it widens,
 * requests a re-read. Errors carry `code` (see `KbRangeErrorCode`); `errorText` words them.
 * Exposed as `integrationsService.kbHistoryRange`.
 */
export const kbHistoryRange = async (id: number, body: KbRangeRequest): Promise<KbRangeResult> => {
  const response = await apiClient.post<{ success: boolean; data: KbRangeResult }>(
    `/api/integrations/${id}/kb-history-range`,
    body
  );
  return response.data.data;
};
