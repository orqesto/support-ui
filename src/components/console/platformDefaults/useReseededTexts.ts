import { useEffect, useRef, useState } from 'react';

/**
 * Console number/text fields seeded from the saved values (AgentNoteFactsFields, NoReplyCheckFields).
 * When the saved values change (the query refetches after a save), ONLY the fields the operator has
 * not edited are re-seeded: an edit typed while another field was saving survives the refetch.
 * `trimmed`: fields saved trimmed (a wording), where a whitespace-only difference is no edit — a
 * number field compares exactly, so ' 4' stays the operator's.
 */
export const useReseededTexts = <K extends string>(
  saved: Record<K, string>,
  { trimmed = [] }: { trimmed?: readonly K[] } = {}
) => {
  const [texts, setTexts] = useState(saved);
  const seededRef = useRef(saved);
  // Fields whose reset SAVED but whose refetch has not landed: the next seed replaces them, if the
  // operator has not typed since (the text they held when Reset was clicked).
  const pendingReset = useRef(new Map<K, string>());
  const savedKey = Object.values<string>(saved).join('|');
  const same = (key: K, left: string, right: string) =>
    trimmed.includes(key) ? left.trim() === right.trim() : left === right;

  useEffect(() => {
    const seeded = seededRef.current;
    // Mount, or a refetch that changed nothing: no state update.
    if (Object.values<string>(seeded).join('|') === savedKey) return;
    const resets = pendingReset.current;
    setTexts((current) => {
      const merged = { ...current };
      for (const key of Object.keys(saved) as K[]) {
        const resetFrom = resets.get(key);
        const untouched =
          resetFrom !== undefined
            ? current[key] === resetFrom
            : same(key, current[key], seeded[key]);
        if (untouched) merged[key] = saved[key];
      }
      return merged;
    });
    resets.clear();
    seededRef.current = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is the saved values
  }, [savedKey]);

  /**
   * Reset `key` through `save` (which calls back only once the save SUCCEEDED). The field then shows
   * the reset value — whichever lands first, the refetch or the callback — and only while it still
   * holds what it held when Reset was clicked: newer typing is kept, a failed save keeps everything.
   */
  const reset = (key: K, save: (onSaved: () => void) => void) => {
    const typedAtReset = texts[key];
    const seedAtReset = seededRef.current[key];
    save(() => {
      const seed = seededRef.current[key];
      if (seed !== seedAtReset) {
        // The refetch already landed: show its value now.
        setTexts((current) =>
          current[key] === typedAtReset ? { ...current, [key]: seed } : current
        );
      } else {
        pendingReset.current.set(key, typedAtReset);
      }
    });
  };
  return { texts, setTexts, reset };
};
