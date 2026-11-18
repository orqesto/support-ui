import { useEffect, useRef, useState } from 'react';

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
};

/**
 * Console fields seeded from the saved values (AgentNoteFactsFields, NoReplyCheckFields). When a
 * field's saved value or version changes (the refetch after a save), it is re-seeded only if the
 * operator has not edited it — an edit typed while another field saved survives. `isSame` is THE
 * "unchanged" rule: the re-seed and the Save button both use it.
 */
export const useReseededTexts = <K extends string>(
  saved: Record<K, string>,
  { trimmed = [], numeric = [], versions = {} }: Options<K> = {}
) => {
  const [texts, setTexts] = useState(saved);
  const seededRef = useRef({ values: saved, versions });
  // Fields reset by the operator: the text they held at Reset. A reset is applied only once ITS OWN
  // save succeeded: a refetch of the field that lands while the save is in flight (another admin's
  // save, or this save's own refetch, which the mutation awaits) only marks it `landed`; the save's
  // success then applies it at once (landed) or arms it for the field's next refetch. A failed save
  // drops it, so the edit is never replaced by a reset that did not happen.
  const pendingReset = useRef(new Map<K, { from: string; armed: boolean; landed: boolean }>());
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
        pendingReset.current.delete(key);
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
    seededRef.current = { values: saved, versions };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is the saved values
  }, [savedKey]);

  /**
   * Reset `key` with `save` (the save of its default). Once that save succeeds the field shows the
   * saved value — only while it still holds what it held at Reset (newer typing is kept); a failed
   * save changes nothing. The returned promise never rejects (the mutation reports the failure).
   */
  const trackReset = (key: K, save: Promise<unknown>): Promise<void> => {
    const entry = { from: texts[key], armed: false, landed: false };
    pendingReset.current.set(key, entry);
    return save.then(
      () => {
        // A newer Reset of the same field replaced this one: it decides.
        if (pendingReset.current.get(key) !== entry) return;
        if (!entry.landed) {
          entry.armed = true;
          return;
        }
        // The field's refetch already landed (the mutation awaits it): apply it now.
        pendingReset.current.delete(key);
        const latest = seededRef.current.values[key];
        setTexts((current) =>
          current[key] === entry.from ? { ...current, [key]: latest } : current
        );
      },
      () => {
        if (pendingReset.current.get(key) === entry) pendingReset.current.delete(key);
      }
    );
  };
  return { texts, setTexts, isSame, trackReset };
};
