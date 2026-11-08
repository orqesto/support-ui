import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { QueryClient } from '@tanstack/react-query';
import { NOTIFICATION_COUNTS_KEY } from '@/hooks/useNotificationCounts';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { messageService, type MessageThread } from '@/services/message.service';
import {
  APPROVE_TARGET,
  COLUMNS,
  getDndAction,
  dndConfirmsSpam,
  type ColumnAxis,
} from '../kanbanColumns';
import type { ColumnState } from './kanbanBoardModel';
import type { useKanbanBoardData } from './useKanbanBoardData';

/** Drag-and-drop between lanes: sensors, the picked-up card, and the optimistic move + rollback. Extracted unchanged from `MessagesKanbanView`. */
export const useKanbanDrag = ({
  queryClient,
  colStatesRef,
  setColStates,
  setActiveThread,
  setActiveDragColId,
  activeTabRef,
  loadBoard,
}: {
  queryClient: QueryClient;
  colStatesRef: MutableRefObject<Record<string, ColumnState>>;
  setColStates: Dispatch<SetStateAction<Record<string, ColumnState>>>;
  setActiveThread: Dispatch<SetStateAction<MessageThread | null>>;
  setActiveDragColId: Dispatch<SetStateAction<string | null>>;
  activeTabRef: MutableRefObject<ColumnAxis>;
  loadBoard: ReturnType<typeof useKanbanBoardData>['loadBoard'];
}) => {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const threadId = event.active.id as string;
    const colId = event.active.data.current?.colId as string;
    const thread = colStatesRef.current[colId]?.threads.find((thr) => thr.threadId === threadId);
    setActiveThread(thread ?? null);
    setActiveDragColId(colId);
    // The state setters and refs come from useKanbanBoardData: stable, so the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveThread(null);
      setActiveDragColId(null);

      if (!over) return;

      const threadId = active.id as string;
      const fromColId = active.data.current?.colId as string;
      const toColId = over.id as string;

      if (fromColId === toColId) return;

      const action = getDndAction(fromColId, toColId);
      if (!action) return;

      const thread = colStatesRef.current[fromColId]?.threads.find(
        (thr) => thr.threadId === threadId
      );
      if (!thread?.latestMessage) return;

      // Spam-log synthetic threads have negative message IDs and cannot be classified
      // via the API. Guard here to prevent a silent 400 error and confusing card jump.
      const msgId = thread.latestMessage.id;
      if (threadId.startsWith('spamlog_') || msgId <= 0) {
        logger.warn(`Attempted DnD on spam-log synthetic thread ${threadId} — no-op`);
        return;
      }

      // Capture original index before optimistic move so rollback restores the card
      // to its original position rather than prepending at index 0.
      const originalIndex = colStatesRef.current[fromColId].threads.findIndex(
        (thr) => thr.threadId === threadId
      );

      // Optimistic move. "Approve" has no destination column (the item leaves triage
      // and enters the lifecycle at "Open" on the other tab), so only add to a real,
      // currently-loaded destination column.
      setColStates((prev) => {
        const next: Record<string, ColumnState> = {
          ...prev,
          [fromColId]: {
            ...prev[fromColId],
            threads: prev[fromColId].threads.filter((thr) => thr.threadId !== threadId),
            total: Math.max(0, prev[fromColId].total - 1),
          },
        };
        if (toColId !== APPROVE_TARGET && prev[toColId]) {
          next[toColId] = {
            ...prev[toColId],
            threads: [thread, ...prev[toColId].threads],
            total: prev[toColId].total + 1,
          };
        }
        return next;
      });

      try {
        if (action === 'reopen') {
          await messageService.reopen(msgId);
        } else {
          // A drag onto Spam is an agent decision = confirmed spam (see dndConfirmsSpam).
          await messageService.classify(
            msgId,
            action,
            undefined,
            undefined,
            dndConfirmsSpam(action)
          );
          // approve/move_to_spam on a needs_routing conv changes the badge — invalidate
          // so the sidebar count doesn't lag behind the 60s auto-refetch interval.
          void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY });
        }
        // The agent's OWN move: re-read the board in place now. Other people's changes wait for
        // the page's coalesced refresh, and this one used to ride on its own socket echo — so
        // without this a reopen landing in another column than the drop target, or the column
        // totals, would stay wrong for up to that window.
        loadBoard({
          colIds: COLUMNS.filter((col) => col.axis === activeTabRef.current).map((col) => col.id),
          keepDepth: true,
          unread: true,
          scope: false,
        });
      } catch (err) {
        logger.error(`Failed to move thread ${threadId} from ${fromColId} to ${toColId}:`, err);
        // Surface the server reason (e.g. a 409 "cannot be reopened") — the optimistic
        // move is about to roll back, so without this the card silently snaps back.
        toast.failure(action === 'reopen' ? 'reopen thread' : 'move thread', err);
        // Rollback: restore card at its original position
        setColStates((prev) => {
          const restored = [...prev[fromColId].threads];
          restored.splice(Math.min(originalIndex, restored.length), 0, thread);
          const next: Record<string, ColumnState> = {
            ...prev,
            [fromColId]: {
              ...prev[fromColId],
              threads: restored,
              total: prev[fromColId].total + 1,
            },
          };
          if (toColId !== APPROVE_TARGET && prev[toColId]) {
            next[toColId] = {
              ...prev[toColId],
              threads: prev[toColId].threads.filter((thr) => thr.threadId !== threadId),
              total: Math.max(0, prev[toColId].total - 1),
            };
          }
          return next;
        });
      }
    },
    // The state setters and refs come from useKanbanBoardData: stable, so the deps stay as they were inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, loadBoard]
  );

  return { sensors, handleDragStart, handleDragEnd };
};
