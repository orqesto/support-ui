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

/** The decision waiting on a Knowledge Base row (highest priority), how many more, or why it is set aside. */
export const KbPendingDecisionBadge = ({
  decision,
  others = 0,
  setAsideReason = null,
}: {
  decision: KbPendingDecision | null | undefined;
  others?: number;
  setAsideReason?: KbSetAsideReason | null;
}) => (
  <div className="flex flex-wrap gap-1 justify-center items-center">
    {decision && (
      <Badge variant={decision.kind === 'remove' ? 'danger' : 'warning'}>
        {LABEL[decision.kind]}
      </Badge>
    )}
    {decision && others > 0 && (
      <span className="text-xs text-muted-foreground">+{others} more</span>
    )}
    {decision && !decision.canDecide && (
      <span className="text-xs text-muted-foreground">Only a workspace admin can decide this</span>
    )}
    {setAsideReason && <Badge variant="secondary">{SET_ASIDE_REASON_LABEL[setAsideReason]}</Badge>}
  </div>
);
