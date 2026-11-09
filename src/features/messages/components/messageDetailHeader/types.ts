import type { Message } from '@/types';
import type { ManualMerge } from '@/features/messages/services/conversationMerge.service';
import type { MergeChange } from '../useThreadMergeContext';

export type MessageDetailHeaderProps = {
  message: Message;
  onClose?: () => void;
  showFullPageButton: boolean;
  isFullPage: boolean;
  threadCount: number;
  onRefresh?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean,
    /** move_to_spam only: the agent's own decision — bin AND record it as confirmed spam. */
    confirm?: boolean
  ) => Promise<void>;
  /**
   * Optimistically move the board card to a kanban column right after a manual
   * status change (park / resolve / reopen), so the acting agent sees it move
   * instantly instead of waiting for the onRefresh refetch. No-op on the
   * standalone detail page (no board).
   */
  onOptimisticMove?: (columnId: string) => void;
  /**
   * Bumped by the parent whenever a contact label changes (from the CUSTOMER
   * tab or this header's own contact drawer). The message-label list is a
   * UNION that includes inherited contact labels, so it must refetch when they
   * change — message.id alone doesn't change on a label edit.
   */
  labelsRefreshKey?: number;
  /** Called after a contact change that also shows on cards + this header (labels). */
  onContactChanged?: () => void;
  /** Show the per-user read/unread toggle (triage queues only). */
  showReadToggle?: boolean;
  /** Current per-user read state (true = read). */
  isRead?: boolean;
  /** Toggle the per-user read/unread state. */
  onToggleRead?: () => void;
  /**
   * Full page (v3): the Dept / Assigned / Category / Labels block renders into this node — the
   * right sidebar — as stacked rows, instead of as the inline meta row under the chips. Portal,
   * so its state and handlers stay here with the rest of the header's.
   */
  metaTarget?: HTMLElement | null; // undefined = inline; null = sidebar not mounted yet
  /**
   * While a reply is being written (2026-10-29): only the top row and a one-line subject, so the
   * conversation keeps its room. The chips and meta rows come back when the reply box folds.
   */
  compact?: boolean;
  /**
   * What was merged into this thread, read by the host (MessageDetail's useThreadMergeContext)
   * so one open asks once. null = the backend could not say. Passed WITH `onReloadMerges`;
   * without it the header reads the list itself (any other host).
   */
  merges?: ManualMerge[] | null;
  /**
   * Re-read the host's merge list. After a merge or an unmerge from here the header calls the
   * host's `onRefresh` INSTEAD when it has one: that refresh re-reads the list already
   * (MessageDetail: it bumps the refresh key useThreadMergeContext reads), and calling both
   * sent two identical GET …/merges.
   */
  onReloadMerges?: () => void;
  /**
   * Apply a merge or an unmerge the server has just confirmed to the host's list, before the
   * re-read: a re-read that fails keeps the list, and it must not still show what was undone.
   */
  onMergeChange?: (change: MergeChange) => void;
};
