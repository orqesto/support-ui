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
  type SettingsLine,
} from '@/services/notificationSettingsService';

/** The signed-in user's effective notification lines, with save/reset. */
export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Send order, per line. A reply is a snapshot of every line, but the call only vouches for the
  // lines it saved: those are applied unless a newer call on the same line already was. The other
  // lines in the snapshot are applied only when this is the newest reply and no other call on them
  // is still in flight (toggle A, toggle B: B's reply carries A's OLD value and must not undo the
  // toggle, nor may A's later reply be thrown away because B's came first). A failed newer call
  // does not block an older reply (toggle A, toggle B, B fails: A's saved value shows).
  const callCounter = useRef(0);
  const lastApplied = useRef(0);
  const lineApplied = useRef<Record<string, number>>({});
  const inFlight = useRef<Record<string, number>>({});
  // Mirror of `settings` so a reply is merged outside a state updater (updaters may run twice).
  const shown = useRef<NotificationSettings | null>(null);
  const show = useCallback((next: NotificationSettings | null) => {
    shown.current = next;
    setSettings(next);
  }, []);
  const apply = useCallback(
    (call: number, next: NotificationSettings, saved: string[] | null) => {
      const newest = call > lastApplied.current;
      if (newest) lastApplied.current = call;
      const prev = shown.current;
      if (!prev) {
        if (newest) show(next);
        return;
      }
      const current = new Map(prev.lines.map((line) => [line.key, line]));
      const taken = new Map<string, SettingsLine>();
      for (const line of next.lines) {
        const own = saved === null || saved.includes(line.key);
        const adopt = own
          ? call > (lineApplied.current[line.key] ?? 0)
          : newest && !(inFlight.current[line.key] > 0);
        if (!adopt) continue;
        if (own) lineApplied.current[line.key] = call;
        taken.set(line.key, line);
      }
      // The newest reply also brings lines and fields this one has not seen; an older one only
      // replaces lines it owns.
      const base = newest ? next : prev;
      show({
        ...base,
        lines: base.lines.map((line) => taken.get(line.key) ?? current.get(line.key) ?? line),
      });
    },
    [show]
  );

  // Same workspace key as useSLANotifications: lines are per workspace, so a switch re-fetches.
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  // A save that answers after a workspace switch belongs to the old workspace: its reply must not
  // be shown as the new one's lines.
  const orgRef = useRef(orgKey);
  orgRef.current = orgKey;

  useEffect(() => {
    show(null);
    lastApplied.current = 0;
    lineApplied.current = {};
    inFlight.current = {};
    setError(null);
    setLoading(true);
    let cancelled = false;
    fetchNotificationSettings()
      .then((next) => !cancelled && show(next))
      .catch(
        (err: unknown) =>
          !cancelled && setError(err instanceof Error ? err.message : 'Could not load settings')
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orgKey, show]);

  const save = useCallback(
    async (lines: Record<string, unknown>) => {
      const call = ++callCounter.current;
      const keys = Object.keys(lines);
      const startOrg = orgRef.current;
      keys.forEach((key) => (inFlight.current[key] = (inFlight.current[key] ?? 0) + 1));
      const settle = () =>
        keys.forEach(
          (key) => (inFlight.current[key] = Math.max(0, (inFlight.current[key] ?? 1) - 1))
        );
      try {
        const result = await saveNotificationSettings(lines);
        settle();
        // The bell reads the same lines through a shared fetch held for a minute: drop it so its live
        // filter sees this change now (allowed keys are saved even when another one was locked).
        invalidateSharedFetch(notificationPrefsFetchKey(startOrg));
        if (orgRef.current !== startOrg) return result;
        announceNotificationSettingsChanged();
        if ('lockedKeys' in result) {
          // Allowed keys were still saved: show what the server holds now.
          const fresh = await fetchNotificationSettings();
          if (orgRef.current === startOrg) apply(call, fresh, keys);
        } else {
          apply(call, result, keys);
        }
        return result;
      } catch (err) {
        settle();
        throw err;
      }
    },
    [apply]
  );

  const reset = useCallback(
    async (keys?: string[]) => {
      const call = ++callCounter.current;
      const startOrg = orgRef.current;
      const next = await resetNotificationSettings(keys);
      invalidateSharedFetch(notificationPrefsFetchKey(startOrg));
      if (orgRef.current !== startOrg) return next;
      announceNotificationSettingsChanged();
      apply(call, next, keys ?? null);
      return next;
    },
    [apply]
  );

  return { settings, save, reset, loading, error };
};
