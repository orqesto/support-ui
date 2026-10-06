import { useState, type Dispatch, type SetStateAction } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { kbService, type KBEntry } from '@/services/kb.service';

/**
 * Unhide (D5): show a hidden entry again WITHOUT approving it — the backend restores what hiding
 * recorded. On a backend without the unhide route the entry is NOT changed; approving is the only
 * way that backend shows it again, and that also makes it an answer the AI may use, so it is
 * offered by name in a dialog — never done in Unhide's place.
 */
export const useKbUnhide = ({
  setEntries,
  reread,
  onApproveInstead,
  onFailed,
}: {
  /** The KB list's rows: the unhidden one is updated in place. */
  setEntries: Dispatch<SetStateAction<KBEntry[]>>;
  /** Called after; `approved` is the state the backend restored, or null when it did not say. */
  reread: (approved: boolean | null) => void;
  onApproveInstead: (id: number) => void;
  onFailed: (id: number, error: unknown) => void;
}) => {
  const [approveInsteadId, setApproveInsteadId] = useState<number | null>(null);

  /** Resolves true when the entry changed. Never throws. */
  const unhide = async (id: number): Promise<boolean> => {
    try {
      const result = await kbService.unhide(id);
      if (result.outcome === 'unsupported') {
        setApproveInsteadId(id);
        return false;
      }
      const { approved } = result;
      // Back to what it was before it was hidden. Unhide also ends "detached", as Approve does
      // (BE kbEntryState), so a later Hide reads "Hidden", not "detached from case".
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                hidden: false,
                ...(approved !== null ? { approved } : {}),
                consolidation:
                  entry.consolidation?.state === 'detached' ? undefined : entry.consolidation,
              }
            : entry
        )
      );
      // When the backend does not say what it restored, the page is re-read rather than guessed.
      reread(approved);
      return true;
    } catch (error) {
      onFailed(id, error);
      return false;
    }
  };

  const dialog = (
    <ConfirmDialog
      open={approveInsteadId !== null}
      onOpenChange={(open) => {
        if (!open) setApproveInsteadId(null);
      }}
      onConfirm={() => {
        if (approveInsteadId !== null) onApproveInstead(approveInsteadId);
      }}
      title="Unhide is not available on this server yet"
      description="The entry was not changed. This server can show a hidden entry again only by approving it — which also lets the AI use it in answers."
      confirmText="Approve instead"
      variant="warning"
    />
  );

  return { unhide, dialog };
};
