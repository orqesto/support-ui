import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { subscriptionService } from '@/services/subscription.service';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

// Statuses that keep a plan in force (BE dbEntitlement: trialing, active, past_due).
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

type PlanState = { name?: string; displayName?: string; status?: string };

/**
 * What the payment step shows when Free is the chosen card. Never opens a checkout.
 *
 * - Already on Free: says so — nothing to do, no card.
 * - On a paid plan: points to Change plan; the wizard never downgrades a paid plan.
 * - No plan in force (none, expired, cancelled): "Start on Free" puts the workspace on Free. This
 *   is the way out of "This workspace has no active plan — choose one (Free included)".
 */
export const FreePlanPanel = () => {
  const [state, setState] = useState<PlanState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The wizard's Database/Finish gates read the onboarding store; refresh it after a plan change.
  const refreshOnboarding = useOnboardingStore((store) => store.refresh);

  useEffect(() => {
    let cancelled = false;
    void subscriptionService.getPlanState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  const live = state.status !== undefined && LIVE_STATUSES.includes(state.status);

  if (live && state.name === 'free') {
    return (
      <Alert variant="success">
        You&rsquo;re on Free — no card needed, for as long as you like. On Free, AI runs on your own
        key, plus a one-time starter allowance. Upgrade any time from Subscription.
      </Alert>
    );
  }

  if (live && state.name) {
    return (
      <Alert variant="info">
        {`This workspace is on ${state.displayName ?? state.name}. To move to Free, use Subscription › Change plan.`}
      </Alert>
    );
  }

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await subscriptionService.chooseFree();
      setState(await subscriptionService.getPlanState());
      await refreshOnboarding();
    } catch (err) {
      logger.error('Failed to start the Free plan from onboarding:', err);
      setError(getApiErrorMessage(err) ?? "Couldn't start Free right now. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This workspace has no plan yet. Start on Free — no card needed, and you can upgrade any time
        from Subscription. On Free, AI runs on your own key, plus a one-time starter allowance.
      </p>
      {error && <Alert variant="warning">{error}</Alert>}
      <Button className="w-full" onClick={() => void start()} isLoading={starting}>
        Start on Free
      </Button>
    </div>
  );
};
