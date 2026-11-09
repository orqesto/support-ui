import { useState, useEffect, useRef } from 'react';
import type { Message } from '@/types';
import {
  toGhostOption,
  type GhostOption,
  type SuggestedAnswerMeta,
} from '../messageDetailConstants';

/** The stored AI draft offered as the ghost bubble, reset when that draft changes. */

export function useGhostOption(message: Message, offerStoredDraft: boolean) {
  const [ghostOption, setGhostOption] = useState<GhostOption | null>(() =>
    offerStoredDraft
      ? toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
      : null
  );
  const [alternativeCount, setAlternativeCount] = useState(0);

  // Reset the ghost when the STORED draft changes — keyed on its content, not on the metadata
  // object: the full record replacing the row's (same thread, a new object) must not bring back
  // a ghost the agent dismissed or used in the meantime.
  const storedDraftKey = JSON.stringify(message.metadata?.suggestedAnswer ?? null);
  const storedDraftRef = useRef(message.metadata?.suggestedAnswer);
  storedDraftRef.current = message.metadata?.suggestedAnswer;
  useEffect(() => {
    setGhostOption(
      offerStoredDraft
        ? toGhostOption(storedDraftRef.current as SuggestedAnswerMeta | undefined)
        : null
    );
  }, [message.id, storedDraftKey, offerStoredDraft]);
  return {
    ghostOption,
    alternativeCount,
    setAlternativeCount,
  };
}
