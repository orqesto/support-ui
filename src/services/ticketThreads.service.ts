import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { announceThreadTicketsChanged as announce } from '@/services/ticketThreadsEvents';
import type { ApiResponse } from '@/types';

/**
 * A ticket is an escalation — a tech incident — that many customers' threads can report, and one
 * thread can be on several tickets (owner, 2026-09-30; support-service
 * `feat/ticket-escalation`). The thread-to-thread link it replaces is gone.
 *
 * ⛔ Version skew: the frontend can reach a backend that predates these routes. They answer 404
 * there, and that is reported as `unavailable` — never as "no tickets" / "no threads", which
 * would state something false about the ticket or thread.
 */

export type ThreadTicket = {
  ticketId: number;
  publicId: string | null;
  /** Shown id (`SUP-T-42`); absent from a backend older than ticket numbers. */
  reference?: string | null;
  title: string;
  status: string;
  priority: string;
  issueType: string;
  externalId: string | null;
  /** True when the ticket was CREATED from this thread. */
  isPrimary: boolean;
  resolvedAt: string | null;
  /**
   * The ticket is resolved/closed and no agent has replied on this thread since — the customer
   * has not been told. Null: the ticket is done but has no recorded resolution time, so it is
   * unknown (never shown as "owes").
   */
  owesReply: boolean | null;
};

export type TicketThread = {
  conversationId: number;
  publicId: string | null;
  subject: string | null;
  requesterEmail: string;
  status: string;
  channel: string;
  createdAt: string;
  /** True for the thread the ticket was created from — it cannot be removed. */
  isPrimary: boolean;
  addedAt: string;
  owesReply: boolean | null;
  /** On-hold since / why / until when (null when not on hold). Contingency page, 2026-10-19. */
  parkedAt: string | null;
  parkedReason: string | null;
  parkedUntil: string | null;
  /** A reply from this ticket reached the thread — it can no longer be removed from the ticket. */
  receivedUpdate: boolean;
};

/** What a status action did to each thread (resolve / reopen). */
export type ThreadStatusResult = {
  done: number[];
  skipped: Array<{ conversationId: number; reason: 'already_resolved' | 'already_open' }>;
  failed: Array<{ conversationId: number; error: string }>;
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** An older backend sends none of the hold fields: not on hold, never updated (removable). */
export const toTicketThread = (raw: TicketThread): TicketThread => ({
  ...raw,
  parkedAt: str(raw.parkedAt),
  parkedReason: str(raw.parkedReason),
  parkedUntil: str(raw.parkedUntil),
  receivedUpdate: raw.receivedUpdate === true,
});

/** A list the caller may see only part of: `hiddenCount` rows are in departments they cannot open. */
export type Scoped<T> =
  | { unavailable: false; rows: T[]; hiddenCount: number }
  | { unavailable: true };

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);

const scoped = async <T>(load: () => Promise<{ rows: T[] | undefined; hiddenCount: unknown }>) => {
  try {
    const { rows, hiddenCount } = await load();
    return { unavailable: false as const, rows: rows ?? [], hiddenCount: asNumber(hiddenCount) };
  } catch (error) {
    if (getErrorStatus(error) === 404) return { unavailable: true as const };
    throw error;
  }
};

const statusAction = async (
  ticketId: number,
  action: 'resolve' | 'reopen',
  conversationIds: number[]
): Promise<ThreadStatusResult> => {
  const res = await apiClient.post<ApiResponse<Partial<ThreadStatusResult>>>(
    `/api/tickets/${ticketId}/conversations/${action}`,
    { conversationIds }
  );
  announce(conversationIds);
  const data = res.data.data;
  return { done: data?.done ?? [], skipped: data?.skipped ?? [], failed: data?.failed ?? [] };
};

export const ticketThreadsService = {
  /** Every ticket this thread belongs to, newest first. */
  async ticketsOfThread(conversationId: number): Promise<Scoped<ThreadTicket>> {
    return scoped(async () => {
      const res = await apiClient.get<
        ApiResponse<{ tickets?: ThreadTicket[]; hiddenCount?: number }>
      >(`/api/messages/${conversationId}/tickets`);
      return { rows: res.data.data?.tickets, hiddenCount: res.data.data?.hiddenCount };
    });
  },

  /** The threads a ticket covers, origin first. */
  async threadsOfTicket(ticketId: number): Promise<Scoped<TicketThread>> {
    return scoped(async () => {
      const res = await apiClient.get<
        ApiResponse<{ threads?: TicketThread[]; hiddenCount?: number }>
      >(`/api/tickets/${ticketId}/conversations`);
      return {
        rows: res.data.data?.threads?.map(toTicketThread),
        hiddenCount: res.data.data?.hiddenCount,
      };
    });
  },

  /** Resolve these threads WITHOUT sending anything. */
  async resolveThreads(ticketId: number, conversationIds: number[]): Promise<ThreadStatusResult> {
    return statusAction(ticketId, 'resolve', conversationIds);
  },

  /** Undo a send or a resolve: reopen these threads. Emails already sent stay sent. */
  async reopenThreads(ticketId: number, conversationIds: number[]): Promise<ThreadStatusResult> {
    return statusAction(ticketId, 'reopen', conversationIds);
  },

  /** Add threads (any customer's) to a ticket. Adding one already there is not an error. */
  async addThreads(
    ticketId: number,
    conversationIds: number[]
  ): Promise<{ added: number[]; alreadyAttached: number[] }> {
    const res = await apiClient.post<ApiResponse<{ added?: number[]; alreadyAttached?: number[] }>>(
      `/api/tickets/${ticketId}/conversations`,
      { conversationIds }
    );
    const added = res.data.data?.added ?? [];
    announce(conversationIds);
    return { added, alreadyAttached: res.data.data?.alreadyAttached ?? [] };
  },

  /** Take a thread off a ticket. The thread itself is untouched. */
  async removeThread(ticketId: number, conversationId: number): Promise<boolean> {
    const res = await apiClient.delete<ApiResponse<{ removed?: boolean }>>(
      `/api/tickets/${ticketId}/conversations/${conversationId}`
    );
    announce([conversationId]);
    return res.data.data?.removed ?? false;
  },
};
