import { useEffect, useRef, useState } from 'react';

/**
 * How long a reset whose save succeeded waits for its field's refetch. When it never comes (its GET
 * failed), the reset happened on the server but the field still shows the pre-Reset text: on expiry
 * the values are fetched again (`refetch`); if the field still has not landed, it is marked
 * `unknown` (the card says reload; its Save is blocked), never left showing wording that is not live.
 */
export const ARMED_RESET_MS = 60_000;

type Options<K extends string> = {
  /** Fields saved trimmed (a wording): a whitespace-only difference is no edit. */
  trimmed?: readonly K[];
  /** Number fields: the same number typed differently ("0300") is no edit. */
  numeric?: readonly K[];
  /**
   * Per-field version beside the value (its source): a reset whose default equals the stored value
   * changes no value, but its source changes — the field still counts as re-saved (review of #980).
   */
  versions?: Partial<Record<K, string>>;
  /** Fetch the saved values again (a reset whose own refetch never came). */
  refetch?: () => Promise<unknown>;
};

type PendingReset = {
  from: string;
  armed: boolean;
  landed: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

/**
 * Console fields seeded from the saved values (AgentNoteFactsFields, NoReplyCheckFields). When a
 * field's saved value or version changes (the refetch after a save), it is re-seeded only if the
 * operator has not edited it — an edit typed while another field saved survives. `isSame` is THE
 * "unchanged" rule: the re-seed and the Save button both use it.
 */
export const useReseededTexts = <K extends string>(
  saved: Record<K, string>,
  { trimmed = [], numeric = [], versions = {}, refetch }: Options<K> = {}
) => {
  const [texts, setTexts] = useState(saved);
  const [unknown, setUnknown] = useState<ReadonlySet<K>>(() => new Set<K>());
  const seededRef = useRef({ values: saved, versions });
  // Fields reset by the operator: the text they held at Reset. A reset is applied only once ITS OWN
  // save succeeded: a refetch of the field that lands while the save is in flight (another admin's
  // save, or this save's own refetch, which the mutation awaits) only marks it `landed`; the save's
  // success then applies it at once (landed) or arms it for the field's next refetch. A failed save
  // drops it, so the edit is never replaced by a reset that did not happen.
  const pendingReset = useRef(new Map<K, PendingReset>());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const pending = pendingReset.current;
    return () => {
      mountedRef.current = false;
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    };
  }, []);
  /** Drop a pending reset and its timer (used, replaced, failed). */
  const dropReset = (key: K, entry: PendingReset) => {
    clearTimeout(entry.timer);
    if (pendingReset.current.get(key) === entry) pendingReset.current.delete(key);
  };
  const keys = Object.keys(saved) as K[];
  const savedKey = keys.map((key) => `${saved[key]}\u0001${versions[key] ?? ''}`).join('\u0002');

  const isSame = (key: K, left: string, right: string): boolean => {
    if (numeric.includes(key) && left.trim() !== '' && right.trim() !== '')
      return Number(left) === Number(right);
    return trimmed.includes(key) ? left.trim() === right.trim() : left === right;
  };

  useEffect(() => {
    const seeded = seededRef.current;
    const changed = keys.filter(
      (key) =>
        saved[key] !== seeded.values[key] || (versions[key] ?? '') !== (seeded.versions[key] ?? '')
    );
    // Mount, or a refetch that changed nothing: no state update.
    if (changed.length === 0) return;
    // The armed resets of the changed fields (a copy: the updater may run after this effect
    // returns); a reset whose save is still in flight only learns that its field landed.
    const resets = new Map<K, string>();
    for (const key of changed) {
      const entry = pendingReset.current.get(key);
      if (!entry) continue;
      if (entry.armed) {
        resets.set(key, entry.from);
        dropReset(key, entry);
      } else {
        entry.landed = true;
      }
    }
    setTexts((current) => {
      const merged = { ...current };
      for (const key of changed) {
        const resetFrom = resets.get(key);
        const untouched =
          resetFrom !== undefined
            ? current[key] === resetFrom
            : isSame(key, current[key], seeded.values[key]);
        if (untouched) merged[key] = saved[key];
      }
      return merged;
    });
    // A field whose saved value arrived is known again.
    setUnknown((current) =>
      changed.some((key) => current.has(key))
        ? new Set([...current].filter((key) => !changed.includes(key)))
        : current
    );
    seededRef.current = { values: saved, versions };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is the saved values
  }, [savedKey]);

  /** The reset's own refetch never came: fetch again; still nothing ⇒ the field is unknown. */
  const expire = (key: K, entry: PendingReset) => {
    entry.timer = undefined;
    const markUnknownIfStillPending = () => {
      // The refetch's re-render runs the effect first; a field that landed has used its reset.
      if (!mountedRef.current || pendingReset.current.get(key) !== entry) return;
      setUnknown((current) => (current.has(key) ? current : new Set([...current, key])));
    };
    if (!refetch) {
      markUnknownIfStillPending();
      return;
    }
    refetch().then(() => {
      // Let the refetch's render (and the effect) run before deciding.
      if (!mountedRef.current) return;
      entry.timer = setTimeout(markUnknownIfStillPending, 0);
    }, markUnknownIfStillPending);
  };

  /**
   * Reset `key` with `save` (the save of its default). Once that save succeeds the field shows the
   * saved value — only while it still holds what it held at Reset (newer typing is kept); a failed
   * save changes nothing. The returned promise never rejects (the mutation reports the failure).
   */
  const trackReset = (key: K, save: Promise<unknown>): Promise<void> => {
    const previous = pendingReset.current.get(key);
    if (previous) dropReset(key, previous);
    const entry: PendingReset = { from: texts[key], armed: false, landed: false, timer: undefined };
    pendingReset.current.set(key, entry);
    return save.then(
      () => {
        // A newer Reset of the same field replaced this one: it decides.
        if (pendingReset.current.get(key) !== entry || !mountedRef.current) return;
        if (!entry.landed) {
          entry.armed = true;
          entry.timer = setTimeout(() => expire(key, entry), ARMED_RESET_MS);
          return;
        }
        // The field's refetch already landed (the mutation awaits it): apply it now.
        dropReset(key, entry);
        const latest = seededRef.current.values[key];
        setTexts((current) =>
          current[key] === entry.from ? { ...current, [key]: latest } : current
        );
      },
      () => dropReset(key, entry)
    );
  };
  return { texts, setTexts, isSame, trackReset, unknown };
};
