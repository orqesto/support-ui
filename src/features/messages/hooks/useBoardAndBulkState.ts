import { useCallback, useReducer, useRef, useState } from 'react';
import { type BulkAction } from '@/lib/bulkActions';
import type { MessagesKanbanHandle } from '../components/kanbanBoard/kanbanBoardModel';

/** The page's board refresh key, bulk-run state, board total and the open card's handle. Moved unchanged from MessagesPage. */
export const useBoardAndBulkState = () => {
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);
  /**
   * Bulk selection. Owned HERE rather than inside the board because it must outlive a board
   * refresh (marking one thread read refreshes the board; the other fourteen stay picked) and
   * because the action bar sits outside the board.
   */
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkMergeOpen, setBulkMergeOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  /** What the board says it is holding — see the `pagination` prop on MessageFilterBar. */
  const [boardTotal, setBoardTotal] = useState(0);
  // A board column did not finish: the board's total is a lower bound (review of #798).
  const [boardPartial, setBoardPartial] = useState(false);
  const handleBoardTotal = useCallback((total: number, partial: boolean) => {
    setBoardTotal(total);
    setBoardPartial(partial);
  }, []);
  // View counts (Needs us / Unassigned / …) re-read on this tick. Declared here because an agent's
  // own action bumps it together with the board, below.
  const [countsTick, bumpCounts] = useReducer((tick: number) => tick + 1, 0);
  // The agent's own action: the board AND the view counts re-read now. They used to ride on the
  // action's socket echo, which is now coalesced (see refreshFromServerEvent).
  const bumpKanban = useCallback(() => {
    setKanbanRefreshKey((key) => key + 1);
    bumpCounts();
  }, []);

  // Imperative handle to the Kanban view for optimistic single-card moves, plus the
  // threadId of the currently-open conversation (captured on open) so we know which
  // card to move without a full board refetch.
  const kanbanRef = useRef<MessagesKanbanHandle>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  // The message the remembered card was captured for. The card is forgotten as soon as the open
  // message is no longer that one (useThreadDetailActions), however it changed.
  const selectedThreadMessageIdRef = useRef<number | null>(null);
  // The open detail panel registers its prompt-aware close here, so the backdrop
  // routes through the same "Mark as read?" prompt as the header X (triage threads).
  const detailRequestCloseRef = useRef<(() => void) | null>(null);
  // Move the open conversation's card to `targetColId` instantly via the Kanban's
  // optimistic path; fall back to a full board refetch when we can't target a card
  // (list mode / opened from a deep-link with no captured threadId). null = remove.
  const moveSelectedCard = useCallback(
    (targetColId: string | null) => {
      const tid = selectedThreadIdRef.current;
      if (tid && kanbanRef.current) {
        kanbanRef.current.optimisticMove(tid, targetColId);
      } else {
        bumpKanban();
      }
    },
    [bumpKanban]
  );

  return {
    kanbanRefreshKey,
    bulkAction,
    setBulkAction,
    bulkMergeOpen,
    setBulkMergeOpen,
    bulkRunning,
    setBulkRunning,
    boardTotal,
    boardPartial,
    handleBoardTotal,
    countsTick,
    bumpCounts,
    bumpKanban,
    kanbanRef,
    selectedThreadIdRef,
    selectedThreadMessageIdRef,
    detailRequestCloseRef,
    moveSelectedCard,
  };
};
