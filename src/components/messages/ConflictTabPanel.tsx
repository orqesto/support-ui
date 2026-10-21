import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import {
  ContradictionAlert,
  contradictionChecksToRender,
  contradictionFingerprint,
} from './ContradictionAlert';
import { isContradictionDismissed } from './aiFlagCopy';
import { LABEL } from './messageDetailConstants';

const CONFIDENCE_PILL: Record<string, string> = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-muted text-muted-foreground',
};

const ACTION_BTN =
  'flex items-center justify-center gap-1.5 px-3 py-1.5 h-auto rounded border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50';

const CleanResult = ({ check }: { check: ContradictionCheckMetadata }) => (
  <div className="p-2 rounded border border-border bg-card space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-medium text-success">No contradiction found</span>
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${CONFIDENCE_PILL[check.result.confidence] ?? CONFIDENCE_PILL.low}`}
      >
        {check.result.confidence} confidence
      </span>
    </div>
    {check.claimToVerify && (
      <div>
        <p className={`${LABEL} text-muted-foreground mb-0.5`}>CLAIM CHECKED</p>
        <p className="text-[11px] italic text-foreground">"{check.claimToVerify}"</p>
      </div>
    )}
    {check.result.explanation && (
      <div>
        <p className={`${LABEL} text-muted-foreground mb-0.5`}>ANALYSIS</p>
        <p className="text-[11px] text-muted-foreground">{check.result.explanation}</p>
      </div>
    )}
    <p className="text-[9px] text-muted-foreground pt-1 border-t border-border">
      {check.triggeredBy === 'auto_pattern' ? 'Auto' : 'Manual'} ·{' '}
      {new Date(check.checkedAt).toLocaleString()}
    </p>
  </div>
);

/**
 * The Conflict tab: the contradiction checks on this thread, with Check / Re-check and — when one
 * is flagged — Dismiss ("not a contradiction", 2026-10-21).
 *
 * A dismissed contradiction (`dismissedAt` from the backend, or dismissed here a moment ago before
 * the refetch lands) reads as no contradiction. One dismissal covers both checks: they are
 * usually the same finding, and the badges read the thread as clean.
 */
export function ConflictTabPanel({
  message,
  onCheckContradiction,
  onDismissContradiction,
}: {
  message: Message;
  onCheckContradiction?: () => Promise<void>;
  /** Resolves true on success; the caller reports failures (incl. 404 from an older backend). */
  onDismissContradiction?: () => Promise<boolean>;
}) {
  const [checking, setChecking] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  // Keyed on the thread so a dismissal never carries over to the next thread opened.
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);

  const handleCheck = useCallback(async () => {
    if (!onCheckContradiction) return;
    setChecking(true);
    try {
      await onCheckContradiction();
    } finally {
      setChecking(false);
    }
  }, [onCheckContradiction]);

  const handleDismiss = useCallback(async () => {
    if (!onDismissContradiction) return;
    setDismissing(true);
    try {
      if (await onDismissContradiction()) setDismissedFor(message.id);
    } finally {
      setDismissing(false);
    }
  }, [onDismissContradiction, message.id]);

  const crossCheck = message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined;
  const intraCheck = message.metadata?.intraMessageContradictionCheck as
    | ContradictionCheckMetadata
    | undefined;
  const dismissed =
    dismissedFor === message.id ||
    isContradictionDismissed(crossCheck) ||
    isContradictionDismissed(intraCheck);
  const hasCrossContradiction =
    !dismissed &&
    (!!crossCheck?.result?.hasContradiction || !!crossCheck?.result?.contradictions?.length);
  const hasIntraContradiction =
    !dismissed &&
    (!!intraCheck?.result?.hasContradiction || !!intraCheck?.result?.contradictions?.length);
  const checkWasRun = !!crossCheck || !!intraCheck;

  if (hasIntraContradiction || hasCrossContradiction) {
    return (
      <div className="space-y-2">
        {/* The fingerprint is unique across the rendered set by construction — it is what the
            list was deduplicated on. `checkedAt` alone would collide: the thread and intra checks
            of a single run share a timestamp. */}
        {contradictionChecksToRender(intraCheck, crossCheck).map((check) => (
          <ContradictionAlert key={contradictionFingerprint(check)} contradictionCheck={check} />
        ))}
        {crossCheck && !hasCrossContradiction && !crossCheck.result.hasContradiction && (
          <CleanResult check={crossCheck} />
        )}
        {onDismissContradiction && (
          <Button
            variant="ghost"
            onClick={() => void handleDismiss()}
            disabled={dismissing}
            title="Not a contradiction — clear the flag on this thread"
            className={`w-full ${ACTION_BTN}`}
          >
            {dismissing ? 'Dismissing…' : 'Dismiss'}
          </Button>
        )}
      </div>
    );
  }

  if (checkWasRun) {
    const dismissedAt = crossCheck?.dismissedAt ?? intraCheck?.dismissedAt;
    return (
      <div className="space-y-2">
        {dismissed ? (
          <p
            className="p-2 rounded border border-border bg-card text-[11px] text-muted-foreground"
            data-testid="contradiction-dismissed"
          >
            Contradiction dismissed
            {dismissedAt ? ` · ${new Date(dismissedAt).toLocaleString()}` : ''}
          </p>
        ) : (
          <>
            {crossCheck && <CleanResult check={crossCheck} />}
            {intraCheck && <CleanResult check={intraCheck} />}
          </>
        )}
        {onCheckContradiction && (
          <Button
            variant="ghost"
            onClick={() => void handleCheck()}
            disabled={checking}
            className={`w-full ${ACTION_BTN}`}
          >
            {checking ? 'Checking…' : 'Re-check'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-[11px] text-muted-foreground">Not checked yet.</p>
      {onCheckContradiction && (
        <Button
          variant="ghost"
          onClick={() => void handleCheck()}
          disabled={checking}
          className={ACTION_BTN}
        >
          {checking ? 'Checking…' : 'Check contradiction'}
        </Button>
      )}
    </div>
  );
}
