import type { Dispatch, SetStateAction } from 'react';
import { type BulkAction } from '@/lib/bulkActions';
import { getConvUrlId } from '@/lib/messageHelpers';
import { toast } from '@/lib/toast';
import type { useMessagesData } from '../../hooks/useMessagesData';
import { BulkConfirmDialog, type BulkConfirmValues } from '../bulk/BulkConfirmDialog';
import { BulkMergeDialog } from '../bulk/BulkMergeDialog';
import type { useBulkSelection } from '../bulk/useBulkSelection';
import { useBulkWritingNote } from '../../presence/bulkWriting';

type Data = ReturnType<typeof useMessagesData>;

/**
 * The bulk confirm and merge dialogs (moved from MessagesPage). The confirm also says how many of
 * the selected threads have a colleague writing a reply (thread presence, spec §5.5).
 */
export const BulkDialogs = ({
  bulkAction,
  setBulkAction,
  bulkSelection,
  bulkRunning,
  runBulkAction,
  bulkMergeOpen,
  setBulkMergeOpen,
  orgCode,
  bumpKanban,
  fetchMessages,
  messagesPagination,
}: {
  bulkAction: BulkAction | null;
  setBulkAction: Dispatch<SetStateAction<BulkAction | null>>;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  bulkRunning: boolean;
  runBulkAction: (values: BulkConfirmValues) => Promise<void>;
  bulkMergeOpen: boolean;
  setBulkMergeOpen: Dispatch<SetStateAction<boolean>>;
  orgCode: string | null | undefined;
  bumpKanban: () => void;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
}) => {
  const writingNote = useBulkWritingNote(bulkAction, bulkSelection.selectedIds);
  return (
    <>
      <BulkConfirmDialog
        open={bulkAction !== null}
        action={bulkAction}
        preview={bulkAction ? (bulkSelection.previews[bulkAction] ?? null) : null}
        selectedCount={bulkSelection.selectedIds.length}
        running={bulkRunning}
        writingNote={writingNote}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
        onConfirm={(values) => void runBulkAction(values)}
      />

      <BulkMergeDialog
        open={bulkMergeOpen}
        selectedIds={bulkSelection.selectedIds}
        onOpenChange={setBulkMergeOpen}
        onMerged={(survivor) => {
          setBulkMergeOpen(false);
          bulkSelection.clear();
          toast.success(`Merged into ${getConvUrlId(survivor, orgCode)}`);
          bumpKanban();
          void fetchMessages(messagesPagination.page, true);
        }}
      />
    </>
  );
};
