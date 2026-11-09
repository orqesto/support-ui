import { useCallback, useMemo, useRef } from 'react';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import { isBlankRichText } from '@/lib/stripHtml';
import { RestoredDraftNotice } from '@/components/shared/RestoredDraftNotice';

type TicketText = { title: string; description: string };

/*
  New ticket: what the agent wrote survives a page change or a closed tab (this browser only,
  useUnsentDraft). Only once they edited something: the thread's prefill alone is not theirs.
  `kept` holds a restored title/description so it wins over that prefill when the thread loads
  after it.
*/
export function useCreateTicketUnsentDraft<T extends TicketText>({
  messageId,
  formData,
  setFormData,
  touched,
  setTouched,
  created,
}: {
  messageId: string | null;
  formData: T;
  setFormData: (update: (prev: T) => T) => void;
  touched: boolean;
  setTouched: (touched: boolean) => void;
  created: boolean;
}) {
  const kept = useRef<TicketText | null>(null);
  const value = useMemo(
    () => ({ title: formData.title, description: formData.description }),
    [formData.title, formData.description]
  );
  const restore = useCallback(
    (data: { title?: unknown; description?: unknown }) => {
      const title = typeof data?.title === 'string' ? data.title : '';
      const description = typeof data?.description === 'string' ? data.description : '';
      kept.current = { title, description };
      setTouched(true);
      setFormData((prev) => ({ ...prev, title, description }));
    },
    [setFormData, setTouched]
  );
  const draft = useUnsentDraft({
    scope: `create-ticket:${messageId ?? 'new'}`,
    value,
    isBlank:
      !touched || created || (!formData.title.trim() && isBlankRichText(formData.description)),
    restore,
  });
  const discard = () => {
    draft.clearDraft();
    kept.current = null;
    setFormData((prev) => ({ ...prev, title: '', description: '' }));
  };
  /** The thread's prefill, unless the agent's own restored words are there to win over it. */
  const overPrefill = (title: string, description: string): TicketText => ({
    title: kept.current?.title ? kept.current.title : title,
    description:
      kept.current && !isBlankRichText(kept.current.description)
        ? kept.current.description
        : description,
  });
  const notice = draft.restored ? (
    <RestoredDraftNotice label="Restored your unsent ticket" onDiscard={discard} />
  ) : null;
  return { notice, overPrefill, clearDraft: draft.clearDraft };
}
