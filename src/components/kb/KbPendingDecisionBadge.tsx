import { Badge } from '@/components/ui/Badge';
import { SET_ASIDE_REASON_LABEL } from '@/components/kb/kbWorkRowModel';
import type { KbPendingDecision, KbDecisionKind } from '@/services/kb.service';
import type { KbSetAsideReason } from '@/services/kbConsolidation.service';

const LABEL: Record<KbDecisionKind, string> = {
  approve_capture: 'Needs approval',
  remove: 'Suggested: remove',
  rewrite: 'Suggested: rewrite',
  merge: 'Suggested: merge',
  attach: 'Suggested: add to case',
};

/** The KB table's Status column is narrow: a two-line `rounded-full` pill read as a blob (prod
 *  2026-10-20). There it says the action on one line; the full label is its tooltip. */
const SHORT_LABEL: Record<KbDecisionKind, string> = {
  approve_capture: 'To approve',
  remove: 'Remove?',
  rewrite: 'Rewrite?',
  merge: 'Merge?',
  attach: 'Add to case?',
};

export const CANNOT_DECIDE =
  "You can't decide this one — it covers departments you don't moderate.";

/** A short visible label; the full one is read out instead (a tooltip alone reaches no keyboard
 *  or screen-reader user). */
export const Short = ({ short, full }: { short: string; full: string }) => (
  <>
    <span aria-hidden="true">{short}</span>
    <span className="sr-only">{full}</span>
  </>
);

/** The decision waiting on a Knowledge Base row (highest priority), how many more, or why it is set aside. */
export const KbPendingDecisionBadge = ({
  decision,
  others = 0,
  setAsideReason = null,
  compact = false,
}: {
  decision: KbPendingDecision | null | undefined;
  others?: number;
  setAsideReason?: KbSetAsideReason | null;
  /** The KB table: short one-line labels, the full wording in tooltips. */
  compact?: boolean;
}) => (
  <div className="flex flex-wrap gap-1 justify-center items-center">
    {decision && (
      <Badge
        variant={decision.kind === 'remove' ? 'danger' : 'warning'}
        className={compact ? 'whitespace-nowrap' : undefined}
        title={compact ? LABEL[decision.kind] : undefined}
      >
        {compact ? (
          <Short short={SHORT_LABEL[decision.kind]} full={LABEL[decision.kind]} />
        ) : (
          LABEL[decision.kind]
        )}
      </Badge>
    )}
    {decision && others > 0 && (
      <span className="text-xs text-muted-foreground">+{others} more</span>
    )}
    {decision && !decision.canDecide && (
      <span className="text-xs text-muted-foreground" title={compact ? CANNOT_DECIDE : undefined}>
        {compact ? <Short short="Not yours to decide" full={CANNOT_DECIDE} /> : CANNOT_DECIDE}
      </span>
    )}
    {setAsideReason && (
      <Badge variant="secondary" className={compact ? 'rounded-md' : undefined}>
        {SET_ASIDE_REASON_LABEL[setAsideReason]}
      </Badge>
    )}
  </div>
);
