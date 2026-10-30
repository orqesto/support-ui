import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { getKbQuestions } from '@/services/kbEngine.service';
import type { KbQuestion } from '@/services/kbEngine.types';

export type UseKbQuestionsArgs = { departmentId?: number; search?: string };

export type UseKbQuestions = {
  /** The queue in the order the agent sees it (skipped cards go to the end). */
  items: KbQuestion[];
  /** Open questions on the server, less the ones answered here. */
  total: number;
  olderThan7d: number;
  loading: boolean;
  /** Why the first page failed (the backend's words when safe to show); null when it did not. */
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Answered (or already decided elsewhere): leaves the queue. */
  remove: (suggestionId: number) => void;
  /** Skip / not sure: client-side only, the card goes to the end for this session. */
  skip: (suggestionId: number) => void;
};

const PAGE_SIZE = 20;

/** The Questions queue: GET /questions, cursor paged, search inside questions. */
export const useKbQuestions = ({ departmentId, search }: UseKbQuestionsArgs): UseKbQuestions => {
  const [items, setItems] = useState<KbQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [olderThan7d, setOlderThan7d] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // A newer query (team, search) makes every older response stale.
  const generation = useRef(0);
  const term = search?.trim() ?? '';

  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    getKbQuestions({ departmentId, search: term || undefined, limit: PAGE_SIZE })
      .then((page) => {
        if (generation.current !== mine) return;
        setItems(page.items);
        setTotal(page.total);
        setOlderThan7d(page.olderThan7d);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (generation.current === mine) {
          setError(getApiErrorMessage(err) ?? 'Questions could not be loaded.');
        }
      })
      .finally(() => {
        if (generation.current === mine) setLoading(false);
      });
  }, [departmentId, term, reloadKey]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || loading) return;
    const mine = generation.current;
    setLoadingMore(true);
    getKbQuestions({
      departmentId,
      search: term || undefined,
      cursor: nextCursor,
      limit: PAGE_SIZE,
    })
      .then((page) => {
        if (generation.current !== mine) return;
        setItems((current) => {
          const seen = new Set(current.map((item) => item.suggestionId));
          return [...current, ...page.items.filter((item) => !seen.has(item.suggestionId))];
        });
        setNextCursor(page.nextCursor);
        setOlderThan7d(page.olderThan7d);
      })
      // A failed next page leaves the queue as it is; the next low-queue check tries again.
      .catch(() => undefined)
      .finally(() => {
        if (generation.current === mine) setLoadingMore(false);
      });
  }, [departmentId, term, nextCursor, loadingMore, loading]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const remove = useCallback((suggestionId: number) => {
    if (!itemsRef.current.some((item) => item.suggestionId === suggestionId)) return;
    setTotal((count) => Math.max(0, count - 1));
    setItems((current) => current.filter((item) => item.suggestionId !== suggestionId));
  }, []);

  const skip = useCallback((suggestionId: number) => {
    setItems((current) => {
      const skipped = current.find((item) => item.suggestionId === suggestionId);
      if (!skipped) return current;
      return [...current.filter((item) => item.suggestionId !== suggestionId), skipped];
    });
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return {
    items,
    total,
    olderThan7d,
    loading,
    error,
    hasMore: nextCursor !== null,
    loadMore,
    reload,
    remove,
    skip,
  };
};
