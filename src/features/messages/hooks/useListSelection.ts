import { useCallback, useMemo, useState } from 'react';
import type { MessageThread } from '@/services/message.service';
import type { Message, MessagesDisplayMode } from '@/types';
import type { ToggleSelected } from '../components/bulk/selectMode';
import { useSelectionShortcuts } from '../components/bulk/selectionShortcuts';
import type { useBulkSelection } from '../components/bulk/useBulkSelection';
import { threadSections } from '../components/list/threadSections';
import { GROUP_KEY } from '../components/messagesPage/messagesPageConstants';
import type { ListDensity } from '../components/useListPresentation';

/** The list view's selection: drawn order, selectable rows, shift-click ranges, x / Esc. Moved unchanged from MessagesPage. */
export const useListSelection = ({
  threads,
  density,
  bulkSelection,
  selectedMessage,
  displayMode,
}: {
  threads: MessageThread[];
  density: ListDensity;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  selectedMessage: Message | null;
  displayMode: MessagesDisplayMode;
}) => {
  /**
   * What the list view's "select every message on this page" can offer: the loaded rows that
   * are real conversations. A `spamlog_` row has none behind it and every bulk action refuses
   * it, so offering it would be an invitation to a guaranteed refusal.
   */
  // Table only: status sections, as the tickets table offers (one design for both lists).
  const [groupByStatus, setGroupByStatus] = useState(() => {
    try {
      return localStorage.getItem(GROUP_KEY) === '1';
    } catch {
      return false;
    }
  });

  /**
   * The rows in the order they are DRAWN. Grouped by status, the table sorts them into sections;
   * shift-click ranges and J/K must walk that order, or a range picked between two Open rows
   * also took the Pending and Resolved rows that sit between them in server order (review #712).
   */
  const drawnThreads = useMemo(
    () =>
      density === 'compact' && groupByStatus
        ? threadSections(threads, true).map((row) => row.thread)
        : threads,
    [threads, density, groupByStatus]
  );
  const listSelectableIds = useMemo(
    () =>
      drawnThreads
        .filter(
          (thread) => !thread.threadId.startsWith('spamlog_') && (thread.latestMessage?.id ?? 0) > 0
        )
        .map((thread) => thread.latestMessage!.id),
    [drawnThreads]
  );
  const listSelectedCount = listSelectableIds.filter((id) => bulkSelection.isSelected(id)).length;

  /**
   * Select mode (owner, 2026-09-28): anything selected ⇒ every row and card shows its box
   * until the selection is empty. The WHOLE selection, not this page's share of it — the bar
   * says "N selected" for all of it, and a box hidden beside that count would contradict it.
   */
  const selectMode = bulkSelection.selectedIds.length > 0;

  /** List rows: a shift-click ranges over the rows on THIS page, in the order they are drawn. */
  const { toggle: toggleSelection, toggleRange: toggleSelectionRange } = bulkSelection;
  const toggleListRow = useCallback<ToggleSelected>(
    (conversationId, options) =>
      options?.range
        ? toggleSelectionRange(conversationId, listSelectableIds)
        : toggleSelection(conversationId),
    [toggleSelection, toggleSelectionRange, listSelectableIds]
  );

  // `x` toggles the focused row, Esc clears. Both are off while the detail pane is open: Esc
  // closes the pane there (detailShortcuts.ts), and the row that opened it still holds focus.
  // Off in the contacts view too — it has no selectable rows, and its profile panel closes on
  // an Esc (a window listener, no dialog role) that must not also drop a selection made
  // in the list.
  useSelectionShortcuts(
    {
      hasSelection: selectMode,
      listActive: selectedMessage === null && displayMode !== 'contacts',
    },
    { toggle: toggleSelection, clear: bulkSelection.clear }
  );

  return {
    groupByStatus,
    setGroupByStatus,
    drawnThreads,
    listSelectableIds,
    listSelectedCount,
    selectMode,
    toggleListRow,
  };
};
