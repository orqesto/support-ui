import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * Drafts on a ticket (reply templates P2, 2026-10-09; build spec A5): one draft per ticked thread,
 * made from a template or the typed text with each customer's placeholders filled and NO model
 * call. The agent edits any of them, has AI adapt the ones they pick, then sends the reviewed set
 * (`ticketRepliesService.send` with `{ fromDrafts: true }`). Nothing is sent by making drafts.
 *
 * ⛔ Version skew: a backend without the routes answers 404 — reported as `unavailable`, and the
 * ticket page then offers no drafts.
 */

export type TicketDraft = {
  conversationId: number;
  /** HTML, placeholders already filled for this thread. */
  content: string;
  /** The text before filling — the template's or the typed text. */
  baseContent: string;
  templateId: number | null;
  /** AI rewrote it for this conversation. */
  adapted: boolean;
  updatedAt: string;
};

export type TicketDrafts = { unavailable: true } | { unavailable: false; drafts: TicketDraft[] };

export type DraftsCreated = {
  created: number[];
  /** Threads given no draft, with why (a name token with no fallback for a customer with none). */
  refused: Array<{ conversationId: number; reason: string }>;
};

export type AdaptResult = { conversationId: number; ok: boolean; reason: string | null };

const toDraft = (raw: unknown): TicketDraft | null => {
  const row = (raw ?? {}) as Partial<Record<keyof TicketDraft, unknown>>;
  if (typeof row.conversationId !== 'number' || typeof row.content !== 'string') return null;
  return {
    conversationId: row.conversationId,
    content: row.content,
    baseContent: typeof row.baseContent === 'string' ? row.baseContent : row.content,
    templateId: typeof row.templateId === 'number' ? row.templateId : null,
    adapted: row.adapted === true,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
  };
};

const reasonsOf = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .map((row) => (row ?? {}) as { conversationId?: unknown; reason?: unknown })
    .filter((row) => typeof row.conversationId === 'number')
    .map((row) => ({
      conversationId: row.conversationId as number,
      reason: typeof row.reason === 'string' ? row.reason : 'not drafted',
    }));

export const ticketDraftsService = {
  async draftsOfTicket(ticketId: number): Promise<TicketDrafts> {
    try {
      const res = await apiClient.get<ApiResponse<{ drafts?: unknown[] }>>(
        `/api/tickets/${ticketId}/drafts`
      );
      const rows = res.data.data?.drafts;
      return {
        unavailable: false,
        drafts: (Array.isArray(rows) ? rows : [])
          .map(toDraft)
          .filter((row): row is TicketDraft => row !== null),
      };
    } catch (error) {
      if (getErrorStatus(error) === 404) return { unavailable: true };
      throw error;
    }
  },

  /** One draft per thread from a template or a text; a thread's earlier draft is replaced. */
  async create(
    ticketId: number,
    source: { templateId: number } | { content: string },
    conversationIds: number[]
  ): Promise<DraftsCreated> {
    const res = await apiClient.post<ApiResponse<{ created?: unknown; refused?: unknown }>>(
      `/api/tickets/${ticketId}/drafts`,
      { ...source, conversationIds }
    );
    const data = res.data.data;
    return {
      created: (Array.isArray(data?.created) ? data.created : []).filter(
        (id): id is number => typeof id === 'number'
      ),
      refused: reasonsOf(data?.refused),
    };
  },

  async update(ticketId: number, conversationId: number, content: string): Promise<void> {
    await apiClient.put(`/api/tickets/${ticketId}/drafts/${conversationId}`, { content });
  },

  async discard(ticketId: number): Promise<void> {
    await apiClient.delete(`/api/tickets/${ticketId}/drafts`);
  },

  /** AI rewrites each chosen draft for its own conversation; a failure leaves that draft as it was. */
  async adapt(ticketId: number, conversationIds: number[]): Promise<AdaptResult[]> {
    const res = await apiClient.post<ApiResponse<{ results?: unknown[] }>>(
      `/api/tickets/${ticketId}/drafts/adapt`,
      { conversationIds }
    );
    const rows = res.data.data?.results;
    return (Array.isArray(rows) ? rows : [])
      .map((row) => (row ?? {}) as { conversationId?: unknown; ok?: unknown; reason?: unknown })
      .filter((row) => typeof row.conversationId === 'number')
      .map((row) => ({
        conversationId: row.conversationId as number,
        ok: row.ok === true,
        reason: typeof row.reason === 'string' ? row.reason : null,
      }));
  },
};
