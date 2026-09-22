/**
 * The two bulk endpoints.
 *
 * ⛔ Deliberately NOT in `message.service.ts`. That file opens with a standing instruction not
 * to add another endpoint to it without first splitting it by domain — it is already past its
 * line cap. Adding two more would be exactly the silent ignoring that note asks for. This is
 * the first of those domain files: thread actions over a SELECTION.
 */
import type {
  BulkAction,
  BulkPreview,
  BulkResult,
} from '@/components/messages/bulk/bulkActions';
import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type BulkRunOptions = {
  /** `assign` — null clears the assignee. */
  assigneeId?: number | null;
  /** `spam` — whether this run also teaches the spam filter. */
  trainFilter?: boolean;
  /** `create_ticket` — the ticket's name, which the agent must choose. */
  title?: string;
  description?: string;
};

export const bulkService = {
  /**
   * What a run WOULD do. The action bar is built from this rather than from any rule in the
   * browser: the eligibility rules live on the server, and a copy here would drift — the button
   * would stay enabled while the server refused.
   */
  preview: async (action: BulkAction, ids: number[]) => {
    const response = await apiClient.post<ApiResponse<BulkPreview>>('/api/messages/bulk/preview', {
      action,
      ids,
    });
    return response.data;
  },

  /**
   * Run it. The response accounts for every submitted id — `applied`, `refused` with a reason,
   * or `failed` — so the result screen can never say "done" about a thread that was not touched.
   */
  run: async (action: BulkAction, ids: number[], options?: BulkRunOptions) => {
    const response = await apiClient.post<ApiResponse<BulkResult>>('/api/messages/bulk', {
      action,
      ids,
      options,
    });
    return response.data;
  },
};
