/**
 * A reply's answer can land after the agent opened another thread: the board card that moves is
 * the one of the thread the reply was sent on, never the one open now. Through the page's real
 * wiring (detailPanelProps → useBoardAndBulkState's moveSelectedCard). Invented data.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/types';
import { useBoardAndBulkState } from '../../../hooks/useBoardAndBulkState';
import { detailPanelProps, type DetailPanelDeps } from '../detailPanelProps';
import type { MessagesKanbanHandle } from '../../kanbanBoard/kanbanBoardModel';

const setup = () => {
  const board = renderHook(() => useBoardAndBulkState());
  const optimisticMove = vi.fn();
  // The board's handle, as the mounted board would set it.
  (board.result.current.kanbanRef as { current: MessagesKanbanHandle | null }).current = {
    optimisticMove,
  } as unknown as MessagesKanbanHandle;
  const open = (threadId: string, messageId: number) => {
    board.result.current.selectedThreadIdRef.current = threadId;
    board.result.current.selectedThreadMessageIdRef.current = messageId;
  };
  // The detail's props as the page builds them for the thread open at send time.
  const propsFor = (messageId: number) =>
    detailPanelProps(
      { id: messageId } as Message,
      {
        moveSelectedCard: board.result.current.moveSelectedCard,
        displayMode: 'kanban',
        queryClient: {} as QueryClient,
      } as unknown as DetailPanelDeps
    );
  return { board, optimisticMove, open, propsFor };
};

describe('the card a reply moves', () => {
  it('the agent opened another thread before the answer: that card stays, the board is read', () => {
    const { board, optimisticMove, open, propsFor } = setup();
    open('thread-a', 101);
    const sentOnA = propsFor(101);
    open('thread-b', 202);
    const before = board.result.current.kanbanRefreshKey;
    act(() => sentOnA.onReplied?.());
    expect(optimisticMove).not.toHaveBeenCalled();
    expect(board.result.current.kanbanRefreshKey).toBe(before + 1);
  });

  it('CONTROL — still on that thread: its card moves at once', () => {
    const { optimisticMove, open, propsFor } = setup();
    open('thread-a', 101);
    act(() => propsFor(101).onReplied?.());
    expect(optimisticMove).toHaveBeenCalledWith('thread-a', 'awaiting');
  });
});
