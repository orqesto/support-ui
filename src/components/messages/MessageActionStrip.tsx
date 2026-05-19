import { useState, useCallback } from 'react';
import {
  CheckCircle,
  RefreshCw,
  RotateCcw,
  MessageSquare,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { Message } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageActionStripProps = {
  message: Message;
  isFiltered: boolean;
  isSuspicious: boolean;
  isActive: boolean;
  resolving: boolean;
  onApprove?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
  onResolveWithoutReply: () => void;
  onResolveSimple?: () => void;
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
  onApprove,
  onReopen,
  onClassify,
  onResolveWithoutReply,
  onResolveSimple,
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

  // Filtered: approve to active
  if (isFiltered && onClassify) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Filtered — excluded from active inbox</p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {classifying ? 'Approving…' : 'Approve — Move to Active'}
          </button>
        </div>
      </div>
    );
  }

  // Suspicious: not spam or move to spam
  if (isSuspicious && onClassify) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Flagged as suspicious by spam filter</p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {classifying ? 'Updating…' : 'Not Spam — Approve'}
          </button>
          <button
            onClick={() => void handleClassify('move_to_spam')}
            disabled={classifying}
            className={`text-red-600 border border-red-300 ${btnBase} hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {classifying ? 'Moving…' : 'Move to Spam'}
          </button>
        </div>
      </div>
    );
  }

  // Unprocessed
  if (!message.processed && !isSuspicious && onReopen) {
    return (
      <div className={strip}>
        <p className={statusLabel}>New — needs processing before ticket creation</p>
        <div className="flex gap-2">
          <button
            onClick={() => setRejectDialogOpen(true)}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Mark as Processed
          </button>
        </div>
      </div>
    );
  }

  // Processed, no ticket, not resolved/closed
  if (
    message.processed &&
    !message.resolved &&
    message.status !== 'closed' &&
    !message.ticketId &&
    !isSuspicious
  ) {
    return (
      <div className={strip}>
        <div className="flex gap-2">
          {onApprove && (
            <button
              onClick={onApprove}
              className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {message.isLead ? 'Create Lead Ticket' : 'Create Ticket'}
            </button>
          )}
          <button
            onClick={onResolveWithoutReply}
            disabled={resolving}
            className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
          >
            {resolving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            {resolving ? 'Processing…' : 'Resolve & Save to KB'}
          </button>
          {onResolveSimple && (
            <button
              onClick={onResolveSimple}
              className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Resolve
            </button>
          )}
        </div>
      </div>
    );
  }

  // Resolved, no ticket
  if (message.resolved && !message.ticketId && onReopen) {
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
  if (message.status === 'closed' && !message.ticketId && onReopen) {
    return (
      <div className={strip}>
        <p className={statusLabel}>Closed</p>
        <div className="flex gap-2">
          <button
            onClick={() => setReopenDialogOpen(true)}
            className={`border ${btnBase} border-border text-muted-foreground hover:bg-accent`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Unprocess & Reopen
          </button>
        </div>
      </div>
    );
  }

  return null;
}
