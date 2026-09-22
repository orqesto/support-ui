import { useState, useCallback } from 'react';
import { RotateCcw, ShieldCheck, ShieldAlert, Trash2, BookOpen } from 'lucide-react';
import { getSpamCheck, getFilteredCategoryMeta } from '@/lib/messageHelpers';
import { notCustomerWorkMark } from './notCustomerWork';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import type { Message } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageActionStripProps = {
  message: Message;
  /**
   * Offered on a finished conversation. "Resolve & Save to KB" captures only at the moment of
   * resolving, so without this a thread resolved with "Resolve (no KB)" — or one whose capture
   * found nothing that day — could never reach the knowledge base afterwards.
   */
  onPromoteToKb?: () => void;
  isFiltered: boolean;
  isSuspicious: boolean;
  /** Spam verdict on a conversation that is not in a triage state — see MessageDetail. */
  isSpamFlaggedOutsideTriage?: boolean;
  isActive: boolean;
  hasLinkedTicket?: boolean;
  onReopen?: () => void;
  onDelete?: () => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean,
    confirm?: boolean
  ) => Promise<void>;
  setReopenDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageActionStrip({
  message,
  onPromoteToKb,
  isFiltered,
  isSuspicious,
  isSpamFlaggedOutsideTriage = false,
  hasLinkedTicket,
  onReopen,
  onClassify,
  setReopenDialogOpen,
}: MessageActionStripProps) {
  const [classifying, setClassifying] = useState(false);
  // When approving a suspicious message, the agent can also mint a green-flag
  // detection rule so semantically similar future messages aren't flagged.
  // Mirrors the manual-route "Create rule" toggle. Default off — one-off approve.
  const [createRule, setCreateRule] = useState(false);
  // When moving to spam, the agent can also opt in to train the spam filter (mint
  // a learned spam rule). Default off — a plain move-to-spam no longer trains, so
  // one mislabel can't silently create a rule.
  const [trainSpamFilter, setTrainSpamFilter] = useState(false);
  const handleClassify = useCallback(
    async (
      action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
      createDetectionRule?: boolean,
      trainFilter?: boolean,
      confirm?: boolean
    ) => {
      if (!onClassify) return;
      setClassifying(true);
      try {
        // The 4th argument only when set, so every other call keeps its shape.
        if (confirm) await onClassify(action, createDetectionRule, trainFilter, true);
        else await onClassify(action, createDetectionRule, trainFilter);
      } finally {
        setClassifying(false);
      }
    },
    [onClassify]
  );

  // v3 state strip: a tinted row under the header — what state this is and why on the left,
  // its decisions inline on the right. Tone by state: amber = suspicious (a judgement is
  // pending), red = filtered/spam, neutral = finished (resolved, not customer work).
  const btnBase =
    'inline-flex items-center justify-center gap-1.5 h-[27px] px-[11px] rounded-[7px] font-display text-[12px] font-medium transition-colors disabled:opacity-50';
  const statusLabel =
    'font-display text-[10px] tracking-[0.1em] uppercase text-muted-foreground font-semibold';
  const stripBase =
    'flex-shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 py-[9px] border-b';
  const strip = `${stripBase} border-border bg-raised`;
  const stripWarn = `${stripBase} border-warning-line bg-warning-muted`;
  const stripBad = `${stripBase} border-destructive-line bg-destructive-muted`;

  // Filtered: category-aware label and actions
  if (isFiltered && onClassify) {
    const spamCheck = getSpamCheck(message);
    const meta = getFilteredCategoryMeta(spamCheck?.category);
    const isSecurityThreat = spamCheck?.category === 'phishing' || spamCheck?.category === 'scam';
    /**
     * SP-D1: the system put this thread here; a PERSON saying "yes, it is spam" is a separate
     * fact, and until now there was no way to say it. The two halves of the Spam queue are built
     * on this — `spam_unconfirmed` is the one an agent works.
     *
     * ⚠️ `=== null` and `=== undefined` are NOT the same answer. Null means nobody has confirmed;
     * undefined means the deployment did not send the field (this frontend ships on merge, the
     * backend on a tag), and offering the button then would be honest — pressing it works — while
     * claiming "not yet confirmed" would not be. So the button shows for both, and only a real
     * timestamp renders the confirmed line.
     */
    const confirmedAt = message.spamConfirmedAt;
    /**
     * ⛔ THE LANE'S OWN ANSWER FIRST, the frozen copy only as a fallback.
     *
     * `message.isSpam` is resolved server-side from the newest inbound event — the same predicate
     * the Spam lane and its halves claim rows by (support-service #799). `metadata.spamCheck` is
     * frozen at thread creation and the two disagree on real threads: three live CoreSarms ones
     * in 2026-09, one a customer asking about an order. Reading the frozen copy meant a row in
     * `spam_unconfirmed` could offer no way to confirm it — work in the queue nobody could finish.
     *
     * ⚠️ `undefined` IS NOT `false`. This frontend deploys on merge and the backend ships on a
     * tag, so a bundle meets responses with no flag at all; treating absent as "not spam" would
     * remove the button from every thread on an older deployment. Absent falls back to the frozen
     * copy — the previous behaviour, which is imperfect but not a regression.
     */
    const inSpamLane = message.isSpam ?? spamCheck?.isSpam === true;
    const canConfirm = !isSecurityThreat && inSpamLane && !confirmedAt;
    return (
      <div className={stripBad}>
        <div className="flex-1 min-w-[190px] space-y-1">
          <p className={`${statusLabel} ${meta.statusClass}`}>{meta.statusText}</p>
          {confirmedAt && (
            // ⛔ NOT "resolved" (SP-D5). A confirmed spam thread keeps `filtered` and never enters
            // the Resolved column; the word would send an agent looking where it cannot be.
            <p className="text-[11px] text-muted-foreground">
              Confirmed as spam on {new Date(confirmedAt).toLocaleDateString()}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} h-auto ${meta.approveClass}`}
          >
            {isSecurityThreat ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {classifying ? 'Approving…' : meta.approveLabel}
          </Button>
          {canConfirm && (
            <Button
              variant="ghost"
              onClick={() => void handleClassify('confirm_spam')}
              disabled={classifying}
              className={`text-destructive border border-destructive-line ${btnBase} h-auto hover:bg-destructive-muted`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {classifying ? 'Confirming…' : 'Confirm — it is spam'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Spam verdict, but the conversation never entered triage — so none of the branches below
  // would render and there was no way to say "this is not spam". The verdict still hides it from
  // the work queue, so without this the conversation is invisible AND uncorrectable.
  //
  // Approving here runs the same feedback loop as approving from the Spam column: it contradicts
  // every rule that contributed to the verdict (so a bad rule accrues the signal that eventually
  // retires it) and mints a green-flag rule from this message.
  if (isSpamFlaggedOutsideTriage && onClassify) {
    return (
      <div className={stripBad}>
        <div className="flex-1 min-w-[190px] space-y-1">
          <p className={`${statusLabel} text-destructive`}>
            Flagged as spam — hidden from the inbox until approved
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className={`${btnBase} h-auto`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {classifying ? 'Updating…' : 'Not Spam — Approve'}
          </Button>
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
      <div className={stripWarn}>
        <div className="flex-1 min-w-[190px] space-y-1">
          <p className={`${statusLabel} ${isSecurityThreat ? 'text-destructive' : ''}`}>
            {statusText}
          </p>
          <div title="Also creates a detection rule (green flag) so semantically similar future messages aren't flagged as suspicious.">
            <Toggle
              checked={createRule}
              onChange={setCreateRule}
              disabled={classifying}
              label="Also teach the filter (create a detection rule)"
            />
          </div>
          {!isSecurityThreat && (
            <div title="Also mints a learned spam rule from this message so similar future messages are caught. The rule stays inert until it's corroborated by another spam message, so a one-off won't affect classification.">
              <Toggle
                checked={trainSpamFilter}
                onChange={setTrainSpamFilter}
                disabled={classifying}
                label="Also train the spam filter (learn from this message)"
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => void handleClassify('approve', createRule)}
            disabled={classifying}
            className={`${btnBase} h-auto`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {classifying
              ? 'Updating…'
              : isSecurityThreat
                ? 'Not a Threat — Approve'
                : 'Not Spam — Approve'}
          </Button>
          {!isSecurityThreat && (
            <Button
              variant="ghost"
              // An agent's decision on a suspicious thread = CONFIRMED spam (owner, 2026-09-22:
              // what our filters bin is unconfirmed; a person resolving it as spam confirms it).
              onClick={() => void handleClassify('move_to_spam', undefined, trainSpamFilter, true)}
              disabled={classifying}
              className={`text-destructive border border-destructive-line ${btnBase} h-auto hover:bg-destructive-muted`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {classifying ? 'Moving…' : 'Resolve & move to spam'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // The unreviewed and active states offer a DECISION, not a banner, and that decision now
  // lives in the header's split Resolve button (see resolveMode.ts). This strip keeps only
  // the state banners: filtered, spam-flagged, suspicious, resolved, closed.
  // Resolved, no ticket
  if (message.status === 'resolved' && !hasLinkedTicket && onReopen) {
    return (
      <div className={strip}>
        <div className="flex-1 min-w-[190px] space-y-1">
          <p className={statusLabel}>Resolved</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onPromoteToKb && (
            <Button
              variant="ghost"
              onClick={onPromoteToKb}
              className={`border ${btnBase} h-auto border-border text-muted-foreground hover:bg-accent`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Save to KB
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setReopenDialogOpen(true)}
            className={`border ${btnBase} h-auto border-border text-muted-foreground hover:bg-accent`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Unresolve
          </Button>
        </div>
      </div>
    );
  }

  // Closed
  if (message.status === 'closed' && !hasLinkedTicket && onReopen) {
    /* A binned thread is `closed` like any other, so without this an agent cannot tell what they
       or a colleague decided — and cannot tell why the thread is missing from the resolved count.
       The KB action is withheld too: the backend refuses it, and discovering that by pressing a
       button is a worse experience than not being offered it. */
    const binned = notCustomerWorkMark(message);
    return (
      <div className={strip}>
        <div className="flex-1 min-w-[190px] space-y-1">
          <p className={statusLabel}>
            {binned ? 'Not customer work' : 'Closed'}
            {binned?.at && (
              <span className="ml-1 font-normal text-muted-foreground">
                · binned {new Date(binned.at).toLocaleDateString()}
              </span>
            )}
          </p>
          {binned?.reason && <p className="text-xs text-muted-foreground">“{binned.reason}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {onPromoteToKb && !binned && (
            <Button
              variant="ghost"
              onClick={onPromoteToKb}
              className={`border ${btnBase} h-auto border-border text-muted-foreground hover:bg-accent`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Save to KB
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setReopenDialogOpen(true)}
            // The undo. Reopening is what puts a mis-binned thread back into the statistics —
            // the backend strips the mark on unresolve — so the title says so rather than
            // leaving an agent to guess whether the decision is permanent.
            title={
              binned
                ? 'Reopen — this also undoes "not customer work" and returns the thread to the statistics'
                : undefined
            }
            className={`border ${btnBase} h-auto border-border text-muted-foreground hover:bg-accent`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reopen
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
