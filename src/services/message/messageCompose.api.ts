/** The messages API's reply and compose endpoints (split out of message.service.ts, F5). */
import {
  normaliseReceivedAtOptions,
  receivedAtFailure,
  type ReceivedAtOption,
} from '../receivedAtOption';
import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { scopedLookup } from '@/lib/scopedLookup';
import type { WhatsAppTemplate } from '@/lib/whatsappTemplates';
import type { ApiResponse } from '@/types';
import type {
  AddressCoverage,
  AiDraft,
  ReceivedAddresses,
  ReceivedAddressRow,
  ReplyAssignIntent,
  ReplyCollision,
  ReplyRecipients,
  SenderCandidate,
  WhatsAppTemplateSend,
} from './message.types';

export const messageComposeApi = {
  reply: async (
    id: number,
    content: string,
    resolve = true,
    usedSuggestedAnswer = false,
    suggestedAnswerSource?: string,
    idempotencyKey?: string,
    aiDraft?: AiDraft,
    whatsappTemplate?: WhatsAppTemplateSend,
    recipients?: ReplyRecipients,
    assign?: ReplyAssignIntent,
    collision?: ReplyCollision
  ) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, {
      // The agent's answer to the ownership prompt; omitted when nothing was asked.
      ...(assign && { assign }),
      // Omitted entirely for a template send: the server renders the body from the
      // approved template, and a body we invented here would not be what Meta delivers.
      ...(!whatsappTemplate && { content }),
      resolve,
      usedSuggestedAnswer,
      ...(suggestedAnswerSource && { suggestedAnswerSource }),
      ...(idempotencyKey && { idempotencyKey }),
      ...(aiDraft && { aiDraft }),
      ...(whatsappTemplate && { whatsappTemplate }),
      // Omitted entirely when the agent left the fields alone. The BE reads an
      // absent `to` as "the requester, nobody else" — sending `[]` would be a
      // different statement, and reply-all must stay an explicit act.
      ...(recipients?.to?.length && { to: recipients.to }),
      ...(recipients?.cc?.length && { cc: recipients.cc }),
      ...(recipients?.bcc?.length && { bcc: recipients.bcc }),
      // The send guard; both absent = an older client's request, unguarded.
      ...(collision?.seenLastEventId !== undefined && {
        seenLastEventId: collision.seenLastEventId,
      }),
      ...(collision?.confirmOverride && { confirmOverride: true }),
    });
    return response.data;
  },

  /**
   * Approved templates this conversation can be continued with.
   *
   * Returns [] rather than throwing when the endpoint is absent. The frontend deploys on
   * merge to `main` while the backend ships on its own cadence, so there is a window
   * where this route 404s in production — and during it the composer must simply not
   * offer templates, not break the thread view around them.
   */
  listWhatsAppTemplates: async (id: number): Promise<WhatsAppTemplate[]> => {
    try {
      const response = await apiClient.get<ApiResponse<WhatsAppTemplate[]>>(
        `/api/messages/${id}/whatsapp-templates`
      );
      return response.data.data ?? [];
    } catch {
      return [];
    }
  },

  replyWithAttachments: async (
    id: number,
    content: string,
    files: File[],
    resolve = true,
    usedSuggestedAnswer = false,
    suggestedAnswerSource?: string,
    idempotencyKey?: string,
    aiDraft?: AiDraft,
    recipients?: ReplyRecipients,
    assign?: ReplyAssignIntent,
    collision?: ReplyCollision
  ) => {
    const formData = new FormData();
    formData.append('content', content);
    if (assign) formData.append('assign', assign);
    formData.append('resolve', String(resolve));
    formData.append('usedSuggestedAnswer', String(usedSuggestedAnswer));
    if (suggestedAnswerSource) formData.append('suggestedAnswerSource', suggestedAnswerSource);
    if (idempotencyKey) formData.append('idempotencyKey', idempotencyKey);
    // multipart carries no JSON types — the BE preprocesses this field back from
    // a string, so the attachment path captures reply_style exactly like the
    // JSON path does.
    if (aiDraft) formData.append('aiDraft', JSON.stringify(aiDraft));
    // Same JSON-string trick as aiDraft: multipart carries no arrays, and the BE
    // preprocesses these fields back from a string on this path.
    if (recipients?.to?.length) formData.append('to', JSON.stringify(recipients.to));
    if (recipients?.cc?.length) formData.append('cc', JSON.stringify(recipients.cc));
    if (recipients?.bcc?.length) formData.append('bcc', JSON.stringify(recipients.bcc));
    // The send guard, as strings (the BE coerces both from form-data).
    if (collision?.seenLastEventId !== undefined)
      formData.append('seenLastEventId', String(collision.seenLastEventId));
    if (collision?.confirmOverride) formData.append('confirmOverride', 'true');

    files.forEach((file) => {
      formData.append('attachments', file);
    });

    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, formData);
    return response.data;
  },

  /**
   * The addresses this workspace has actually received mail at, for the
   * "Received at" filter.
   *
   * Returns [] rather than throwing when the endpoint is absent. The frontend
   * deploys on merge while the backend ships on its own cadence, so this route
   * 404s in production during that window — and while it does, the filter must
   * simply not offer itself rather than break the filters bar around it.
   *
   * Any other failure — the backend's bounded read timing out (503 `timedOut`), a server
   * error, no network — REJECTS with a `ReceivedAtOptionsError`: an empty list would read as
   * "no addresses", and the filter shows "Couldn't load addresses — retry" instead.
   */
  getReceivedAtOptions: async (): Promise<ReceivedAtOption[]> => {
    try {
      // `detailed=1` is opt-in on the backend and an older one ignores it, answering
      // with the plain `string[]` it always did. `normaliseReceivedAtOptions` accepts
      // both — see the note there on why that is not optional.
      // Shared for a minute: the filter bar and the table header both ask (scopedLookup). Only
      // an answer is kept — a failure rejects inside, so the next caller asks again.
      return await scopedLookup('received-at-options', async () => {
        const response = await apiClient.get<ApiResponse<unknown>>(
          '/api/messages/received-at-options?detailed=1'
        );
        return normaliseReceivedAtOptions(response.data.data);
      });
    } catch (error) {
      const failure = receivedAtFailure(error);
      if (failure === null) return [];
      throw failure;
    }
  },

  /**
   * Every address this workspace has taken delivery on, with provenance: how many
   * conversations, when it was last seen, and whether it is already attached to a
   * message source (as its configured address or a declared alias).
   *
   * 🔑 OBSERVED IS NOT OURS. A cc'd colleague or a supplier on a thread lands in
   * this list too. Adopting one as a mailbox alias tells direction detection that
   * mail FROM that person is our own outgoing — and outgoing mail with no
   * recoverable correspondent leaves the inbox entirely. So this reports and a
   * human adopts; the UI must never pre-select.
   *
   * Returns `null` — not an empty list — when the route is absent, so the caller
   * can say "this backend cannot answer yet" instead of "you receive on nothing".
   * The frontend deploys on merge while the backend ships on its own cadence, so
   * that window is real and the two states are not interchangeable here.
   */
  getReceivedAddresses: async (): Promise<ReceivedAddresses | null> => {
    try {
      const response = await apiClient.get<
        ApiResponse<ReceivedAddressRow[]> & {
          coverage?: Partial<AddressCoverage>;
          senderCandidates?: Partial<SenderCandidate>[];
        }
      >('/api/messages/received-addresses');
      const rows = response.data.data ?? [];
      const candidates = response.data.senderCandidates ?? [];
      // Normalised here rather than at the render site: a field this service does
      // not defend becomes a white screen the first time an older backend omits it.
      return {
        addresses: rows
          .map((row) => ({
            address: String(row.address ?? ''),
            conversations: Number(row.conversations ?? 0),
            lastSeenAt: row.lastSeenAt ?? null,
            messageSourceIds: Array.isArray(row.messageSourceIds) ? row.messageSourceIds : [],
            configured: row.configured === true,
            declared: row.declared === true,
            attachedToSourceId: row.attachedToSourceId ?? null,
            // Both of these were being DROPPED here while the backend sent them, so the
            // panel scored delivery rows as if no evidence existed — the one list that
            // matters once a workspace has delivery data.
            likelyOurs: row.likelyOurs === true,
            deliveredConversations: Number(row.deliveredConversations ?? 0),
          }))
          .filter((row) => row.address.length > 0),
        // Absent on a backend that predates sender candidates — an empty list, not a
        // crash, so the panel simply offers one source instead of two.
        senderCandidates: candidates
          .map((row) => ({
            address: String(row.address ?? ''),
            conversations: Number(row.conversations ?? 0),
            lastSeenAt: row.lastSeenAt ?? null,
            likelyOurs: row.likelyOurs === true,
          }))
          .filter((row) => row.address.length > 0),
        coverage: {
          conversations: Number(response.data.coverage?.conversations ?? 0),
          withDeliveryAddress: Number(response.data.coverage?.withDeliveryAddress ?? 0),
        },
      };
    } catch (err) {
      // 404 is the ONE failure that means "this backend predates the route". The
      // endpoint takes no id, so a not-found cannot be a missing record — an older
      // deploy simply has nothing mounted here and falls through to
      // `GET /api/messages/:id`, which answers "Message not found".
      //
      // Everything else — 401, 403, a 500, a dropped connection — is a fault, and
      // returning null for it told the panel to say "this backend cannot suggest
      // addresses yet". That sentence is a claim about the DEPLOYMENT, and it read
      // identically whether the route was absent or the request had just failed,
      // so a transient error looked like a permanent capability gap.
      if (getErrorStatus(err) === 404) return null;
      throw err;
    }
  },

  // Compose a brand-new outbound email (#18). Creates a new conversation
  // and dispatches via the chosen integration's email channel. Attachments
  // are optional.
  composeNew: async (input: {
    messageSourceId: number;
    /** Several since 2026-10-19; the first is the thread's customer. */
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    content: string;
    attachments?: File[];
  }) => {
    const formData = new FormData();
    formData.append('messageSourceId', String(input.messageSourceId));
    // One address goes as a plain string — the only shape a backend from before the list change
    // accepts, so the common case keeps working whichever backend is deployed. Several go JSON-
    // encoded like cc/bcc.
    formData.append('to', input.to.length === 1 ? input.to[0] : JSON.stringify(input.to));
    // JSON-encoded, like aiDraft on the reply path: multipart has no array type,
    // and multer would hand the BE a bare string for one address and an array for
    // two — a shape that changes with the input is a validation bug waiting to
    // happen. The BE preprocesses these back.
    if (input.cc?.length) formData.append('cc', JSON.stringify(input.cc));
    if (input.bcc?.length) formData.append('bcc', JSON.stringify(input.bcc));
    formData.append('subject', input.subject);
    formData.append('content', input.content);
    input.attachments?.forEach((file) => formData.append('attachments', file));

    const response = await apiClient.post<
      ApiResponse<{ conversationId: number; messageEventId: number }>
    >('/api/messages/compose', formData);
    return response.data;
  },
};
