import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  pruneUnsentDraftsOnce,
  readUnsentDraft,
  removeUnsentDraft,
  unsentDraftKey,
  writeUnsentDraft,
} from '@/lib/unsentDrafts';

const SAVE_DELAY_MS = 500;

type Pending<T> = { key: string; data: T; blank: boolean };

/**
 * Keeps an editor's unsent text in this browser and hands it back when the same place opens again.
 *
 * - `scope` names the place ("thread:42:reply", "ticket:7:comment"); null turns it off.
 * - `value` is everything worth restoring (text plus what it needs, e.g. reply vs note);
 *   `isBlank` says there is nothing to keep — the stored copy is then removed, which is how a
 *   successful send (it empties the editor) clears it with no extra call.
 * - `restore` is called once per opened place with the stored value.
 *
 * Saved 0.5 s after the last change, and at once when the tab is hidden or closed and when the
 * component unmounts or switches place: a phone browser may kill a background tab without warning.
 */
export function useUnsentDraft<T>({
  scope,
  value,
  isBlank,
  restore,
}: {
  scope: string | null;
  value: T;
  isBlank: boolean;
  restore: (data: T) => void;
}): { restored: boolean; dismissRestored: () => void; clearDraft: () => void } {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const workspaceId = useAuthStore((state) => state.selectedOrganizationId);
  const key = useMemo(
    () => (scope ? unsentDraftKey(userId, workspaceId, scope) : null),
    [scope, userId, workspaceId]
  );
  const [restored, setRestored] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const pendingRef = useRef<Pending<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKeyRef = useRef<string | null | undefined>(undefined);
  // The render that loads a place still carries the previous place's (or the initial blank) value.
  const skipNextWriteRef = useRef(false);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    if (pending.blank) removeUnsentDraft(pending.key);
    else writeUnsentDraft(pending.key, pending.data);
  }, []);

  // Declared before the write effect: on a place change it must load before anything is written.
  useEffect(() => {
    flush();
    pruneUnsentDraftsOnce();
    loadedKeyRef.current = key;
    skipNextWriteRef.current = true;
    setRestored(false);
    if (!key) return;
    const stored = readUnsentDraft<T>(key);
    if (stored !== null) {
      restoreRef.current(stored);
      setRestored(true);
    }
  }, [key, flush]);

  useEffect(() => {
    if (!key || loadedKeyRef.current !== key) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    if (isBlank) setRestored(false);
    pendingRef.current = { key, data: value, blank: isBlank };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [key, value, isBlank, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const dismissRestored = useCallback(() => setRestored(false), []);
  /*
    Sent or discarded while the text may still be on screen (a dialog closing on success): drop the
    stored copy and whatever was waiting to be written, now.
  */
  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    if (loadedKeyRef.current) removeUnsentDraft(loadedKeyRef.current);
    setRestored(false);
  }, []);
  return { restored, dismissRestored, clearDraft };
}
