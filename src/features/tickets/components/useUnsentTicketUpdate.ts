import { useCallback, useMemo, useState } from 'react';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import { isBlankRichText } from '@/lib/stripHtml';

/*
  The update being written survives a closed ticket or a page change (this browser only,
  useUnsentDraft). Moved out of TicketReplyComposer unchanged (file size); the composer calls it
  after its ticket-reset effect, so a ticket's own kept text lands on top of the reset.
  `clearText` empties the box: the draft, the undo-AI copy and the editor.
*/
export const useUnsentTicketUpdate = ({
  ticketId,
  draft,
  fileCount,
  setDraft,
  clearText,
  setNotice,
  restoredHtml,
}: {
  ticketId: number;
  draft: string;
  fileCount: number;
  setDraft: (html: string) => void;
  clearText: () => void;
  setNotice: (notice: string | null) => void;
  /** Marks the restored text so presence does not count it as the agent writing. */
  restoredHtml?: { current: string | null };
}) => {
  const [restoredFiles, setRestoredFiles] = useState(0);
  const updateDraft = useMemo(() => ({ html: draft, files: fileCount }), [draft, fileCount]);
  const restoreUpdate = useCallback(
    (data: { html?: unknown; files?: unknown }) => {
      if (typeof data?.html !== 'string') return;
      if (restoredHtml) restoredHtml.current = data.html;
      setDraft(data.html);
      setRestoredFiles(typeof data.files === 'number' ? data.files : 0);
    },
    [setDraft, restoredHtml]
  );
  const unsentUpdate = useUnsentDraft({
    scope: `ticket:${ticketId}:update`,
    value: updateDraft,
    isBlank: isBlankRichText(draft),
    restore: restoreUpdate,
    fingerprint: (data) => data.html,
    onSentElsewhere: () => {
      clearText();
      setNotice('This update was sent from another tab.');
    },
  });
  const discardUpdate = () => {
    unsentUpdate.clearDraft();
    clearText();
  };
  return { unsentUpdate, restoredFiles, discardUpdate };
};
