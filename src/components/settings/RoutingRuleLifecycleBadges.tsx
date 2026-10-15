import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import type { RoutingRule } from '@/services/routingRule.service';
import {
  acceptEffectsOf,
  isApprovedRule,
  proposalCardIdOf,
  ruleLifecycle,
} from './routingRuleLifecycle';

type BadgeRule = RoutingRule & { name: string; pattern: string };

/** Type-column badges: Proposed (links to its card), Declined (reason), Archived, Learned. */
export const RoutingRuleLifecycleBadges = <T extends BadgeRule>({
  rule,
  rules,
}: {
  rule: T;
  rules: T[];
}) => {
  const lifecycle = ruleLifecycle(rule);
  const cardId = lifecycle === 'proposed' ? proposalCardIdOf(rule, rules) : null;
  const declineReason = rule.metadata?.declineReason ?? 'Declined';
  return (
    <>
      {lifecycle === 'proposed' &&
        (cardId !== null ? (
          <Link to={`/settings?focus=${cardId}#ai/learning`}>
            <Badge variant="secondary" className="opacity-70">
              Proposed
            </Badge>
          </Link>
        ) : (
          <Badge variant="secondary" className="opacity-70">
            Proposed
          </Badge>
        ))}
      {lifecycle === 'declined' && (
        <Tooltip content={declineReason}>
          <Badge variant="secondary" title={declineReason}>
            Declined
          </Badge>
        </Tooltip>
      )}
      {lifecycle === 'archived' && <Badge variant="secondary">Archived</Badge>}
      {lifecycle === 'active' && isApprovedRule(rule) && (
        <Badge variant="success">Learned · Approved</Badge>
      )}
      {lifecycle === 'active' && rule.provisional && !isApprovedRule(rule) && (
        <Badge
          variant="secondary"
          className="text-warning border-warning-line bg-warning-muted"
          title="Learned by the engine before proposals existed; it has a Keep-this-rule card in Engine Activity."
        >
          Learned
        </Badge>
      )}
      {rule.metadata?.provenance === 'promoted' && (
        <Badge
          variant="secondary"
          className="text-success border-success-line bg-success-muted"
          title="Auto-promoted by the learning engine after proving itself."
        >
          Promoted
        </Badge>
      )}
    </>
  );
};

const describeRule = (rule: BadgeRule): string => `${rule.name} “${rule.pattern}”`;

/** The refusal the BE would give, said first: another department's open card must be decided. */
export const acceptBlockedBy = <T extends BadgeRule>(rule: T, rules: T[]): T | null =>
  acceptEffectsOf(rule, rules).blockedBy;

/** What switching this dormant rule on does, in words (D5: it is Accept). */
export const acceptDescription = <T extends BadgeRule>(
  rule: T,
  rules: T[],
  departmentName: (departmentId: number) => string
): string => {
  const { partner, declinedElsewhere } = acceptEffectsOf(rule, rules);
  const parts = ['This accepts the proposal: the rule starts routing mail now.'];
  if (partner) parts.push(`Its pair rule, ${describeRule(partner)}, is switched on with it.`);
  if (declinedElsewhere.length > 0) {
    const departments = [
      ...new Set(declinedElsewhere.map((other) => departmentName(other.departmentId))),
    ];
    parts.push(`The proposal for this pattern in ${departments.join(', ')} is declined.`);
  }
  if (ruleLifecycle(rule) === 'proposed' && proposalCardIdOf(rule, rules) !== null) {
    parts.push('Its card in Engine Activity is closed.');
  }
  return parts.join(' ');
};

const acceptTitle = (rule: BadgeRule): string => {
  const lifecycle = ruleLifecycle(rule);
  if (lifecycle === 'declined') return 'Bring back this declined rule?';
  if (lifecycle === 'archived') return 'Bring back this archived rule?';
  return 'Accept this proposal?';
};

export const AcceptFromRulesDialog = <T extends BadgeRule>({
  rule,
  rules,
  departmentName,
  onCancel,
  onAccept,
}: {
  rule: T | null;
  rules: T[];
  /** Read at render time: the list may load before the departments do. */
  departmentName: (departmentId: number) => string;
  onCancel: () => void;
  onAccept: (rule: T) => void;
}) => {
  const blocker = rule ? acceptBlockedBy(rule, rules) : null;
  const cardId = blocker?.metadata?.proposal?.suggestionId;
  return (
    <ConfirmDialog
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      onConfirm={() => {
        if (rule) onAccept(rule);
      }}
      title={rule ? acceptTitle(rule) : ''}
      description={
        rule && blocker ? (
          <>
            {departmentName(blocker.departmentId)} has an open proposal for this pattern — decide
            that card in Engine Activity first.{' '}
            {typeof cardId === 'number' && (
              <Link className="underline" to={`/settings?focus=${cardId}#ai/learning`}>
                Open the card
              </Link>
            )}
          </>
        ) : rule ? (
          acceptDescription(rule, rules, departmentName)
        ) : (
          ''
        )
      }
      confirmText="Accept"
      variant="info"
      hideConfirm={blocker !== null}
    />
  );
};
