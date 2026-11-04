import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchNotificationSettings,
  resetNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '@/services/notificationSettingsService';

/** The signed-in user's effective notification lines, with save/reset. */
export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Send order: only the newest save/reset may write `settings`, so a slow older reply cannot undo a newer one.
  const latestCall = useRef(0);

  // Same workspace key as useSLANotifications: lines are per workspace, so a switch re-fetches.
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  useEffect(() => {
    setSettings(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    fetchNotificationSettings()
      .then((next) => !cancelled && setSettings(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orgKey]);

  const save = useCallback(async (lines: Record<string, unknown>) => {
    const call = ++latestCall.current;
    const result = await saveNotificationSettings(lines);
    if ('lockedKeys' in result) {
      // Allowed keys were still saved: show what the server holds now.
      const fresh = await fetchNotificationSettings();
      if (call === latestCall.current) setSettings(fresh);
    } else if (call === latestCall.current) {
      setSettings(result);
    }
    return result;
  }, []);

  const reset = useCallback(async (keys?: string[]) => {
    const call = ++latestCall.current;
    const next = await resetNotificationSettings(keys);
    if (call === latestCall.current) setSettings(next);
    return next;
  }, []);

  return { settings, save, reset, loading, error };
};
