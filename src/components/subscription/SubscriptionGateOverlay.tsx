import { AlertTriangle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';

/**
 * Full-screen overlay shown when the backend gates the org with a 402
 * (inactive/expired subscription). Replaces the silently-broken blank screens a
 * gated user would otherwise see with a clear explanation + a path to renew.
 *
 * Hidden on the billing routes (`/subscription`, `/pricing`) — their API is exempt from
 * the subscription gate, so the user can see their status there and choose a plan. A
 * workspace with no active plan can move itself to Free from `/pricing` (2026-09-24).
 * The gate clears on reload (store is not persisted), so once an admin reactivates
 * the org, "Reload" brings the app back.
 */
export function SubscriptionGateOverlay() {
  const gated = useSubscriptionGateStore((state) => state.gated);
  const message = useSubscriptionGateStore((state) => state.message);
  const code = useSubscriptionGateStore((state) => state.code);
  const canChoosePlan = useSubscriptionGateStore((state) => state.canChoosePlan);
  const logout = useAuthStore((state) => state.logout);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Let users reach the billing pages (exempt from the gate): status, and choosing a plan.
  if (!gated || pathname.startsWith('/subscription') || pathname.startsWith('/pricing')) {
    return null;
  }

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  // Task #8: the trial ended and the backend said who may choose. Only an org admin can switch the
  // plan — anyone else gets "an admin needs to choose", never a "Choose a plan" button that can
  // only answer "access denied". Unknown (an older backend) keeps the original screen.
  const trialEnded = code === 'SUBSCRIPTION_TRIAL_EXPIRED' && canChoosePlan !== null;
  const waitingForAdmin = trialEnded && canChoosePlan === false;
  const title = trialEnded ? 'Your free trial has ended' : 'Subscription inactive';
  const explanation = !trialEnded
    ? "Access is paused until the workspace has an active plan. Choose one — Free included, with Free's limits — or contact us. Once it's active again, reload to continue."
    : waitingForAdmin
      ? "An admin of this workspace has been asked to choose a plan. Incoming messages are still received; nothing is lost. Once a plan is chosen, reload to continue."
      : "Choose how to continue: a paid plan with a card, or Free with Free's limits. Incoming messages are still received; nothing is lost.";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="subscription-gate-title"
      className="flex fixed inset-0 z-[100] justify-center items-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <div className="p-6 w-full max-w-md rounded-lg border shadow-lg bg-card border-border">
        <div className="flex gap-3 items-center mb-3">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <h2 id="subscription-gate-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
        </div>

        <p className="mb-2 text-sm text-muted-foreground">{message}</p>
        <p className="mb-5 text-sm text-muted-foreground">{explanation}</p>

        <div className="flex flex-wrap gap-2">
          {!waitingForAdmin && (
            <>
              <Button onClick={() => navigate('/pricing')}>Choose a plan</Button>
              <Button variant="outline" onClick={() => navigate('/subscription')}>
                View billing
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
