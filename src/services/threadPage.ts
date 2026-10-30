/**
 * What the thread endpoint says it left out (support-service `GET /api/messages/:id/thread`).
 *
 * Normalised here so both backends are tolerated: the one that pages (`page` in the envelope)
 * and the one before it, which answered the whole thread and said nothing — this app deploys
 * on a push to `main`, the backend on a tag, so the frontend can meet either.
 */
export type ThreadPage = {
  /** Every event of the thread, whatever the answer carried. */
  total: number;
  /** True when events older than `earliestId` exist and were not sent. */
  hasEarlier: boolean;
  /** Where the next older page starts (`before=`), null when nothing was sent. */
  earliestId: number | null;
};

export type ThreadPageRequest = {
  limit?: number;
  before?: number;
  /** Only the events after this id (support-service incremental read); see threadNewEvents. */
  afterEventId?: number;
};

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

export const normaliseThreadPage = (
  raw: unknown,
  rows: { id: number }[]
): ThreadPage => {
  const page = (raw ?? null) as Partial<ThreadPage> | null;
  const total = positiveInt(page?.total);
  if (page === null || total === null) {
    // The backend before paging: what it sent is all there is.
    return { total: rows.length, hasEarlier: false, earliestId: rows[0]?.id ?? null };
  }
  return {
    total,
    hasEarlier: page.hasEarlier === true,
    earliestId: positiveInt(page.earliestId),
  };
};

export const threadPageQuery = (page?: ThreadPageRequest): string => {
  const params = new URLSearchParams();
  if (page?.limit) params.set('limit', String(page.limit));
  if (page?.before) params.set('before', String(page.before));
  if (page?.afterEventId) params.set('afterEventId', String(page.afterEventId));
  const query = params.toString();
  return query ? `?${query}` : '';
};

/**
 * What an `afterEventId` read answered. A backend that knows the parameter says
 * `incremental: true` and sends only newer events (oldest first, capped), with `hasMore` when the
 * cap cut it short. One that does not ignores the parameter and answers the latest window as for
 * a plain read — that answer is still usable, as the whole window.
 *
 * Read from the envelope, or from its `page`, so either placement is tolerated.
 */
export type ThreadNewEvents = { incremental: true; hasMore: boolean } | { incremental: false };

export const normaliseThreadNewEvents = (envelope: unknown): ThreadNewEvents => {
  const top = (envelope ?? {}) as { incremental?: unknown; hasMore?: unknown; page?: unknown };
  const page = (top.page ?? {}) as { incremental?: unknown; hasMore?: unknown };
  if (top.incremental === true) return { incremental: true, hasMore: top.hasMore === true };
  if (page.incremental === true) return { incremental: true, hasMore: page.hasMore === true };
  return { incremental: false };
};
