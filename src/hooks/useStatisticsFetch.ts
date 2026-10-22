import { useState, useEffect, useCallback } from 'react';
import { useDepartmentContextKey } from './useDepartmentContextKey';
import { periodKey, type ReportPeriod } from '@/lib/reportPeriod';

type FetchFn<T> = (period: ReportPeriod, channel?: string) => Promise<{ success: boolean; data?: T }>;

type UseStatisticsFetchResult<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  error: string | null;
};

/**
 * Generic hook for statistics tabs.
 * Fetches on mount and whenever `active` or the period changes.
 * Exposes a `refresh()` function that re-fetches with the refreshing flag set.
 */
export function useStatisticsFetch<T>(
  fetchFn: FetchFn<T>,
  period: ReportPeriod,
  channel: string,
  active: boolean,
  onError?: (message: string) => void
): UseStatisticsFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-fetch when the dept-context checkboxes change (BE statistics endpoints
  // honour `X-Department-Context` via the axios interceptor).
  const selectedDeptKey = useDepartmentContextKey();

  const run = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const response = await fetchFn(period, channel);
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
    // selectedDeptKey is a refresh trigger: when the user toggles the dept
    // checkbox, callback identity must change so the consumer effect re-runs
    // and the axios interceptor sees the new X-Department-Context header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // periodKey: a new range object with the same days must not refetch.
    [periodKey(period), channel, fetchFn, onError, selectedDeptKey]
  );

  useEffect(() => {
    if (active) void run(false);
  }, [active, run]);

  const refresh = useCallback(() => void run(true), [run]);

  return { data, loading, refreshing, refresh, error };
}
