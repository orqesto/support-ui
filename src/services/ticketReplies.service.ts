import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * One reply written on a ticket page and sent into each of its threads separately — every
 * customer gets it in their own email chain (owner, 2026-09-23; support-service
 * `feat/ticket-reply-threads`, plan `TICKET-REPLY-ALL-PLAN-2026-10-09.md`).
 *
 * ⛔ Version skew: this frontend ships on merge, the backend on a tag. A backend without the
 * route answers 404 — reported as `unavailable`, and the page then offers no reply box at all.
 */

export type DeliveryOutcome =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'refused'
  | 'failed'
  /** A send that stopped part-way (the server restarted) — sending again picks it up. */
  | 'interrupted';

export type TicketReplyDelivery = {
  conversationId: number;
  outcome: DeliveryOutcome;
  reason: string | null;
  updatedAt: string;
  /** This thread was sent its own reviewed draft, not the reply's text (reply templates P2). */
  hasOwnText: boolean;
  /** Asked to resolve the thread, or to put it On-hold until this date, once sent. */
  resolve: boolean;
  holdUntil: string | null;
};

/** "Send & put on hold": each thread reached goes On-hold with this reason until this date. */
export type Hold = { reason: string; until: Date };

/** What one recipient would receive (POST …/replies/preview). */
export type ReplyPreview =
  | { conversationId: number; ok: true; text: string }
  | { conversationId: number; ok: false; reason: string };

/** "Generate with AI" on the ticket page (POST …/compose-update). */
export type ComposedUpdate = {
  text: string | null;
  sources: Array<{ id: number; title?: string }>;
  /** Why there is no text (e.g. a token limit), when the server says. */
  reason?: string;
};

/** The preview shows at most this many recipients. */
export const PREVIEW_COUNT = 3;

export type TicketReply = {
  id: number;
  /** Null when the reply went ONLY to threads the caller cannot open: counted, not shown. */
  content: string | null;
  attachments: Array<{ id: number; filename: string; size: number }>;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
  deliveries: TicketReplyDelivery[];
  /** Deliveries to threads the caller cannot open — left out of `deliveries`. */
  hiddenCount: number;
};

export type TicketReplies =
  | { unavailable: true }
  | {
      unavailable: false;
      replies: TicketReply[];
      /** The ticket's threads a reply cannot reach right now, with why. */
      unreachable: Array<{ conversationId: number; reason: string }>;
      /** The name each thread's `{first_name}` / `{customer_name}` would use (null = unknown). */
      names: Array<{
        conversationId: number;
        firstName: string | null;
        customerName: string | null;
      }>;
      maxThreads: number;
    };

export type SendResult = {
  replyId: number;
  /** The same text was sent from this ticket before — this is that reply, sent again. */
  existing: boolean;
  queued: number[];
  skipped: Array<{ conversationId: number; reason: 'already_sent' | 'in_progress' }>;
};

const OUTCOMES: readonly DeliveryOutcome[] = [
  'pending',
  'sending',
  'sent',
  'refused',
  'failed',
  'interrupted',
];

/** Still being worked on by the server — the page keeps polling while any delivery is. */
export const isInFlight = (outcome: DeliveryOutcome) =>
  outcome === 'pending' || outcome === 'sending';

/** The tokens a reply may use; each takes a fallback: `{first_name|there}`. */
export const PLACEHOLDERS = [
  'first_name',
  'customer_name',
  'ticket_id',
  'thread_id',
  'agent_name',
] as const;

/**
 * Name tokens used WITHOUT a fallback — the server refuses those threads whose customer has no
 * name, so the page can say so before Send. Same token shape as the server's. `{first_name}` is
 * not one: with no name it greets "there" (owner, 2026-10-19).
 */
export const nameTokensWithoutFallback = (text: string): Array<'customer_name'> =>
  /\{\{?customer_name\}\}?/.test(text) ? ['customer_name'] : [];

/**
 * What makes two replies "the same" — the server's rule (whitespace runs collapsed, ends
 * trimmed), so the confirm can say who already has this text before anything is sent.
 */
export const sameReplyText = (left: string, right: string) =>
  left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();

const toDelivery = (raw: Partial<TicketReplyDelivery>): TicketReplyDelivery => ({
  conversationId: typeof raw.conversationId === 'number' ? raw.conversationId : 0,
  // An outcome this build does not know is shown as a failure to explain, never as "sent".
  outcome: OUTCOMES.includes(raw.outcome as DeliveryOutcome)
    ? (raw.outcome as DeliveryOutcome)
    : 'failed',
  reason: typeof raw.reason === 'string' ? raw.reason : null,
  updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  // An older backend does not send it: no delivery had its own text there.
  hasOwnText: raw.hasOwnText === true,
  resolve: raw.resolve === true,
  holdUntil: typeof raw.holdUntil === 'string' ? raw.holdUntil : null,
});

const toReply = (raw: Partial<TicketReply>): TicketReply => ({
  id: typeof raw.id === 'number' ? raw.id : 0,
  content: typeof raw.content === 'string' ? raw.content : null,
  attachments: raw.attachments ?? [],
  createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  createdBy: raw.createdBy ?? null,
  deliveries: (raw.deliveries ?? []).map(toDelivery),
  hiddenCount: typeof raw.hiddenCount === 'number' ? raw.hiddenCount : 0,
});

export const ticketRepliesService = {
  /** Every reply sent from this ticket, newest first, with what happened in each thread. */
  async repliesOfTicket(ticketId: number): Promise<TicketReplies> {
    try {
      const res = await apiClient.get<
        ApiResponse<{
          replies?: Partial<TicketReply>[];
          unreachable?: Array<{ conversationId: number; reason: string }>;
          names?: Array<{
            conversationId: number;
            firstName: string | null;
            customerName: string | null;
          }>;
          maxThreads?: number;
        }>
      >(`/api/tickets/${ticketId}/replies`);
      const data = res.data.data;
      return {
        unavailable: false,
        replies: (data?.replies ?? []).map(toReply),
        unreachable: data?.unreachable ?? [],
        // An older backend sends no names: nothing is known, so nothing is warned about.
        names: data?.names ?? [],
        maxThreads: typeof data?.maxThreads === 'number' ? data.maxThreads : 100,
      };
    } catch (error) {
      if (getErrorStatus(error) === 404) return { unavailable: true };
      throw error;
    }
  },

  /**
   * Send a new reply (`content`), an earlier one again (`replyId`) or the reviewed drafts of these
   * threads (`fromDrafts` — each thread gets its own draft). The server skips every thread that
   * already has it; sending happens after this returns.
   */
  async send(
    ticketId: number,
    body: { content: string } | { replyId: number } | { fromDrafts: true },
    conversationIds: number[],
    /** Omitted on a re-send: each thread keeps the choice it was first sent with. */
    resolve: boolean | undefined,
    /** Files for a NEW reply — sent once, attached in every thread. */
    files: File[] = [],
    /** "Send & put on hold" — never together with resolve. */
    hold?: Hold
  ): Promise<SendResult> {
    const fields = {
      ...body,
      conversationIds,
      ...(resolve === undefined ? {} : { resolve }),
      ...(hold ? { holdUntil: hold.until.toISOString(), holdReason: hold.reason } : {}),
    };
    let payload: FormData | typeof fields = fields;
    if (files.length > 0) {
      // Multipart: every field as a string (JSON for the list and booleans), files as `attachments`.
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      for (const file of files) form.append('attachments', file);
      payload = form;
    }
    const res = await apiClient.post<ApiResponse<Partial<SendResult>>>(
      `/api/tickets/${ticketId}/replies`,
      payload
    );
    const data = res.data.data;
    return {
      replyId: data?.replyId ?? 0,
      existing: data?.existing === true,
      queued: data?.queued ?? [],
      skipped: data?.skipped ?? [],
    };
  },

  /** What these recipients (the first few ticked) would receive for `content`. Nothing is sent. */
  async preview(
    ticketId: number,
    content: string,
    conversationIds: number[]
  ): Promise<ReplyPreview[]> {
    const res = await apiClient.post<ApiResponse<{ previews?: ReplyPreview[] }>>(
      `/api/tickets/${ticketId}/replies/preview`,
      { content, conversationIds }
    );
    return res.data.data?.previews ?? [];
  },

  /**
   * One update for every thread, drafted from the ticket's title and cause with the knowledge
   * base. `instructions` (the agent's own facts) makes it a guided draft.
   */
  async composeUpdate(ticketId: number, instructions?: string): Promise<ComposedUpdate> {
    const res = await apiClient.post<
      ApiResponse<{ text?: string | null; sources?: ComposedUpdate['sources']; reason?: string }>
    >(`/api/tickets/${ticketId}/compose-update`, {
      mode: instructions ? 'guided' : 'generate',
      ...(instructions ? { instructions } : {}),
    });
    const data = res.data.data;
    return {
      text: typeof data?.text === 'string' ? data.text : null,
      sources: data?.sources ?? [],
      ...(data?.reason ? { reason: data.reason } : {}),
    };
  },
};
