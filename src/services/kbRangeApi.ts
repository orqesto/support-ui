import { apiClient } from '@/lib/api-client';
import { runCountJob, type CountProgress } from './countJobApi';
import type { KbRangeRequest, KbRangeResult } from './kbRangeTypes';

/**
 * The KB history range of a Gmail / IMAP source: `{}` reads the policy, `{ days }` is a dry run
 * (counts and estimate, nothing saved), `{ days, apply: true }` saves it and, when it widens,
 * requests a re-read. Errors carry `code` (see `KbRangeErrorCode`); `errorText` words them.
 * Exposed as `integrationsService.kbHistoryRange`.
 */
export const kbHistoryRange = async (
  id: number,
  body: KbRangeRequest,
  follow: { onProgress?: (progress: CountProgress) => void; signal?: AbortSignal } = {}
): Promise<KbRangeResult> => {
  const post = async () => {
    const response = await apiClient.post<{ success: boolean; data: KbRangeResult }>(
      `/api/integrations/${id}/kb-history-range`,
      body
    );
    return response.data.data;
  };
  // The dry run counts the mailbox: a background count (countJobApi.ts), not a 60 s request.
  // The policy read and the apply stay plain requests.
  if (body.days === undefined || body.apply === true) return post();
  return runCountJob<KbRangeResult>({
    sourceId: id,
    kind: 'kb-history-range',
    params: { days: body.days },
    ...follow,
    fallback: post,
  });
};
