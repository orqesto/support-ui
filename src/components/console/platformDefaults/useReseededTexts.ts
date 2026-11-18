import { useEffect, useRef, useState } from 'react';

/**
 * Console number/text fields seeded from the saved values (AgentNoteFactsFields, NoReplyCheckFields).
 * When the saved values change (the query refetches after a save), ONLY the fields the operator has
 * not edited are re-seeded: an edit typed while another field was saving survives the refetch. A
 * whitespace-only difference is no edit (the wording is saved trimmed). `seededRef` is the latest
 * seed, for a reset that lands after the refetch.
 */
export const useReseededTexts = <K extends string>(saved: Record<K, string>) => {
  const [texts, setTexts] = useState(saved);
  const seededRef = useRef(saved);
  const savedKey = Object.values<string>(saved).join('|');
  useEffect(() => {
    const seeded = seededRef.current;
    // Mount, or a refetch that changed nothing: no state update.
    if (Object.values<string>(seeded).join('|') === savedKey) return;
    setTexts((current) => {
      const merged = { ...current };
      for (const key of Object.keys(saved) as K[]) {
        if (current[key].trim() === seeded[key].trim()) merged[key] = saved[key];
      }
      return merged;
    });
    seededRef.current = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is the saved values
  }, [savedKey]);
  /** Drop the operator's edit of one field: it shows the latest saved value again. */
  const discardEdit = (key: K) =>
    setTexts((current) => ({ ...current, [key]: seededRef.current[key] }));
  return { texts, setTexts, discardEdit };
};
