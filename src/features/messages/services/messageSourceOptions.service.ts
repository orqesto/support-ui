import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { scopedLookup } from '@/lib/scopedLookup';
import { integrationsService } from '@/services/integrations.service';

/** A mailbox or channel as a picker option (GET /api/integrations/message-sources). */
export type MessageSourceOption = { id: number; name: string; type: string; active: boolean };

/**
 * The workspace's mailboxes and channels for a picker — readable by every role
 * (VIEW_MESSAGE_SOURCES), unlike getAll (VIEW_INTEGRATIONS): the threads filter's Source list
 * read getAll, so support's stayed empty (staging 2026-10-19). An older backend without the
 * route matches it as `GET /:id` instead: 404, 400 (not an id) or 403 (VIEW_INTEGRATIONS, prod
 * v1.1.297 for support). The full list is read then, for the roles that may; a role refused that
 * too gets no options.
 */
const OLDER_BACKEND = [404, 400, 403];

const readMessageSourceOptions = async (): Promise<MessageSourceOption[]> => {
  try {
    const response = await apiClient.get<{ success: boolean; data: MessageSourceOption[] }>(
      '/api/integrations/message-sources'
    );
    return response.data.data ?? [];
  } catch (error) {
    if (!OLDER_BACKEND.includes(getErrorStatus(error) ?? 0)) throw error;
    let all: Awaited<ReturnType<typeof integrationsService.getAll>>;
    try {
      all = await integrationsService.getAll();
    } catch (fallbackError) {
      if (getErrorStatus(fallbackError) === 403) return [];
      throw fallbackError;
    }
    return (all.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      active: (row as { enabled?: boolean }).enabled ?? true,
    }));
  }
};

/**
 * Shared for a minute (scopedLookup): the threads page reads the options in its filter bar and
 * again in the table header, which mounts once the list arrives. A write under
 * /api/integrations clears it; a failed read is not kept.
 */
export const getMessageSourceOptions = (): Promise<MessageSourceOption[]> =>
  scopedLookup('message-sources', readMessageSourceOptions);
