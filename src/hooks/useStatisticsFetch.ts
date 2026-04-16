import { useState, useEffect, useCallback } from 'react';

type FetchFn<T> = (days: number) => Promise<{ success: boolean; data?: T }>;

type UseStatisticsFetchResult<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  error: string | null;
};

/**
 * Generic hook for statistics tabs.
 * Fetches on mount and whenever `active` or `days` changes.
 * Exposes a `refresh()` function that re-fetches with the refreshing flag set.
 */
export function useStatisticsFetch<T>(
  fetchFn: FetchFn<T>,
  days: number,
  active: boolean,
  onError?: (message: string) => void
): UseStatisticsFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const response = await fetchFn(days);
        if (response.success && response.data !== undefined) {
          setData(response.data);
        } else if (!response.success) {
          const msg = 'Failed to load stats.';
          setError(msg);
          onError?.(msg);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load stats.';
        setError(msg);
        onError?.(msg);
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

  return { data, loading, refreshing, refresh, error };
}
