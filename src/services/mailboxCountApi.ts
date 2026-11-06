import { apiClient } from '@/lib/api-client';
import { runCountJob, type CountProgress } from './countJobApi';

/** A mailbox message the backend could not find in Odly by its message id. */
export type MissingMessageSample = {
  id: string | null;
  from: string | null;
  subject: string | null;
  date: string | null;
};

/** `count` is a FLOOR when `capped`; inOdly/missing then cover only the messages listed. */
export type GmailCountResult = {
  count: number;
  capped: boolean;
  query: string;
  inOdly: number;
  missing: number;
  /**
   * SENT-only messages matched neither by id nor by Message-ID, with an outbound reply in their
   * Gmail thread sent within minutes — the sent-folder pass can hold such a copy without its id.
   * (SENT-only copies found by Message-ID are already in `inOdly`.) Absent from an older
   * backend: read as 0.
   */
  unverifiable?: number;
  /** The SENT-only check did not finish, so some of `missing` may be such copies. */
  sentOnlyCapped?: boolean;
  /** Sent messages found but never checked (inside `missing`). A floor; absent on older backends. */
  sentOnlyUnchecked?: number;
  /** Gmail refused a request for quota; the check stopped early and samples were skipped. */
  quotaHit?: boolean;
  /** Listed ids the time limit left uncompared — neither in Odly nor missing. */
  notCompared?: number;
  /** inOdly + missing + unverifiable; with notCompared it adds up to count. */
  compared?: number;
  /** Where Google refused: the main listing, the sent-copy check, or the example reads. */
  quotaHitIn?: 'listing' | 'sentCheck' | 'samples' | 'kbHistory' | null;
  /**
   * KB sources only: how many listed messages are history from before the KB cutoff — the part
   * mined for the knowledge base. The rest is imported as regular work. `capped`: at least
   * `count`, or not counted at all when `count` is 0. Absent on an older backend.
   */
  kbHistory?: {
    count: number;
    capped: boolean;
    from: string | null;
    to: string;
    approximate?: boolean;
    sweepOwed?: boolean;
    miningOff?: boolean;
  } | null;
  /** Why the main listing is partial. Absent on older backends: read a cap as `size`. */
  cappedBy?: 'size' | 'time' | 'quota' | 'error' | null;
  /** The backend's time budget, not the page cap, stopped the listing. */
  timedOut?: boolean;
  missingSamples: MissingMessageSample[];
};

export type ImapCountResult = {
  count: number;
  inOdly: number;
  missing: number;
  unverifiable: number;
  capped: boolean;
  /** The time budget stopped the listing (a Sent folder not reached is absent from `folders`). */
  timedOut?: boolean;
  /**
   * `count` = messages COMPARED; `found` = the folder's search total; `failed` = the server's
   * search failed, nothing in it was compared. `found`/`capped`/`failed` are absent on older
   * backends.
   */
  folders: Array<{
    name: string;
    count: number;
    found?: number;
    capped?: boolean;
    failed?: boolean;
    /** Why this folder is partial (backend's own reason); absent on older backends. */
    cappedBy?: 'size' | 'time' | 'shortFetch' | 'failed';
  }>;
  missingSamples: MissingMessageSample[];
  /** 0 = all time. */
  windowDays: number;
  /** KB sources only: listed messages from before the KB cutoff — the part mined. See Gmail's. */
  kbHistory?: {
    count: number;
    capped: boolean;
    from: string | null;
    to: string;
    approximate?: boolean;
    sweepOwed?: boolean;
    miningOff?: boolean;
  } | null;
  /**
   * Does the mailbox have a Sent folder? true — the server listed one; false — its LIST named
   * none; null — the LIST failed. Absent on older backends (treated as unknown).
   */
  sentKnown?: boolean | null;
  /**
   * The source's read-state filter (ALL / UNSEEN / SEEN / FLAGGED / UNANSWERED). The count
   * ignores it; with anything but ALL, mail the source never imports shows as missing.
   */
  searchCriteria?: string;
  /** The sync reads at most this many per folder per run. */
  perRunLimit: number;
};

/**
 * The mailbox counts behind "Check Messages Count" and "Compare with Odly", run as background
 * counts (countJobApi.ts). Exposed as `integrationsService.countGmailMessages` / `countImapMessages`.
 *
 * "Check Messages Count" for a Gmail source — the messages its FIRST sync will import, counted
 * with the same query the sync issues. Works on a paused source; the overrides recount a
 * changed setting without saving it. `capped` means AT LEAST `count` (counting stopped).
 * Runs as a background count (countJobApi.ts): the whole range, with progress.
 */
export const countGmailMessages = async (
  id: number,
  overrides: { searchQuery?: string; bulkImportDays?: number; isKnowledgeBase?: boolean } = {},
  follow: { onProgress?: (progress: CountProgress) => void; signal?: AbortSignal } = {}
): Promise<GmailCountResult> =>
  runCountJob<GmailCountResult>({
    sourceId: id,
    kind: 'gmail-count',
    params: overrides,
    ...follow,
    fallback: async () => {
      const response = await apiClient.post<{ success: boolean; data: GmailCountResult }>(
        `/api/integrations/${id}/gmail-count`,
        overrides
      );
      return response.data.data;
    },
  });

/**
 * Reconcile a SAVED IMAP source against Odly: how many messages the mailbox holds in the
 * sync window, how many of them are already in Odly (matched by Message-ID) and how many are
 * missing. `unverifiable` = no Message-ID header — never counted as missing.
 * Runs as a background count (countJobApi.ts): the whole window, with progress.
 */
export const countImapMessages = async (
  id: number,
  opts: { days?: number } = {},
  follow: { onProgress?: (progress: CountProgress) => void; signal?: AbortSignal } = {}
): Promise<ImapCountResult> => {
  const params = opts.days === undefined ? undefined : { days: opts.days };
  return runCountJob<ImapCountResult>({
    sourceId: id,
    kind: 'imap-count',
    params: params ?? {},
    ...follow,
    fallback: async () => {
      const response = await apiClient.post<{ success: boolean; data: ImapCountResult }>(
        `/api/integrations/${id}/imap-count`,
        params
      );
      return response.data.data;
    },
  });
};
