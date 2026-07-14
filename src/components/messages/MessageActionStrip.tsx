import { useState, useCallback } from 'react';
import {
  CheckCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { getSpamCheck, getFilteredCategoryMeta } from '@/lib/messageHelpers';
import type { Message } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageActionStripProps = {
  message: Message;
  isFiltered: boolean;
  isSuspicious: boolean;
  isActive: boolean;
  resolving: boolean;
  hasLinkedTicket?: boolean;
  onReopen?: () => void;
  onDelete?: () => void;
  onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
  onResolveWithoutReply: () => void;
  onClose?: () => void;
  setRejectDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReopenDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageActionStrip({
  message,
  isFiltered,
  isSuspicious,
  resolving,
  hasLinkedTicket,
  onReopen,
  onClassify,
  onResolveWithoutReply,
  onClose,
  setRejectDialogOpen,
  setReopenDialogOpen,
}: MessageActionStripProps) {
  const [classifying, setClassifying] = useState(false);
  const handleClassify = useCallback(
    async (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => {
      if (!onClassify) return;
      setClassifying(true);
      try {
        await onClassify(action);
      } finally {
        setClassifying(false);
      }
    },
    [onClassify]
  );

  const btnBase =
    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-medium transition-colors disabled:opacity-50';
  const statusLabel = 'font-mono text-[9px] tracking-wide uppercase text-muted-foreground mb-1.5';
  const strip = 'flex-shrink-0 px-4 pt-2 pb-2.5 border-t border-border';

  // A customer reply makes this an ACTIVE conversation even while the status is
  // still 'open'/'new' (the status→client_replied transition doesn't fire on every
  // ingest path). Such a conv shows the "CLIENT REPLIED" badge, so it must offer the
  // same actions as awaiting_response (Create Ticket / Resolve & Save to KB / Close),
  // not be treated as an unreviewed message that can only be closed.
  const clientReplied = message.lastReplyFromClient === true;

  // Filtered: category-aware label and actions
  if (isFiltered && onClassify) {
    const spamCheck = getSpamCheck(message);
    const meta = getFilteredCategoryMeta(spamCheck?.category);
    const isSecurityThreat = spamCheck?.category === 'phishing' || spamCheck?.category === 'scam';
    return (
      <div className={strip}>
        <p className={`${statusLabel} ${meta.statusClass}`}>{meta.statusText}</p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} ${meta.approveClass}`}
          >
            {isSecurityThreat ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {classifying ? 'Approving…' : meta.approveLabel}
          </button>
        </div>
      </div>
    );
  }

  // Suspicious: phishing/scam threats get a warning label and no "move to spam" action
  if (isSuspicious && onClassify) {
    const spamCheck = getSpamCheck(message);
    const category = spamCheck?.category;
    const isSecurityThreat = category === 'phishing' || category === 'scam';
    const statusText = isSecurityThreat
      ? `Flagged as possible ${category} — review before approving`
      : 'Flagged as suspicious by spam filter';
    return (
      <div className={strip}>
        <p className={`${statusLabel} ${isSecurityThreat ? 'text-red-500' : ''}`}>{statusText}</p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {classifying ? 'Updating…' : isSecurityThreat ? 'Not a Threat — Approve' : 'Not Spam — Approve'}
          </button>
          {!isSecurityThreat && (
            <button
              onClick={() => void handleClassify('move_to_spam')}
              disabled={classifying}
              className={`text-red-600 border border-red-300 ${btnBase} hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {classifying ? 'Moving…' : 'Move to Spam'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Unreviewed — status='open' (unprocessed) AND the customer hasn't replied yet.
  // The DB-side 'new' status is mapped to ThreadStatus='open' on the API boundary,
  // so this only checks 'open'. Once the client has replied, fall through to the
  // active-conversation branch below (full action set).
  if (message.status === 'open' && !clientReplied && !isSuspicious && onReopen) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Open — resolve without sending a reply</p>
        <div className="flex gap-2">
          <button
            onClick={() => setRejectDialogOpen(true)}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Resolve (no KB)
          </button>
        </div>
      </div>
    );
  }

  // Active — processed, no ticket, not resolved/closed. Includes an 'open' conv the
  // customer has replied to (clientReplied), which the unreviewed branch above now
  // skips so it lands here with the full action set.
  if (
    (message.status !== 'open' || clientReplied) &&
    message.status !== 'resolved' &&
    message.status !== 'closed' &&
    !hasLinkedTicket &&
    !isSuspicious
  ) {
    return (
      <div className={strip}>
        <div className="flex gap-2">
          <button
            onClick={onResolveWithoutReply}
            disabled={resolving}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {resolving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            {resolving ? 'Processing…' : 'Resolve & Save to KB'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              disabled={resolving}
              className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Resolve (no KB)
            </button>
          )}
        </div>
      </div>
    );
  }

  // Resolved, no ticket
  if (message.status === 'resolved' && !hasLinkedTicket && onReopen) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Resolved</p>
        <div className="flex gap-2">
          <button
            onClick={() => setReopenDialogOpen(true)}
            className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Unresolve
          </button>
        </div>
      </div>
    );
  }

  // Closed
  if (message.status === 'closed' && !hasLinkedTicket && onReopen) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Closed</p>
        <div className="flex gap-2">
          <button
            onClick={() => setReopenDialogOpen(true)}
            className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reopen
          </button>
        </div>
      </div>
    );
  }

  return null;
}
