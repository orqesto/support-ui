import { BookOpen, Check, Ban } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ResolveMode } from './resolveMode';

export type ResolveDecisionsProps = {
  /** Decides whether this renders at all and which decisions it offers — see resolveMode.ts. */
  mode: ResolveMode;
  busy?: boolean;
  /**
   * The plain resolve. Opens the SAME confirm dialog the header's Resolve did (and the old
   * footer's "Resolve (no KB)" before it) — close() for an active conversation, the reject dialog
   * for an unreviewed one — so moving the control adds no new path to the backend.
   */
  onResolve: () => void;
  /** Active only: an unreviewed conversation has no answer to capture. */
  onResolveToKb?: () => void;
  onNotCustomerWork?: () => void;
  /** Confirmed spam: `move_to_spam` + `confirm` (owner, 2026-09-22). */
  onResolveAsSpam?: () => void;
};

// v3 ".act": outlined. ⛔ Nothing here is filled — Send owns the composer's right edge and is its
// ONLY filled button, so a hand going for Send cannot land on Resolve.
const ACT =
  'inline-flex items-center gap-1.5 h-[27px] px-[11px] rounded-[7px] border border-border bg-card text-foreground text-[12px] whitespace-nowrap transition-colors disabled:opacity-50';
// v3 ".q": the quiet exits that are not "we answered it".
const QUIET =
  'inline-flex items-center gap-[5px] h-[27px] px-2 rounded-[7px] text-muted-foreground text-[12px] whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50';

/**
 * The resolve decisions, under the reply — where the answer is written (design v3, 2026-09-23).
 *
 * Resolve pair first, then a rule, then the quiet exits. Hover previews the outcome: Resolve takes
 * the Resolved chip's green, save-to-KB the violet KB documentation uses; at rest both stay neutral
 * so neither competes with Send.
 *
 * ⛔ "Not customer work" is the only way to clear a newsletter off the queue WITHOUT claiming
 * anyone answered it, and "Resolve as spam" lands in Spam (confirmed) — the status stays
 * `filtered`, so the thread is never in the Resolved column.
 */
export function ResolveDecisions({
  mode,
  busy = false,
  onResolve,
  onResolveToKb,
  onNotCustomerWork,
  onResolveAsSpam,
}: ResolveDecisionsProps) {
  if (mode === null) return null;
  const offerKb = mode === 'active' && onResolveToKb !== undefined;
  const hasQuiet = onNotCustomerWork !== undefined || onResolveAsSpam !== undefined;

  return (
    <div
      role="group"
      aria-label="Resolve decisions"
      className="flex flex-wrap items-center gap-2 mt-[9px] pt-[9px] border-t border-hair"
    >
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onResolve}
          disabled={busy}
          // E opens the same dialog and follows the same resolveMode — and E also acts in note
          // mode, where this row is hidden (a keystroke is not a button beside Post).
          title="Resolve (E)"
          className={`${ACT} hover:text-success hover:bg-success-muted hover:border-success-line`}
        >
          <Check className="w-[13px] h-[13px]" strokeWidth={2.5} />
          Resolve
        </Button>
        {offerKb && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onResolveToKb}
            disabled={busy}
            className={`${ACT} hover:text-pending hover:bg-pending-muted hover:border-pending-line`}
          >
            <BookOpen className="w-[13px] h-[13px]" />
            Resolve &amp; save to KB
          </Button>
        )}
      </div>
      {hasQuiet && (
        <>
          <span aria-hidden="true" className="w-px h-4 mx-0.5 bg-border" />
          <div className="flex items-center gap-1.5">
            {onNotCustomerWork && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNotCustomerWork}
                disabled={busy}
                title="Clear it off the queue without claiming anyone answered it"
                className={QUIET}
              >
                Not customer work
              </Button>
            )}
            {onResolveAsSpam && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResolveAsSpam}
                disabled={busy}
                title="Confirms it as spam — it moves to Spam (confirmed), not Resolved"
                className={`${QUIET} hover:!bg-destructive-muted hover:!text-destructive`}
              >
                <Ban className="w-[13px] h-[13px]" />
                Resolve as spam
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
