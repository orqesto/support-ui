import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '@/services/subscription.service';
import { useAuthStore } from '@/stores/authStore';

type Kind = 'users' | 'mailboxes';

/**
 * A workspace above its plan's user or mailbox count (a downgrade or an ended trial — owner
 * decision 3, 2026-10-23): what exists keeps working, nothing new can be added. Undefined at or
 * under the limit, or when there is no positive limit (unknown / no limit).
 */
export const overPlanLimitText = (
  kind: Kind,
  current: number | undefined,
  limit: number | undefined,
  planName: string | undefined
): string | undefined => {
  if (typeof current !== 'number' || typeof limit !== 'number') return undefined;
  if (!(limit > 0) || current <= limit) return undefined;
  const plan = planName === 'free' ? 'Free includes' : 'your plan includes';
  return `Your workspace keeps its existing ${kind}; ${plan} ${limit.toLocaleString()}. Upgrade to add more.`;
};

/**
 * The note, from `/api/usage/current` (`current` / `limits`: users, and integrations for the
 * mailboxes and channels) and the plan name. A failed read shows nothing.
 */
export const PlanOverLimitNote = ({ kind }: { kind: Kind }) => {
  const orgId = useAuthStore((state) => state.selectedOrganizationId);
  const { data } = useQuery({
    queryKey: ['plan-over-limit', orgId],
    queryFn: async () => {
      const [usage, planName] = await Promise.all([
        subscriptionService.getUsage(),
        subscriptionService.getPlanName(),
      ]);
      return { usage, planName };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const field = kind === 'users' ? 'users' : 'integrations';
  const text = overPlanLimitText(
    kind,
    data?.usage?.current?.[field],
    data?.usage?.limits?.[field],
    data?.planName
  );
  if (!text) return null;
  return (
    <p className="text-sm text-warning" data-testid={`over-limit-${kind}`}>
      {text}
    </p>
  );
};
