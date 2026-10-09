import { useCallback, useState } from 'react';

type Tagged = { id: number; count: number } | null;

/**
 * Badges for the KB tab of one message.
 *
 * KB = suggested options + knowledge-base references, the two lists the tab renders. Each count is
 * tagged with the message it was loaded for, so the badge never carries the previous thread's
 * number while this one loads (the panel is reused across threads, and a late response for an
 * old thread must not land on the new one).
 */
export function useTabBadges(messageId: number, onOptionsLoaded?: (total: number) => void) {
  const [suggested, setSuggested] = useState<Tagged>(null);
  const [referenced, setReferenced] = useState<Tagged>(null);
  // Handed to AiTabPanel. Memoised: inlined, it re-wrapped the parent's callback on every render
  // and defeated the stable setter it was given. `messageId` is captured by the render whose
  // effect started the fetch, so the count is tagged with the thread it was loaded for.
  const handleOptionsLoaded = useCallback(
    (total: number) => {
      setSuggested({ id: messageId, count: total });
      onOptionsLoaded?.(total);
    },
    [messageId, onOptionsLoaded]
  );
  const onReferenced = useCallback((id: number, count: number) => setReferenced({ id, count }), []);
  // null until this thread's suggestions load — the "No suggestions" note keys on a real 0.
  const kbSuggested = suggested?.id === messageId ? suggested.count : null;
  const kbBadge = (kbSuggested ?? 0) + (referenced?.id === messageId ? referenced.count : 0);
  return { kbBadge, kbSuggested, handleOptionsLoaded, onReferenced };
}
