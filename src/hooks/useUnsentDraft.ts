import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  draftFingerprint,
  isUnsentDraftSending,
  markUnsentDraftSending,
  markUnsentDraftSent,
  pruneUnsentDraftsOnce,
  readUnsentDraft,
  removeUnsentDraft,
  sentFingerprintOf,
  unsentDraftGeneration,
  unsentDraftKey,
  writeUnsentDraft,
} from '@/lib/unsentDrafts';

const SAVE_DELAY_MS = 500;

type Pending<T> = { key: string; data: T; blank: boolean; generation: number };

/** One send of the kept text. Settle it whether or not the editor is still open. */
export type UnsentDraftSend = { settle: (sent: boolean) => void };

const NO_SEND: UnsentDraftSend = { settle: () => undefined };

/**
 * Keeps an editor's unsent text in this browser and hands it back when the same place opens again.
 *
 * - `scope` names the place ("thread:42", "ticket:7:comment"); null turns it off.
 * - `value` is everything worth restoring (text plus what it needs, e.g. reply vs note);
 *   `isBlank` says there is nothing to keep — the stored copy is then removed.
 * - `restore` is called once per opened place with the stored value.
 * - `fingerprint` (default: the JSON) says which part of `value` IS the message; another tab whose
 *   text matches what this one sent is told through `onSentElsewhere`.
 *
 * Saved 0.5 s after the last change, and at once when the tab is hidden or closed and when the
 * component unmounts or switches place: a phone browser may kill a background tab without warning.
 *
 * ⛔ A send goes through `beginSend` and settles: the copy is held for that place until the send
 * ends — even when the editor closed meanwhile (J/K, X, a closed dialog) — then marked sent or put
 * back. Relying on a re-render with an empty editor left a sent message stored as "unsent".
 */
export function useUnsentDraft<T>({
  scope,
  value,
  isBlank,
  restore,
  fingerprint,
  onSentElsewhere,
}: {
  scope: string | null;
  value: T;
  isBlank: boolean;
  restore: (data: T) => void;
  fingerprint?: (data: T) => string;
  onSentElsewhere?: () => void;
}): {
  restored: boolean;
  dismissRestored: () => void;
  clearDraft: () => void;
  /**
   * Call when the send starts. `keep`: the text stays stored while it is out (for a send the BE
   * dedups — its key rides in `data`), so a tab killed mid-send loses nothing; otherwise it is
   * removed for the duration, so a send that went out can never come back to be sent twice.
   */
  beginSend: (options?: { keep?: boolean; data?: T }) => UnsentDraftSend;
} {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const workspaceId = useAuthStore((state) => state.selectedOrganizationId);
  const key = useMemo(
    () => (scope ? unsentDraftKey(userId, workspaceId, scope) : null),
    [scope, userId, workspaceId]
  );
  const [restored, setRestored] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const valueRef = useRef(value);
  valueRef.current = value;
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const onSentElsewhereRef = useRef(onSentElsewhere);
  onSentElsewhereRef.current = onSentElsewhere;
  const pendingRef = useRef<Pending<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKeyRef = useRef<string | null | undefined>(undefined);
  // The render that loads a place still carries the previous place's (or the initial blank) value.
  const skipNextWriteRef = useRef(false);
  // The stored copy as restored: writing it back unchanged would restart its 7-day clock.
  const restoredRawRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    // Signed out since it was queued, or its text is being sent: not ours to write any more.
    if (pending.generation !== unsentDraftGeneration()) return;
    if (isUnsentDraftSending(pending.key)) return;
    if (pending.blank) {
      restoredRawRef.current = null;
      removeUnsentDraft(pending.key);
      return;
    }
    if (restoredRawRef.current !== null && JSON.stringify(pending.data) === restoredRawRef.current)
      return;
    restoredRawRef.current = null;
    writeUnsentDraft(pending.key, pending.data);
  }, []);

  // Declared before the write effect: on a place change it must load before anything is written.
  useEffect(() => {
    flush();
    pruneUnsentDraftsOnce();
    loadedKeyRef.current = key;
    skipNextWriteRef.current = true;
    restoredRawRef.current = null;
    setRestored(false);
    if (!key || isUnsentDraftSending(key)) return;
    const stored = readUnsentDraft<T>(key);
    if (stored !== null) {
      restoredRawRef.current = JSON.stringify(stored);
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
    pendingRef.current = { key, data: value, blank: isBlank, generation: unsentDraftGeneration() };
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

  // Another tab sent this place's text: if this tab still shows the same words, say so and clear —
  // pressing Send here would deliver them twice.
  useEffect(() => {
    if (!key) return undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || isUnsentDraftSending(key)) return;
      const sent = sentFingerprintOf(event.newValue);
      if (sent === null) return;
      const print = fingerprintRef.current ?? ((data: T) => JSON.stringify(data));
      if (draftFingerprint(print(valueRef.current)) !== sent) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingRef.current = null;
      setRestored(false);
      onSentElsewhereRef.current?.();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const dismissRestored = useCallback(() => setRestored(false), []);
  /*
    Discarded while the text may still be on screen: drop the stored copy and whatever was waiting
    to be written, now.
  */
  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    restoredRawRef.current = null;
    if (loadedKeyRef.current) removeUnsentDraft(loadedKeyRef.current);
    setRestored(false);
  }, []);

  const beginSend = useCallback((options?: { keep?: boolean; data?: T }): UnsentDraftSend => {
    // Captured now: by the time the send ends the editor may be on another place or gone.
    const sendKey = loadedKeyRef.current;
    if (!sendKey) return NO_SEND;
    const data = options?.data ?? valueRef.current;
    const sendGeneration = unsentDraftGeneration();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    restoredRawRef.current = null;
    markUnsentDraftSending(sendKey, true);
    if (options?.keep) writeUnsentDraft(sendKey, data);
    else removeUnsentDraft(sendKey);
    let settled = false;
    return {
      settle: (sent: boolean) => {
        if (settled) return;
        settled = true;
        markUnsentDraftSending(sendKey, false);
        // Signed out meanwhile: the wipe stands.
        if (sendGeneration !== unsentDraftGeneration()) return;
        if (sent) {
          const print = fingerprintRef.current ?? ((sentData: T) => JSON.stringify(sentData));
          markUnsentDraftSent(sendKey, draftFingerprint(print(data)));
        } else {
          // Not sent: the words go back, with whatever the send needs to dedup a retry.
          writeUnsentDraft(sendKey, data);
        }
      },
    };
  }, []);

  return { restored, dismissRestored, clearDraft, beginSend };
}
