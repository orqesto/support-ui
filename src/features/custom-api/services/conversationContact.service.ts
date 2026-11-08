import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * CA-6: resolve a conversation's customer to a contact, creating one if none exists, so a thread
 * can open that customer's records page (support-service #800).
 *
 * ⛔ IT WRITES, and is called only from a press. A customer record created because a panel mounted
 * is a row nobody can account for; following a link has to be the agent's decision.
 *
 * ⚠️ The backend answers 400 when the conversation carries no address — our own sent mail with no
 * parent, or a channel that names people some other way — rather than inventing an identity. The
 * caller SHOWS that, because a link that silently does nothing reads as a broken page.
 *
 * It lives in its own module because `message.service.ts` sits on its 650-line cap, and a cap is
 * a worse reason to put a call in the wrong place than it is to make a new file.
 */
export const conversationContactService = {
  async resolve(conversationId: number): Promise<{ contactId: number; created: boolean } | null> {
    const response = await apiClient.post<ApiResponse<{ contactId: number; created: boolean }>>(
      `/api/messages/${conversationId}/contact`,
      {}
    );
    // ⛔ NULLABLE on purpose. A 200 whose body carries no contact id is not a success the caller
    // can act on — navigating to `/contacts/undefined/records` would answer "this customer could
    // not be opened" and blame the customer for our own empty response.
    return response.data.data ?? null;
  },
};
