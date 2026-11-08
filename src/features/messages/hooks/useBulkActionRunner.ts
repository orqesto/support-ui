import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { type BulkAction } from '@/lib/bulkActions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import type { BulkConfirmValues } from '../components/bulk/BulkConfirmDialog';
import { describeResult } from '../components/bulk/bulkResultMessage';
import type { useBulkSelection } from '../components/bulk/useBulkSelection';
import type { MessagesKanbanHandle } from '../components/kanbanBoard/kanbanBoardModel';
import { BULK_TARGET_COLUMN } from '../components/messagesPage/messagesPageConstants';
import { bulkService } from '../services/bulk.service';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

export const useBulkActionRunner = ({
  bulkAction,
  setBulkAction,
  setBulkRunning,
  kanbanRef,
  bulkSelection,
  bumpKanban,
  fetchMessages,
  messagesPagination,
  orgCode,
}: {
  bulkAction: BulkAction | null;
  setBulkAction: Dispatch<SetStateAction<BulkAction | null>>;
  setBulkRunning: Dispatch<SetStateAction<boolean>>;
  kanbanRef: RefObject<MessagesKanbanHandle | null>;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  bumpKanban: () => void;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
  orgCode: string | null | undefined;
}) => {
  /**
   * Run the chosen bulk action over the current selection.
   *
   * The SERVER decides eligibility again at this point — the preview the dialog showed may be
   * seconds old, and a thread can change in between. Whatever comes back is reported as it is:
   * applied, skipped with a reason, or failed.
   */
  const runBulkAction = useCallback(
    async (values: BulkConfirmValues) => {
      if (!bulkAction) return;
      setBulkRunning(true);
      // The board moves the cards NOW, not when the server answers: a bulk resolve of 60 threads
      // can take minutes on a busy database, and the cards sat in place the whole time (or for
      // good, when the request timed out). The re-read after the run confirms or corrects it.
      const movesTo = BULK_TARGET_COLUMN[bulkAction];
      if (movesTo !== undefined)
        kanbanRef.current?.optimisticMoveMany(bulkSelection.selectedIds, movesTo);
      try {
        const response = await bulkService.run(bulkAction, bulkSelection.selectedIds, {
          title: values.title,
          trainFilter: values.trainFilter,
          assigneeId: values.assigneeId,
        });
        if (!response.success) {
          toast.error('The bulk action could not be run');
          if (movesTo !== undefined) bumpKanban();
          return;
        }
        if (!response.data) {
          toast.error('The bulk action returned nothing to report');
          // Outcome unknown: show what the server holds rather than the cards moved ahead of it.
          if (movesTo !== undefined) bumpKanban();
          return;
        }
        const outcome = describeResult(bulkAction, response.data, orgCode);
        if (outcome.tone === 'warning') toast.error(outcome.text);
        else toast.success(outcome.text);

        bulkSelection.clear();
        setBulkAction(null);
        // One refresh for the whole run: the board keeps its loaded pages and scroll (#453).
        bumpKanban();
        void fetchMessages(messagesPagination.page, true);
      } catch (err) {
        toast.error(getApiErrorMessage(err) ?? 'The bulk action could not be run');
        // The cards were moved ahead of the answer; put the board back to what the server holds.
        if (movesTo !== undefined) bumpKanban();
      } finally {
        setBulkRunning(false);
      }
    },
    // The setters and refs passed in are the page's own (stable): the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkAction, bulkSelection, bumpKanban, fetchMessages, messagesPagination.page, orgCode]
  );
  return runBulkAction;
};
