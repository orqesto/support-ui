import type {
  MessageThread,
  RawThreadsBody,
  SearchMatch,
  SearchReading,
  ThreadsResponse,
} from './message.types';

/**
 * The thread list ran out of time (backend search plan step 3½): the page or the count was
 * stopped. `getThreads` throws it for every caller except the thread list, which says so on
 * screen (`allowTimedOut`). A board column, a counter, merge candidates or the new-threads probe
 * must never read an unfinished answer as "empty" or as a number: their error paths keep what
 * they showed, or show nothing.
 */
export class ListTimedOutError extends Error {
  constructor() {
    super('The thread list took too long and was stopped. Try again, or narrow it with a filter.');
    this.name = 'ListTimedOutError';
  }
}

/**
 * The reading as sent. Every field may be absent: the frontend deploys before the backend tag,
 * so an older backend sends no `search`, or one without `cutShort`.
 */
export const normalizeSearchReading = (raw: unknown): SearchReading | null => {
  if (!raw || typeof raw !== 'object') return null;
  const reading = raw as {
    terms?: unknown;
    asPhrase?: unknown;
    cutShort?: unknown;
    timedOut?: unknown;
    rankedWithin?: unknown;
  };
  if (!Array.isArray(reading.terms) || typeof reading.asPhrase !== 'boolean') return null;
  return {
    terms: reading.terms.filter((term): term is string => typeof term === 'string'),
    asPhrase: reading.asPhrase,
    cutShort: Array.isArray(reading.cutShort)
      ? reading.cutShort.filter((term): term is string => typeof term === 'string')
      : [],
    timedOut: reading.timedOut === true,
    rankedWithin:
      typeof reading.rankedWithin === 'number' && reading.rankedWithin > 0
        ? reading.rankedWithin
        : null,
  };
};

const SEARCH_MATCH_FIELDS: readonly SearchMatch['field'][] = [
  'reference',
  'subject',
  'people',
  'body',
  'note',
];

/** Absent (an older backend), null (no search) and anything malformed all read as null. */
export const normalizeSearchMatch = (raw: unknown): SearchMatch | null => {
  if (!raw || typeof raw !== 'object') return null;
  const match = raw as { field?: unknown; snippet?: unknown };
  if (!SEARCH_MATCH_FIELDS.includes(match.field as SearchMatch['field'])) return null;
  const field = match.field as SearchMatch['field'];
  return typeof match.snippet === 'string' && match.snippet.trim() !== ''
    ? { field, snippet: match.snippet }
    : { field };
};

/** One list answer as every caller reads it — normalised, and refused when it did not finish. */
export const readThreadsBody = (
  response: RawThreadsBody,
  allowTimedOut: boolean
): ThreadsResponse => {
  // Normalised HERE, so no caller can read the raw shape (CLAUDE.md: version skew).
  const rows: unknown = response.data;
  const search = normalizeSearchReading(response.search);
  const unfinished =
    response.timedOut === true ||
    search?.timedOut === true ||
    response.pagination?.countTimedOut === true;
  if (unfinished && !allowTimedOut) throw new ListTimedOutError();
  return {
    ...response,
    ...(Array.isArray(rows)
      ? {
          data: rows.map((row: MessageThread & { searchMatch?: unknown }) => ({
            ...row,
            searchMatch: normalizeSearchMatch(row.searchMatch),
          })) as unknown as ThreadsResponse['data'],
        }
      : {}),
    search,
  };
};
