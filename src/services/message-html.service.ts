import { apiClient } from '@/lib/api-client';

/**
 * The ORIGINAL HTML of one inbound message.
 *
 * Fetched per message rather than with the thread because production's stored markup averages
 * ~199 KB against ~18 KB of derived text — folding it into the thread payload would multiply
 * an ordinary inbox open for markup only the visible messages need.
 *
 * `null` is a normal answer: plenty of mail is genuinely plain text, and the caller keeps
 * rendering `content` in that case.
 */
export const getMessageHtml = async (eventId: number): Promise<string | null> => {
  const res = await apiClient.get<{ data: { html: string | null } }>(
    `/api/messages/events/${eventId}/html`
  );
  return res.data.data.html;
};
