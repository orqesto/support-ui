import { useQuery } from '@tanstack/react-query';
import { MessageSquareOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { usePermissions } from '@/hooks/usePermissions';
import { subscriptionService } from '@/services/subscription.service';
import { AiPausedBanner } from '@/components/subscription/AiPausedBanner';
import { AiUnavailableNotice } from '@/components/subscription/AiUnavailableNotice';
import { KbPausedBanner } from '@/components/subscription/KbPausedBanner';
import { useAuthStore } from '@/stores/authStore';
import { isOrgAdminOrHigher, Permission } from '@/types/roles';

/**
 * Shown to every member once the workspace has used its message allowance for the
 * period. Owner decision 2026-09-04 (soft degradation): mail keeps arriving and agents
 * keep replying; only managed AI — analysis, routing, drafts, auto-replies — pauses.
 * Without this line the inbox simply goes quiet on the AI side and nobody knows why.
 *
 * Two doors out, both on the Subscription page: upgrade the plan, or buy a message
 * pack (when the backend says one can be bought — trialing and lapsed workspaces get
 * upgrade only; Free can buy one since 2026-09-24). Hidden on /subscription, which already shows the full picture, and
 * on deployments without billing, where there is no cap to explain.
 *
 * Polled lazily (5-minute staleness): the cap flips at most a few times a month and
 * the count is read from a row the backend already keeps.
 */
export const MessageCapBanner = () => {
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const user = useAuthStore((state) => state.user);
  const { data: backendVersion } = useBackendVersion();
  const billingEnabled = backendVersion?.billingEnabled ?? false;

  const { data: usage } = useQuery({
    queryKey: ['usage-current', selectedOrganizationId],
    queryFn: subscriptionService.getUsage,
    // Not on /subscription: the banner is hidden there and the page reads the same endpoint itself
    // (one request, not two).
    enabled: billingEnabled && !location.pathname.startsWith('/subscription'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!billingEnabled) return null;
  if (location.pathname.startsWith('/subscription')) return null;
  if (!usage) return null;

  const canOpenSubscription = hasPermission(Permission.VIEW_SUBSCRIPTION);
  const packOnOffer = usage.messagePack?.available === true;
  const isAdmin = !!user && isOrgAdminOrHigher(user.role, user.organizationRole);

  // AI paused (allowance used up, not in plan…): the API says why; that banner covers the
  // message-cap case too, so the two never stack.
  if (usage.ai?.paused) {
    return (
      <AiPausedBanner
        ai={usage.ai}
        canOpenSubscription={canOpenSubscription}
        isAdmin={isAdmin}
        packAction={
          packOnOffer ? (
            <Link to="/subscription" className="font-medium text-primary hover:underline">
              Buy {usage.messagePack?.messages.toLocaleString()} messages
            </Link>
          ) : undefined
        }
      />
    );
  }

  // Admin-only here (they can act on it; the Subscription page shows everyone): the KB allowance
  // used up (live mail still fine), or no AI at all on a Free workspace (verify email / own key).
  const aiNotices = isAdmin ? (
    <>
      <KbPausedBanner ai={usage.ai} isAdmin />
      <AiUnavailableNotice ai={usage.ai} isAdmin />
    </>
  ) : null;

  if (usage.limits.messages <= 0 || usage.current.messages < usage.limits.messages) {
    return aiNotices;
  }

  const resetDay = usage.period
    ? new Date(usage.period.end).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : null;

  return (
    <>
      {aiNotices}
      <div
        data-testid="message-cap-banner"
        className="mb-3 flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-2 text-foreground">
          <MessageSquareOff className="h-4 w-4 text-warning" />
          <span>
            Message allowance used up
            {resetDay ? ` until ${resetDay}` : ''}. New messages still arrive and you can reply; AI
            analysis, routing and drafts are paused.
          </span>
        </span>
        {canOpenSubscription && (
          <span className="flex shrink-0 items-center gap-3">
            <Link to="/pricing" className="font-medium text-primary hover:underline">
              Upgrade
            </Link>
            {packOnOffer && (
              <Link to="/subscription" className="font-medium text-primary hover:underline">
                Buy {usage.messagePack?.messages.toLocaleString()} messages
              </Link>
            )}
          </span>
        )}
      </div>
    </>
  );
};
