import type { Message } from '@/types';

export type MessageDetailProps = {
  message: Message;
  onClose?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onResolve?: () => void;
  onRefresh?: () => void;
  /**
   * Re-read THIS conversation after the backend changed its status on its own (a customer reply
   * reopened it). Light on purpose — not onRefresh (useConversationStatusRefresh).
   */
  onStatusChanged?: () => void;
  /** Fired after the per-user read/unread state changes, so the board can refresh
   *  the triage unread indicator without closing the detail. */
  onReadChanged?: (isRead?: boolean) => void;
  /** Registers this panel's prompt-aware close handler with the parent, so that
   *  close gestures OUTSIDE the panel (e.g. the backdrop, or the full-page Back
   *  button) route through the same "Mark as read?" prompt as the header X.
   *  Passed null on unmount. */
  onRegisterRequestClose?: (requestClose: (() => void) | null) => void;
  /** Rendered as the standalone full-page view (has its own Back bar): suppress
   *  the header X + "open full page" button even though onClose is provided. */
  isFullPage?: boolean;
  /**
   * J/K: open the next / previous conversation in the list the user is looking at. Passed only
   * where that list has an unambiguous order (the threads view) — omitted, J/K do nothing.
   */
  onNavigate?: (direction: 'next' | 'prev') => void;
  /**
   * The detail was opened from the list row and the full record (reply block, WhatsApp window,
   * Reply-To) is still on its way: Send stays off and the To line is not guessed until it lands.
   */
  recordPending?: boolean;
  /** Fired after a customer reply is sent (not notes) — the conversation flips to
   *  "Pending" (awaiting the customer), letting the board move the card optimistically. */
  onReplied?: () => void;
  /** Optimistically move the board card to a column after a manual status change
   *  (park / resolve / reopen) from the detail header. */
  onOptimisticMove?: (columnId: string) => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean,
    /** move_to_spam only: the agent's own decision — bin AND record it as confirmed spam. */
    confirm?: boolean
  ) => Promise<void>;
};

/** A useState setter. */
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
