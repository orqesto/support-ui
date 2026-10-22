import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { recentSearchService, type RecentSearch } from '@/services/recentSearch.service';
import { useAuthStore } from '@/stores/authStore';

/** Mirrors the backend bound, so the list does not grow past it between reloads. */
const MAX_SHOWN = 8;
/** Mirrors the backend's input bound: longer is refused, so it is not offered as remembered. */
const MAX_QUERY_LENGTH = 200;

/** Same rule as the backend: `John  Smith` and `john smith` are one search. */
const keyOf = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The signed-in user's recent searches in the current workspace.
 *
 * Updated in place (optimistically) so the list reflects a search the moment it settles; the
 * server is the record. A backend without the route (this frontend deploys before the backend
 * tag ships) answers 404: the list stays empty and nothing more is sent — no error to show.
 */
export const useRecentSearches = () => {
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  /**
   * Entries removed (or cleared) while their save was still on its way. The row has no server id
   * yet, so there is nothing to DELETE — the save lands afterwards and would bring it back on the
   * next load. When such a save resolves, it is deleted at once.
   */
  const removedWhilePendingRef = useRef(new Set<string>());
  const clearGenerationRef = useRef(0);

  const onFailure = useCallback((what: string, error: unknown) => {
    if (getErrorStatus(error) === 404) {
      setUnsupported(true);
      setRecent([]);
      return;
    }
    logger.error(`Recent searches: ${what} failed`, error);
  }, []);

  // Per workspace: switching workspace switches history.
  useEffect(() => {
    let cancelled = false;
    setRecent([]);
    recentSearchService
      .list()
      .then((rows) => {
        if (!cancelled) setRecent(rows.slice(0, MAX_SHOWN));
      })
      .catch((error) => {
        if (!cancelled) onFailure('load', error);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrganizationId, onFailure]);

  const record = useCallback(
    (query: string) => {
      const text = query.trim().replace(/\s+/g, ' ');
      if (!text || unsupported || text.length > MAX_QUERY_LENGTH) return;
      removedWhilePendingRef.current.delete(keyOf(text));
      const generation = clearGenerationRef.current;
      setRecent((rows) => {
        const rest = rows.filter((row) => keyOf(row.query) !== keyOf(text));
        const existing = rows.find((row) => keyOf(row.query) === keyOf(text));
        const top: RecentSearch = {
          id: existing?.id ?? -Date.now(),
          query: text,
          lastUsedAt: new Date().toISOString(),
        };
        return [top, ...rest].slice(0, MAX_SHOWN);
      });
      recentSearchService
        .record(text)
        .then((saved) => {
          const key = keyOf(saved.query);
          if (
            removedWhilePendingRef.current.has(key) ||
            generation !== clearGenerationRef.current
          ) {
            removedWhilePendingRef.current.delete(key);
            recentSearchService.remove(saved.id).catch((error) => onFailure('remove', error));
            return;
          }
          // Swap the placeholder id for the real one, so Remove works on it.
          setRecent((rows) =>
            rows.map((row) => (keyOf(row.query) === keyOf(saved.query) ? saved : row))
          );
        })
        .catch((error) => onFailure('save', error));
    },
    [unsupported, onFailure]
  );

  const remove = useCallback(
    (entry: RecentSearch) => {
      setRecent((rows) => rows.filter((row) => row.id !== entry.id));
      if (entry.id > 0) {
        recentSearchService.remove(entry.id).catch((error) => onFailure('remove', error));
      } else {
        removedWhilePendingRef.current.add(keyOf(entry.query));
      }
    },
    [onFailure]
  );

  const clear = useCallback(() => {
    // Saves still on their way were made before the clear: delete them as they land.
    clearGenerationRef.current += 1;
    setRecent([]);
    recentSearchService.clear().catch((error) => onFailure('clear', error));
  }, [onFailure]);

  return { recent, record, remove, clear };
};
