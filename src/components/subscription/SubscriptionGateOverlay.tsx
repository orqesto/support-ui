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
 * Hidden on the billing route (`/subscription`) — that route's API is exempt from
 * the subscription gate, so the user can still view their plan / status there.
 * The gate clears on reload (store is not persisted), so once an admin reactivates
 * the org, "Reload" brings the app back.
 */
export function SubscriptionGateOverlay() {
  const gated = useSubscriptionGateStore((state) => state.gated);
  const message = useSubscriptionGateStore((state) => state.message);
  const logout = useAuthStore((state) => state.logout);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Let users reach the billing page (exempt from the gate) to see their status.
  if (!gated || pathname.startsWith('/subscription')) {
    return null;
  }

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

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
          <h2 id="subscription-gate-title" className="text-lg font-semibold">
            Subscription inactive
          </h2>
        </div>

        <p className="mb-2 text-sm text-muted-foreground">{message}</p>
        <p className="mb-5 text-sm text-muted-foreground">
          Access is paused until the subscription is renewed. Please contact us to reactivate your
          organization — once it&apos;s active again, reload to continue.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/subscription')}>View billing</Button>
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
