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
  // Fields reset by the operator: the text they held at Reset. Applied when THAT field's refetch
  // lands (its value or version changes) — never by an unrelated refetch, never after a failed save.
  const pendingReset = useRef(new Map<K, string>());
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
    // A copy: the updater may run after this effect returns.
    const resets = new Map(pendingReset.current);
    for (const key of changed) pendingReset.current.delete(key);
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
   * Reset `key`: call before saving it. Its refetch shows the reset value — only while the field
   * still holds what it held now (newer typing is kept); a failed save changes nothing.
   */
  const markReset = (key: K) => pendingReset.current.set(key, texts[key]);
  /** The reset's save failed: forget it — the field keeps its edit under the normal rule. */
  const cancelReset = (key: K) => pendingReset.current.delete(key);
  return { texts, setTexts, isSame, markReset, cancelReset };
};
