/** The messages API's request and answer shapes (split out of message.service.ts, F5). */
import type { LatestNotePreview } from '@/services/contact.service';
import type { Message } from '@/types';

/** One address this workspace has received mail at. See `getReceivedAddresses`. */
export type ReceivedAddressRow = {
  address: string;
  conversations: number;
  lastSeenAt: string | null;
  messageSourceIds: number[];
  /** This is the address a source is configured with. */
  configured: boolean;
  /** Declared on a source config as an alias of that mailbox. */
  declared: boolean;
  /** Attached to a source by either route — the set that drives direction detection. */
  attachedToSourceId: number | null;
  /** Shares a local part with an address already owned. A hint for sorting, not a verdict. */
  likelyOurs: boolean;
  /**
   * Conversations carrying our OWN server's delivery stamp for this address.
   *
   * The only non-heuristic signal in this payload: To and Cc are the sender's account of who
   * they wrote to, so a cc'd supplier is indistinguishable from an alias, while `Delivered-To`
   * is written by the receiving server. Zero does not mean "not ours" — the header is absent
   * on plenty of mail.
   */
  deliveredConversations: number;
};

/**
 * How much of the archive the answer rests on. `recipients` is only recorded from
 * the release that started writing it and the backfill for older mail is a manual
 * step, so a short list means either "few aliases" or "few rows carry the data".
 * Saying which is the difference between a useful answer and a misleading one.
 */
export type AddressCoverage = {
  conversations: number;
  withDeliveryAddress: number;
};

/**
 * An address seen as the SENDER of conversations, offered because delivery data may
 * not exist at all: `recipients` is written only from the release that introduced it
 * and the backfill needs host access. Most of these are customers — it is a ranked
 * prompt, never a claim of ownership.
 */
export type SenderCandidate = {
  address: string;
  conversations: number;
  lastSeenAt: string | null;
  /** Shares a local part with an address already owned. A hint for sorting, not a verdict. */
  likelyOurs: boolean;
};

export type ReceivedAddresses = {
  addresses: ReceivedAddressRow[];
  senderCandidates: SenderCandidate[];
  coverage: AddressCoverage;
};

// Compact message source for populating list filters (GET /api/messages/sources).
export type MessageSourceOption = {
  id: number;
  name: string;
  type: string;
  departmentId: number | null;
  enabled: boolean;
};

/** `id` is negative for the synthetic `routing.decision` entries the BE appends (no audit row behind them). */
export type MessageActivityEntry = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  userEmail: string | null;
  userId: number | null;
};

export type MessageNote = {
  id: number;
  messageId: number;
  userId: number | null;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: number; firstName: string; lastName: string | null; email: string } | null;
  /**
   * Who wrote the row: `'hold'` = the note the backend writes when the thread goes on or comes
   * off hold (`isHoldNote`). Absent from older backends — treat absent as an ordinary note.
   */
  source?: string | null;
  /** Hold notes: `{ kind: 'hold', reason, until }` or `{ kind: 'unhold', cause }`. */
  metadata?: Record<string, unknown> | null;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  /**
   * The thread list (backend search plan step 3½): `total` is "at least this many": a typed
   * search counts to 10,000, and a count that ran out of time reports what is known. Show it
   * as `10,000+` (`formatTotal`). Absent on other lists and older backends.
   */
  totalCapped?: boolean;
  /** The count did not finish: `total` is only what the page proved. Never show it as a count. */
  countTimedOut?: boolean;
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T;
  pagination: PaginationMeta;
};

/**
 * The contacts list. `timedOut`: its page ran out of time (searching: 3 s) and came back with no
 * rows — "not finished", never "no contacts". Its count may be a lower bound (`totalCapped`) or
 * not finished (`countTimedOut`), as the thread list's. Absent on older backends.
 */
export type ContactsResponse = PaginatedResponse<MessageContact[]> & { timedOut?: boolean };

/**
 * What the current lens is hiding. `/api/messages/threads` only computes it when asked
 * (`scope=1`), because the same endpoint doubles as a counter — the dashboard fires ten
 * calls reading only `pagination.total`, and the board one per column.
 *
 * ⛔ `null` means NO INFORMATION — not requested, the aggregate failed, or a view it
 * cannot describe. It is NOT the same claim as `hidden: 0`, which means the list really
 * is everything. Render `null` as silence.
 *
 * ⚠️ `hiddenBecause` OVERLAPS and must never be summed: a resolved thread mined from the
 * knowledge base is counted under both `terminal` and `knowledgeBase`. On one real
 * workspace those two are 2,935 and 2,952 against 3,009 hidden rows.
 */
export type ListScope = {
  withoutLens: number;
  hidden: number;
  /**
   * Whether `view=board` is exhaustive on the backend that answered — i.e. whether the
   * board's tenth column (`view=no_lane`) exists there.
   *
   * ⛔ OPTIONAL, and the optionality is the whole mechanism. This repo deploys on merge
   * while the backend ships on a tag, so this bundle runs against older backends as a
   * matter of routine. An unknown view is not rejected there, it is DROPPED, and the
   * request comes back answered by the default browse lens — so an ungated Other column
   * would render ordinary open threads under that heading and look entirely plausible.
   * Absent means "this backend does not have it"; never coalesce it to true.
   */
  boardCoversAll?: boolean;
  /**
   * Depth per board column / list chip, keyed by column id, under the lens-free baseline —
   * i.e. the list that chip opens. Built backend-side from the SAME predicates that list uses.
   *
   * ⛔ OPTIONAL, and a MISSING id means "not counted", never 0: this bundle routinely runs
   * against an older backend (FE deploys on merge, BE ships on a tag), and a 0 there would
   * claim an empty queue over rows that exist.
   */
  columnCounts?: Record<string, number>;
  /**
   * A searching scope the backend stopped counting at its cap (search plan step 3½d): EVERY
   * number here is "at least", never exact — chips and the "Not shown" notice show `200+`;
   * sentences that need an exact figure stay silent (`hiddenKnown`). Absent on an older backend,
   * which never caps: exact.
   */
  capped?: boolean;
  hiddenBecause: {
    terminal: number;
    spam: number;
    suspicious: number;
    notAnalysed: number;
    archived: number;
    knowledgeBase: number;
    awaitingOrReplied: number;
    needsRouting: number;
    /**
     * Own sent mail with no inbound parent. Optional: an older backend does not send it,
     * and a missing count must read as "unknown", never as 0 — see `ListScopeNotice`.
     */
    orphanOutgoing?: number;
    other: number;
  };
};

/** How the backend read the typed search, after `normalizeSearchReading`. */
export type SearchReading = {
  terms: string[];
  asPhrase: boolean;
  /**
   * Terms whose search INSIDE words (no word starts with them) hit its time or size bound, so
   * matches for them may be missing. Always an array once normalised.
   */
  cutShort: string[];
  /**
   * The list itself ran out of time while searching: no rows came back, and that is NOT "no
   * match". False on an older backend.
   */
  timedOut: boolean;
  /**
   * Many threads matched, so the backend walked them newest first and put the best matches
   * (subject, address, exact text, ticket number) first among the newest N only (backend
   * walk.ts). null otherwise, and on an older backend.
   */
  rankedWithin: number | null;
};

/**
 * Where a listed thread matched the typed search (backend threadSearchMatch.ts). `snippet` only for
 * a body or note match: PLAIN TEXT around the hit, shown in place of the latest-message preview.
 * `note`: no message holds a typed word — an internal note on the thread does.
 */
export type SearchMatch = {
  field: 'reference' | 'subject' | 'people' | 'body' | 'note';
  snippet?: string;
};

export type ThreadsResponse = PaginatedResponse<MessageThread[]> & {
  scope?: ListScope | null;
  /**
   * The list ran out of time and was stopped (backend search plan step 3½): the rows are NOT
   * "nothing matches". Absent on an older backend.
   */
  timedOut?: boolean;
  /** Normalised in `getThreads` — never the raw wire shape. */
  search: SearchReading | null;
  /**
   * The rows ARE the matches outside the view (`outsideView=1` answered). Absent on a backend
   * without outsideView, which answers the view's own rows to the same request.
   */
  outsideView?: boolean;
};

export type RawThreadsBody = Omit<ThreadsResponse, 'search'> & { search?: unknown };

export type ThreadBoardAnswer = {
  columns: Record<string, ThreadsResponse[] | null>;
  counts: Record<string, { pagination: PaginationMeta; scope: ListScope | null } | null>;
};

export type MessagesMetadata = {
  total: number;
  totalPages: number;
  limit: number;
  unprocessed: number;
  resolved: number;
  spam: number;
};

export type MetadataResponse = {
  success: boolean;
  metadata: MessagesMetadata;
};

export type MessageContact = {
  sender: string;
  messageCount: number;
  subjectCount: number;
  lastMessageAt: string;
  hasUnread: boolean;
  hasTicket: boolean;
  isLead: boolean;
  /**
   * Any listed thread still in live work. Undefined from a backend that predates the field —
   * read as "unknown", never as resolved.
   */
  hasOpen?: boolean;
  /** Contact notes about this customer; 0 from a backend that predates the field. */
  noteCount: number;
  /** The newest note, cut for a preview; null when there are none. */
  latestNote: LatestNotePreview | null;
};

export type MessageContactSubject = {
  normalizedSubject: string;
  displaySubject: string;
  messageCount: number;
  lastMessageAt: string;
  latestMessageId: number;
  isLead: boolean;
  hasTicket: boolean;
};

/**
 * Who an outbound reply is addressed to.
 *
 * All three are optional and an empty list is never sent: the BE reads an absent
 * `to` as "the thread's requester and nobody else". Reply-all is something the
 * agent does on purpose — on a shared support inbox the accidental version
 * discloses the thread to whoever the customer happened to cc.
 */
/** The agent's answer to "does this thread become yours?" — see assignOnReplyPrompt.ts. */
export type ReplyAssignIntent = 'me' | 'none';

export type ReplyRecipients = {
  to?: string[];
  cc?: string[];
  bcc?: string[];
};

export type MessageThread = {
  threadId: string;
  messageCount: number;
  sender: string;
  channel: string;
  hasUnread: boolean;
  hasTicket: boolean;
  /**
   * The chip's status: the newest ticket on the thread that is not resolved/closed, else the
   * newest one. A thread may be on several tickets (2026-09-30) — see `ticketCount`.
   */
  linkedTicketStatus: string | null;
  /**
   * How many tickets cover the thread. Absent from a backend that predates several tickets per
   * thread — read it through `ticketChip`, which falls back to `hasTicket`.
   */
  ticketCount?: number;
  isResolved: boolean;
  isLead: boolean;
  /** Per-user read state for the triage read/unread indicator (true = read).
   *  Optional for back-compat with list shapes/tests that omit it; the unread
   *  dot only shows on an explicit `false`. */
  isRead?: boolean;
  lastReplyFromClient: boolean | null;
  lastMessageAt: Date;
  latestMessage: Message | null;
  latestIncomingMessage: Message | null;
  /** Normalised in `getThreads`: null when nothing was typed or the backend predates it. */
  searchMatch?: SearchMatch | null;
  /**
   * Only on a searched list's `outsideView` answer (backend outsideView.ts): the "Not shown"
   * bucket that names where this match is. Absent from a backend without that option.
   */
  foundIn?: keyof ListScope['hiddenBecause'];
};

/**
 * The AI draft the agent started this reply from — sent with the send so the BE's
 * reply_style domain can learn house voice from what they CHANGED (Phase 1).
 *
 * `text` must be the draft EXACTLY as it landed in the composer (editor HTML, not
 * the plain text the compose endpoint returned): the BE compares it against the
 * sent body verbatim to decide `accept` vs `edit`, and that body is composer HTML.
 * Sending the plain form would mark every untouched draft as edited.
 */
export type AiDraft = { text: string; mode?: string; language?: string };

/** An agent's template choice. Positional parameters, matching Meta's {{1}}, {{2}}… */
export type WhatsAppTemplateSend = { templateId: number; parameters: string[] };

/** What the agent kept, after any edits. The ids identify which extracted pair it came from. */
export type KbQaPairInput = {
  questionMessageId: number;
  answerMessageId: number;
  question: string;
  answer: string;
};
