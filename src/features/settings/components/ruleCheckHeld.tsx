import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { usePermissions } from '@/hooks/usePermissions';
import { AI_KEY_SETTINGS_PATH } from '@/lib/starterAllowance';
import { Permission } from '@/types/roles';

/**
 * The keyword rules screen's notice for a workspace whose AI is paused: every rule reply is
 * checked by AI before it is sent, and while the backend refuses that check as a standing state
 * (GET /api/ai/providers `ruleChecks`) no rule reply is sent — each one is held for a person.
 * The rules still look switched on, so the screen says it.
 *
 * Only standing states are told here. A check that fails once (the provider rejects the call, an
 * outage, a timeout) is no state of the workspace: the backend reports none for it and nothing is
 * shown; the held reply and its reason are in the automatic-replies audit view.
 */
export const AI_PAUSED_FOR_RULES =
  'AI is paused for this workspace, so keyword rule replies are not sent: each one is held for a person.';

/** Why, per backend reason. A reason this bundle does not know gets the lead sentence alone. */
const WHY: Record<string, string> = {
  trial_ended: 'The trial has ended and no plan is chosen yet.',
  plan_lapsed: 'The subscription is not active.',
  free_allowance_used: 'The free AI allowance is used up.',
  not_in_plan: 'AI is not included in the plan.',
  budget_used:
    "This period's AI allowance is used up: rule replies are sent again when the period resets or the allowance grows.",
  server_ceiling:
    "This server's AI limit for the month is reached: rule replies are sent again when it resets.",
  limit_reached:
    "This workspace's AI limit is reached: rule replies are sent again when it resets or is raised.",
};

const linkClass = 'font-medium underline';

/**
 * The way out for someone who can take it, else whom to ask; null where the viewer has nothing
 * to do (a server or workspace limit resets on its own or is raised by whoever runs the server).
 */
const useWayOut = (reason: string): ReactNode => {
  const { hasPermission } = usePermissions();
  const { data: backendVersion } = useBackendVersion();
  const canAddKey = hasPermission(Permission.MANAGE_INTEGRATIONS);
  const canOpenSubscription = hasPermission(Permission.VIEW_SUBSCRIPTION);
  // Plans and messages are bought only where the deployment sells them: the pricing and
  // subscription pages send everyone else back to the dashboard. Unknown = not offered.
  const sells = backendVersion?.billingEnabled === true;
  switch (reason) {
    case 'trial_ended':
    case 'plan_lapsed':
      if (!sells) return null;
      return canOpenSubscription ? (
        <Link to="/pricing" className={linkClass}>
          Choose a plan
        </Link>
      ) : (
        'Ask a workspace admin to choose a plan.'
      );
    case 'free_allowance_used':
    case 'not_in_plan':
      if (!canAddKey && !(sells && canOpenSubscription)) {
        return sells
          ? 'Ask a workspace admin to add an AI key or upgrade.'
          : 'Ask a workspace admin to add an AI key.';
      }
      return (
        <>
          {canAddKey && (
            <Link to={AI_KEY_SETTINGS_PATH} className={linkClass}>
              Add your own AI key
            </Link>
          )}
          {canAddKey && sells && canOpenSubscription && ' · '}
          {sells && canOpenSubscription && (
            <Link to="/pricing" className={linkClass}>
              Upgrade
            </Link>
          )}
        </>
      );
    case 'budget_used':
      if (!sells) return null;
      return canOpenSubscription ? (
        <Link to="/subscription" className={linkClass}>
          Buy more messages or upgrade
        </Link>
      ) : (
        'Ask a workspace admin to buy more messages or upgrade.'
      );
    default:
      return null;
  }
};

export const RuleRepliesPausedNotice = ({ reason }: { reason: string }) => {
  const wayOut = useWayOut(reason);
  // Only a reason this bundle lists: a server string is never looked up on the prototype.
  const why = Object.hasOwn(WHY, reason) ? WHY[reason] : undefined;
  return (
    // A notice that stays, with a link in it: a labelled status, not an interrupting alert.
    <Alert variant="warning" role="status" label="Keyword rule replies are held">
      {AI_PAUSED_FOR_RULES}
      {why ? ` ${why}` : ''}
      {wayOut && <> {wayOut}</>}
    </Alert>
  );
};
