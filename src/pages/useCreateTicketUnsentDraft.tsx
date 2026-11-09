import { useCallback, useMemo, useRef, useState } from 'react';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import { isBlankRichText } from '@/lib/stripHtml';
import { RestoredDraftNotice } from '@/components/shared/RestoredDraftNotice';

type TicketText = { title: string; description: string };

/*
  New ticket: what the agent wrote survives a page change or a closed tab (this browser only,
  useUnsentDraft). Only once they edited something: the thread's prefill alone is not theirs.
  Once restored, the thread's prefill (it may load later) never replaces what is on screen —
  restored or edited since; Discard brings that prefill back.
*/
export function useCreateTicketUnsentDraft<T extends TicketText>({
  messageId,
  formData,
  setFormData,
  touched,
  setTouched,
  created,
  fileCount,
}: {
  messageId: string | null;
  formData: T;
  setFormData: (update: (prev: T) => T) => void;
  touched: boolean;
  setTouched: (touched: boolean) => void;
  created: boolean;
  fileCount: number;
}) {
  const restoredRef = useRef(false);
  const prefillRef = useRef<TicketText>({ title: '', description: '' });
  const [restoredFiles, setRestoredFiles] = useState(0);
  const value = useMemo(
    () => ({ title: formData.title, description: formData.description, files: fileCount }),
    [formData.title, formData.description, fileCount]
  );
  const restore = useCallback(
    (data: { title?: unknown; description?: unknown; files?: unknown }) => {
      const title = typeof data?.title === 'string' ? data.title : '';
      const description = typeof data?.description === 'string' ? data.description : '';
      restoredRef.current = true;
      setTouched(true);
      setRestoredFiles(typeof data.files === 'number' ? data.files : 0);
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
    fingerprint: (data) => `${data.title}\n${data.description}`,
  });
  /** The thread's prefill: recorded for Discard; applied only when nothing was restored. */
  const overPrefill = (prev: TicketText, title: string, description: string): TicketText => {
    prefillRef.current = { title, description };
    return restoredRef.current
      ? { title: prev.title, description: prev.description }
      : { title, description };
  };
  const discard = () => {
    draft.clearDraft();
    restoredRef.current = false;
    setTouched(false);
    setFormData((prev) => ({ ...prev, ...prefillRef.current }));
  };
  const notice = draft.restored ? (
    <RestoredDraftNotice
      label="Restored your unsent ticket"
      fileCount={restoredFiles}
      onDiscard={discard}
    />
  ) : null;
  return { notice, overPrefill, beginSend: draft.beginSend };
}
