import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_INSTRUCTIONS } from './ComposerAiActions';
import { appendNote } from './customApiRecordNote';

/**
 * L2 P4 — the note an agent gives the AI draft, shared by the two components that touch it.
 *
 * The lookup panel adds a record's facts to it; the composer's AI panel is where it is written,
 * read and sent from. They are siblings, so the text lives in their host — and in its own hook,
 * because the one rule that matters here is not visible in either component:
 *
 * ⛔ IT IS PER THREAD. A note about one customer's order that survived into the next thread would
 * be invisible (the box is only shown when the AI panel is open) and would reach a stranger's
 * reply as fact. `ComposerAiActions` is already remounted per conversation for exactly this
 * reason — its comment calls the alternative "a cross-thread text leak".
 */
export const useAiRecordNote = (messageId: number) => {
  const [note, setNote] = useState('');
  /**
   * ⛔ The ref, not the state, is what an add reads. The outcome has to be returned synchronously
   * to the control that asked, and two adds inside one render batch would otherwise both read the
   * same state — the second silently replacing the first, and a fact the agent watched go in
   * would never appear again.
   */
  const latest = useRef('');
  /** Bumped on every successful add, so the host can bring the note box on screen. */
  const [reveal, setReveal] = useState(0);

  useEffect(() => {
    // A different thread is a different customer.
    latest.current = '';
    setNote('');
    setReveal(0);
  }, [messageId]);

  const change = useCallback((next: string) => {
    latest.current = next;
    setNote(next);
  }, []);

  const add = useCallback((fact: string): 'added' | 'duplicate' | 'full' => {
    const result = appendNote(latest.current, fact, MAX_INSTRUCTIONS);
    if (!result.added) return result.reason === 'duplicate' ? 'duplicate' : 'full';
    latest.current = result.text;
    setNote(result.text);
    setReveal((count) => count + 1);
    return 'added';
  }, []);

  return { note, change, add, reveal };
};
