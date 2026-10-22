import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pause } from 'lucide-react';
import { customerPauseText, type AiStatus } from './aiStatus';
import {
  AI_KEY_SETTINGS_PATH,
  STARTER_USED_ADMIN_TEXT,
  STARTER_USED_AGENT_TEXT,
  isStarterPaused,
} from './starterAllowance';

/**
 * Tells a workspace WHY its AI went quiet, and the way out. Shown only when the API says live AI
 * is paused (`ai.paused`); the words come from the API. Customers see messages wording; admins
 * read the API's own sentence (with the money). `not_in_plan` offers Upgrade or connecting an own AI
 * key (no pack — a pack cannot add AI the plan does not have); every other reason offers the
 * message pack (when `packAction` is given) and Upgrade.
 *
 * Free on our key with its starter allowance used up (`paused` + reason `free_allowance_used`;
 * `exhausted` alone is not a pause — an own-key Free workspace gets it too): admins read the
 * server's sentence with Add your AI key + Upgrade; agents read "ask your admin" with no buttons.
 * Without the reason (older backend) nothing changes.
 */
export const AiPausedBanner = ({
  ai,
  packAction,
  canOpenSubscription = true,
  isAdmin = false,
}: {
  ai: AiStatus | undefined;
  /** The "Buy 1,000 messages" control, built by the caller (a link or a checkout button). */
  packAction?: ReactNode;
  canOpenSubscription?: boolean;
  isAdmin?: boolean;
}) => {
  if (isStarterPaused(ai)) {
    return (
      <div
        data-testid="ai-paused-banner"
        data-reason="free_allowance_used"
        className="mb-3 flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-2 text-foreground">
          <Pause className="h-4 w-4 shrink-0 text-warning" />
          <span>
            {isAdmin ? (ai?.message ?? STARTER_USED_ADMIN_TEXT) : STARTER_USED_AGENT_TEXT}
          </span>
        </span>
        {isAdmin && (
          <span className="flex shrink-0 flex-wrap items-center gap-3">
            <Link to={AI_KEY_SETTINGS_PATH} className="font-medium text-primary hover:underline">
              Add your AI key
            </Link>
            {canOpenSubscription && (
              <Link to="/pricing" className="font-medium text-primary hover:underline">
                Upgrade
              </Link>
            )}
          </span>
        )}
      </div>
    );
  }
  if (!ai || !ai.paused || !ai.reason) return null;
  const notInPlan = ai.reason === 'not_in_plan';
  // Admins read the API's sentence (it carries the money); customers never see dollars.
  const text = isAdmin
    ? (ai.message ?? customerPauseText(ai.reason))
    : customerPauseText(ai.reason, canOpenSubscription);
  // Only an exhausted allowance is lifted by messages/upgrade; a server ceiling is text only.
  const hasWayOut = notInPlan || ai.reason === 'budget_used';
  return (
    <div
      data-testid="ai-paused-banner"
      data-reason={ai.reason}
      className="mb-3 flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2 text-foreground">
        <Pause className="h-4 w-4 shrink-0 text-warning" />
        <span>{text}</span>
      </span>
      {canOpenSubscription && hasWayOut && (
        <span className="flex shrink-0 flex-wrap items-center gap-3">
          {!notInPlan && packAction}
          <Link to="/pricing" className="font-medium text-primary hover:underline">
            Upgrade
          </Link>
          {notInPlan && (
            <Link
              to={AI_KEY_SETTINGS_PATH}
              className="font-medium text-primary hover:underline"
            >
              Connect your own AI key
            </Link>
          )}
        </span>
      )}
    </div>
  );
};
