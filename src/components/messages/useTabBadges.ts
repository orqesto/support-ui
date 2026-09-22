import { useCallback, useState } from 'react';
import { useCustomApiLookupAvailability } from '@/hooks/useCustomApiLookup';

type Tagged = { id: number; count: number } | null;

/**
 * Badges for the KB and Customer tabs of one message.
 *
 * KB = suggested options + knowledge-base references, the two lists the tab renders. Each count is
 * tagged with the message it was loaded for, so the badge never carries the previous thread's
 * number while this one loads (the panel is reused across threads, and a late response for an
 * old thread must not land on the new one).
 *
 * Customer = a DOT, not a number (owner, 2026-09-22): the lookup availability answer is per
 * workspace and user, not per thread, so a count would read the same on every thread. It is the
 * same fail-closed query the lookup panel renders on — loading, `false`, 404 and errors show none.
 * The caller also requires an email identity: without one the panel says lookups cannot run, and
 * a dot saying they are available would contradict it.
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
  const customerDot = useCustomApiLookupAvailability('thread');
  return { kbBadge, kbSuggested, customerDot, handleOptionsLoaded, onReferenced };
}
