import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { integrationsService } from '@/services/integrations.service';

/** A mailbox or channel as a picker option (GET /api/integrations/message-sources). */
export type MessageSourceOption = { id: number; name: string; type: string; active: boolean };

/**
 * The workspace's mailboxes and channels for a picker — readable by every role
 * (VIEW_MESSAGE_SOURCES), unlike getAll (VIEW_INTEGRATIONS): the threads filter's Source list
 * read getAll, so support's stayed empty (staging 2026-10-19). An older backend without the
 * route answers 404: the full list is read instead, for the roles that may.
 */
export const getMessageSourceOptions = async (): Promise<MessageSourceOption[]> => {
  try {
    const response = await apiClient.get<{ success: boolean; data: MessageSourceOption[] }>(
      '/api/integrations/message-sources'
    );
    return response.data.data ?? [];
  } catch (error) {
    if (getErrorStatus(error) !== 404) throw error;
    const all = await integrationsService.getAll();
    return (all.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      active: (row as { enabled?: boolean }).enabled ?? true,
    }));
  }
};
