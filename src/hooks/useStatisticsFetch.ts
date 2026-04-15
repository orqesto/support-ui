import { useState, useEffect, useCallback } from 'react';

type FetchFn<T> = (days: number) => Promise<{ success: boolean; data?: T }>;

type UseStatisticsFetchResult<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * Generic hook for statistics tabs.
 * Fetches on mount and whenever `active` or `days` changes.
 * Exposes a `refresh()` function that re-fetches with the refreshing flag set.
 */
export function useStatisticsFetch<T>(
  fetchFn: FetchFn<T>,
  days: number,
  active: boolean
): UseStatisticsFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const response = await fetchFn(days);
        if (response.success && response.data !== undefined) {
          setData(response.data);
        }
      } catch {
        // empty state handled by caller
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, fetchFn]
  );

  useEffect(() => {
    if (active) void run(false);
  }, [active, run]);

  const refresh = useCallback(() => void run(true), [run]);

  return { data, loading, refreshing, refresh };
}
