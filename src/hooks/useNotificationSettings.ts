import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings()
      .then((next) => !cancelled && setSettings(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (lines: Record<string, unknown>) => {
    const result = await saveNotificationSettings(lines);
    if ('lockedKeys' in result) {
      // Allowed keys were still saved: show what the server holds now.
      setSettings(await fetchNotificationSettings());
    } else {
      setSettings(result);
    }
    return result;
  }, []);

  const reset = useCallback(async (keys?: string[]) => {
    const next = await resetNotificationSettings(keys);
    setSettings(next);
    return next;
  }, []);

  return { settings, save, reset, loading, error };
};
