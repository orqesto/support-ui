import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { getKbQuestions } from '@/services/kbEngine.service';
import type { KbQuestion } from '@/services/kbEngine.types';

export type UseKbQuestionsArgs = { departmentId?: number; search?: string };

export type UseKbQuestions = {
  /** The queue in the order the agent sees it: not-skipped cards, then the skipped ones. */
  items: KbQuestion[];
  /** How many of `items` lead the queue before the skipped cards start. */
  freshCount: number;
  /** Open questions on the server, less the ones decided here. */
  total: number;
  olderThan7d: number;
  loading: boolean;
  /** A next page is on its way. */
  loadingMore: boolean;
  /** Why the first page failed (the backend's words when safe to show); null when it did not. */
  error: string | null;
  hasMore: boolean;
  /** The next page failed; it is asked again only by `retryMore` (never in a loop). */
  moreFailed: boolean;
  loadMore: () => void;
  retryMore: () => void;
  reload: () => void;
  /** Put a question first (the one a link named), replacing a copy of it. */
  pin: (question: KbQuestion) => void;
  /** An undone answer: the question is open again, first in the queue, and counted again. */
  reopen: (question: KbQuestion) => void;
  /** Decided (answered here, or already decided / gone): leaves the queue. */
  remove: (suggestionId: number) => void;
  /** Skip / not sure: client-side only, the card goes behind every not-skipped card. */
  skip: (suggestionId: number) => void;
};

const PAGE_SIZE = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Open for more than 7 days (the server's `olderThan7d` rule, on `openedAt`). */
export const isOlderThan7d = (question: KbQuestion, now = Date.now()): boolean =>
  now - new Date(question.openedAt).getTime() > WEEK_MS;

/** The Questions queue: GET /questions, cursor paged, search inside questions. */
export const useKbQuestions = ({ departmentId, search }: UseKbQuestionsArgs): UseKbQuestions => {
  // Two lists so a later page lands BEFORE the skipped cards, not behind them.
  const [fresh, setFresh] = useState<KbQuestion[]>([]);
  const [skipped, setSkipped] = useState<KbQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [olderThan7d, setOlderThan7d] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failedCursor, setFailedCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every request carries the query generation; a newer query (team, search) makes it stale.
  const generation = useRef(0);
  // The cursor being asked right now: two callers in one tick must not ask for it twice.
  const asking = useRef<string | null>(null);
  const term = search?.trim() ?? '';

  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    // A page of the old query may still be in flight: its answer is ignored, paging restarts.
    setLoadingMore(false);
    asking.current = null;
    setFailedCursor(null);
    setError(null);
    setFresh([]);
    setSkipped([]);
    setNextCursor(null);
    getKbQuestions({ departmentId, search: term || undefined, limit: PAGE_SIZE })
      .then((page) => {
        if (generation.current !== mine) return;
        setFresh(page.items);
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

  const itemsRef = useRef<KbQuestion[]>([]);
  itemsRef.current = [...fresh, ...skipped];

  const fetchMore = useCallback(
    (cursor: string) => {
      if (asking.current === cursor) return;
      asking.current = cursor;
      const mine = generation.current;
      setLoadingMore(true);
      getKbQuestions({ departmentId, search: term || undefined, cursor, limit: PAGE_SIZE })
        .then((page) => {
          if (generation.current !== mine) return;
          const known = new Set(itemsRef.current.map((item) => item.suggestionId));
          setFresh((current) => [
            ...current,
            ...page.items.filter((item) => !known.has(item.suggestionId)),
          ]);
          setNextCursor(page.nextCursor);
          setOlderThan7d(page.olderThan7d);
        })
        .catch(() => {
          // Remembered, not retried: a failing backend must not be asked in a loop.
          if (generation.current === mine) setFailedCursor(cursor);
        })
        .finally(() => {
          if (asking.current === cursor) asking.current = null;
          if (generation.current === mine) setLoadingMore(false);
        });
    },
    [departmentId, term]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || loading || nextCursor === failedCursor) return;
    fetchMore(nextCursor);
  }, [nextCursor, loadingMore, loading, failedCursor, fetchMore]);

  const retryMore = useCallback(() => {
    if (!nextCursor || loadingMore || loading) return;
    setFailedCursor(null);
    fetchMore(nextCursor);
  }, [nextCursor, loadingMore, loading, fetchMore]);

  const remove = useCallback((suggestionId: number) => {
    const gone = itemsRef.current.find((item) => item.suggestionId === suggestionId);
    if (!gone) return;
    setTotal((count) => Math.max(0, count - 1));
    if (isOlderThan7d(gone)) setOlderThan7d((count) => Math.max(0, count - 1));
    setFresh((current) => current.filter((item) => item.suggestionId !== suggestionId));
    setSkipped((current) => current.filter((item) => item.suggestionId !== suggestionId));
  }, []);

  const skip = useCallback((suggestionId: number) => {
    const card = itemsRef.current.find((item) => item.suggestionId === suggestionId);
    if (!card) return;
    setFresh((current) => current.filter((item) => item.suggestionId !== suggestionId));
    setSkipped((current) => [
      ...current.filter((item) => item.suggestionId !== suggestionId),
      card,
    ]);
  }, []);

  const pin = useCallback((question: KbQuestion) => {
    const same = (item: KbQuestion) => item.suggestionId === question.suggestionId;
    setSkipped((current) => current.filter((item) => !same(item)));
    setFresh((current) => [question, ...current.filter((item) => !same(item))]);
  }, []);

  const reopen = useCallback((question: KbQuestion) => {
    setTotal((count) => count + 1);
    if (isOlderThan7d(question)) setOlderThan7d((count) => count + 1);
    setFresh((current) => [
      question,
      ...current.filter((item) => item.suggestionId !== question.suggestionId),
    ]);
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const items = useMemo(() => [...fresh, ...skipped], [fresh, skipped]);

  return {
    items,
    freshCount: fresh.length,
    total,
    olderThan7d,
    loading,
    loadingMore,
    error,
    hasMore: nextCursor !== null,
    moreFailed: nextCursor !== null && nextCursor === failedCursor,
    loadMore,
    retryMore,
    reload,
    pin,
    reopen,
    remove,
    skip,
  };
};
