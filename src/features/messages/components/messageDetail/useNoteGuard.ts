import { useCallback, type MutableRefObject } from 'react';
import { toast } from '@/lib/toast';
import type { RecipientDraft } from '../RecipientFields';
import { holdsUnsentNote, NOTE_IN_PROGRESS } from './detailConstants';
import type { Setter } from './types';

/** The guards that keep an unsent internal note from turning into a reply. */

export function useNoteGuard({
  setComposerMode,
  latestComposer,
  lastEditMode,
  setRecipientDraft,
}: {
  setComposerMode: Setter<'reply' | 'note'>;
  latestComposer: MutableRefObject<string>;
  lastEditMode: MutableRefObject<'reply' | 'note' | null>;
  setRecipientDraft: Setter<RecipientDraft>;
}) {
  /*
    ⛔ The panel tabs' mode switch (phone rail / slide-over: any non-Notes tab, Thread, closing a
    tab) never flips an unsent internal note to Reply — the composer holds ONE text, and the flip
    put the note one Send from the customer (and made "Add to my reply" append to it). A blank
    composer still flips. Stable identity, like the setter it wraps; reads the ref, not the state.
  */
  const setPanelComposerMode = useCallback((next: React.SetStateAction<'reply' | 'note'>) => {
    setComposerMode((prev) => {
      const mode = typeof next === 'function' ? next(prev) : next;
      return holdsUnsentNote(latestComposer.current, lastEditMode.current) && mode === 'reply'
        ? prev
        : mode;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, []);
  /*
    "Reply to this message" and R: refused (toast, nothing switched, recipients untouched) while an
    internal note is being written. True when refused.
  */
  const refuseReplyOverNote = useCallback((): boolean => {
    if (!holdsUnsentNote(latestComposer.current, lastEditMode.current)) return false;
    toast.info(NOTE_IN_PROGRESS);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, []);

  const handleReplyToMessage = useCallback(
    (addresses: string[]) => {
      if (refuseReplyOverNote()) return;
      setComposerMode('reply');
      setRecipientDraft((draft) => ({ ...draft, to: addresses.join(', ') }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
    [refuseReplyOverNote]
  );
  return {
    setPanelComposerMode,
    refuseReplyOverNote,
    handleReplyToMessage,
  };
}
