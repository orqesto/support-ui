import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { invalidateSharedFetch } from '@/lib/sharedFetch';
import {
  announceNotificationSettingsChanged,
  notificationPrefsFetchKey,
} from '@/hooks/notificationPrefsKey';
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
  // Send order: a reply is applied only if its call is newer than the last reply applied, so a slow
  // older reply cannot undo a newer one, yet an older reply still lands when the newer call failed
  // (toggle A, toggle B, B fails: A's saved value shows).
  const callCounter = useRef(0);
  const lastApplied = useRef(0);
  const apply = useCallback((call: number, next: NotificationSettings) => {
    if (call <= lastApplied.current) return;
    lastApplied.current = call;
    setSettings(next);
  }, []);

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
    const call = ++callCounter.current;
    const result = await saveNotificationSettings(lines);
    // The bell reads the same lines through a shared fetch held for a minute: drop it so its live
    // filter sees this change now (allowed keys are saved even when another one was locked).
    invalidateSharedFetch(notificationPrefsFetchKey(orgKey));
    announceNotificationSettingsChanged();
    if ('lockedKeys' in result) {
      // Allowed keys were still saved: show what the server holds now.
      const fresh = await fetchNotificationSettings();
      apply(call, fresh);
    } else {
      apply(call, result);
    }
    return result;
  }, [apply, orgKey]);

  const reset = useCallback(async (keys?: string[]) => {
    const call = ++callCounter.current;
    const next = await resetNotificationSettings(keys);
    invalidateSharedFetch(notificationPrefsFetchKey(orgKey));
    announceNotificationSettingsChanged();
    apply(call, next);
    return next;
  }, [apply, orgKey]);

  return { settings, save, reset, loading, error };
};
