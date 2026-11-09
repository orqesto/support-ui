/**
 * Sends this tab's presence state to a set of watched threads (spec §5.1): a changed state at once
 * (≤ 1 per thread per second, the BE contract), the same state again every `heartbeatMs` so the
 * entry does not expire. Shared by usePresenceWatch (a thread view, which watches and reports) and
 * usePresenceReport (the ticket composer, which reports on threads the ticket view watches).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { presenceClient } from './presenceClient';
import type { PresenceState } from './presence.types';

/** At most one `presence:state` per thread per second (the BE contract). */
export const STATE_MIN_GAP_MS = 1_000;

export interface PresenceSender {
  /** Send the current state to `ids`; `force` re-sends an unchanged state (a heartbeat, a watch). */
  reportTo: (ids: number[], force: boolean) => void;
  /** Stop tracking these threads; returns the state last sent to each (absent = never sent). */
  forget: (ids: number[]) => Map<number, PresenceState>;
  /** Whether a state went to this thread since it was last forgotten / cleared. */
  wasSent: (id: number) => boolean;
  /** Forget everything (the server dropped this socket's states: a disconnect, an unmount). */
  clear: () => void;
}

export const usePresenceSender = ({
  state,
  available,
  heartbeatMs,
  targets,
  targetsKey,
}: {
  /** null = this tab reports nothing (a list view, a global admin, no settings yet). */
  state: PresenceState | null;
  /** The threads are watched now; nothing is sent while they are not. */
  available: boolean;
  heartbeatMs: number | undefined;
  /** The threads to report on, read at send time. */
  targets: () => number[];
  /** Changes when `targets` does, so a new thread gets the state at once. */
  targetsKey?: string;
}): PresenceSender => {
  const stateRef = useRef(state);
  stateRef.current = state;
  const availableRef = useRef(available);
  availableRef.current = available;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  /** Per thread: when this tab last queued a state for it, and which. */
  const lastSent = useRef(new Map<number, { at: number; state: PresenceState }>());
  const held = useRef(new Set<number>());
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportTo = useCallback((ids: number[], force: boolean) => {
    const current = stateRef.current;
    if (!current) return;
    const now = Date.now();
    let wait = 0;
    for (const id of ids) {
      const last = lastSent.current.get(id);
      if (!force && last?.state === current) continue;
      if (last && now - last.at < STATE_MIN_GAP_MS) {
        held.current.add(id);
        wait = Math.max(wait, STATE_MIN_GAP_MS - (now - last.at));
        continue;
      }
      lastSent.current.set(id, { at: now, state: current });
      presenceClient.setState(id, current);
    }
    if (held.current.size === 0 || heldTimer.current !== null) return;
    const flushHeld = () => {
      heldTimer.current = null;
      const due = [...held.current];
      held.current.clear();
      const live = new Set(targetsRef.current());
      reportTo(
        due.filter((id) => live.has(id)),
        false
      );
    };
    heldTimer.current = setTimeout(flushHeld, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only; reportTo calls itself
  }, []);

  const forget = useCallback((ids: number[]) => {
    const states = new Map<number, PresenceState>();
    for (const id of ids) {
      const last = lastSent.current.get(id);
      if (last) states.set(id, last.state);
      lastSent.current.delete(id);
      held.current.delete(id);
    }
    return states;
  }, []);

  const wasSent = useCallback((id: number) => lastSent.current.has(id), []);

  const clear = useCallback(() => {
    if (heldTimer.current !== null) clearTimeout(heldTimer.current);
    heldTimer.current = null;
    lastSent.current.clear();
    held.current.clear();
  }, []);

  useEffect(() => clear, [clear]);

  // A changed state (or a new thread) goes out at once (≤ 1/s per thread).
  useEffect(() => {
    if (state && availableRef.current) reportTo(targetsRef.current(), false);
  }, [state, available, targetsKey, reportTo]);

  // The heartbeat keeps this tab's entries from expiring on the server.
  const reporting = state !== null;
  useEffect(() => {
    if (!available || !reporting || !heartbeatMs) return;
    const timer = setInterval(() => reportTo(targetsRef.current(), true), heartbeatMs);
    return () => clearInterval(timer);
  }, [available, reporting, heartbeatMs, reportTo]);

  return useMemo(() => ({ reportTo, forget, wasSent, clear }), [reportTo, forget, wasSent, clear]);
};
