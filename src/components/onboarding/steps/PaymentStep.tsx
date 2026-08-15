import { useCallback, useEffect, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Check } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import {
  subscriptionService,
  type SubscriptionPlan,
  type WizardCheckoutSession,
} from '@/services/subscription.service';
import { PAID_PLANS } from '../wizardSteps';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface PaymentStepProps {
  /** Plan to open on — from the marketing site, or the recommended default. */
  initialPlan: string;
  /** True when the plan came from the marketing site rather than our default. */
  planWasPreselected: boolean;
  /** Reported up so the wizard can swap its footer copy once a card is on file. */
  onPaidChange?: (paid: boolean) => void;
}

const formatPrice = (amountInCents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amountInCents / 100);

const trialEndDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Optional last step — put a card on file, without paying today.
 *
 * The Stripe subscription is created with a trial, so completing this collects a
 * payment method and converts automatically at the end of the trial. Skipping is
 * a first-class outcome: the org keeps the trial it already has, which is what
 * keeps the site's "no card required" promise true.
 *
 * Signups that arrived with a plan from the marketing site open on that plan.
 * Everyone else gets a selector defaulted to the recommended tier — asked HERE,
 * at the end, once they have configured the product and seen it work, rather
 * than on the signup form where the choice would mean nothing yet (every trial
 * gets the same full experience regardless of plan).
 *
 * Uses Stripe's EMBEDDED Checkout (`redirect_on_completion: 'never'` on the BE)
 * so the user is never thrown to another domain mid-onboarding. The publishable
 * key ships with the session rather than from an env var, so it can't belong to
 * a different Stripe account or mode than the key that created it.
 */
export const PaymentStep = ({
  initialPlan,
  planWasPreselected,
  onPaidChange,
}: PaymentStepProps) => {
  const [chosenPlan, setChosenPlan] = useState(initialPlan);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [session, setSession] = useState<WizardCheckoutSession | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  // Set when the BE reports the workspace is already subscribed (409).
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  // Only needed for the selector; a preselected plan skips the round-trip.
  useEffect(() => {
    if (planWasPreselected) return;
    let cancelled = false;
    subscriptionService
      .getPlans()
      .then((all) => {
        if (!cancelled) setPlans(all.filter((plan) => PAID_PLANS.includes(plan.name)));
      })
      .catch((err: unknown) => {
        // Non-fatal: fall back to checking out on the default plan.
        logger.error('Failed to load plans for the onboarding payment step:', err);
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [planWasPreselected]);

  // A Checkout session is bound to one plan, so switching plans needs a new one.
  // Keyed on chosenPlan rather than run-once for that reason; the provider below
  // is keyed on the client secret so Stripe's iframe remounts cleanly.
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError(null);
    setAlreadySubscribed(false);

    subscriptionService
      .createWizardCheckoutSession(chosenPlan)
      .then((created) => {
        if (cancelled) return;
        setSession(created);
        setStripePromise(loadStripe(created.publishableKey));
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        // 409 = this workspace already has a live subscription, which is what
        // the BE returns after a card has been added. Remounting the step (Back
        // → Next, or a refresh) resets the local `paid` flag and re-requests a
        // session, so without this branch a customer who JUST paid successfully
        // is told the payment form failed.
        if ((err as { status?: number } | null)?.status === 409) {
          setAlreadySubscribed(true);
          onPaidChange?.(true);
          return;
        }

        logger.error('Failed to create onboarding checkout session:', err);
        // Never block finishing setup on a billing failure — the step is
        // optional and the org already has a working trial.
        setError(
          "We couldn't load the payment form right now. You can finish setup and add a card later from Billing."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [chosenPlan, onPaidChange]);

  const handleComplete = useCallback(() => {
    setPaid(true);
    onPaidChange?.(true);
  }, [onPaidChange]);

  if (alreadySubscribed) {
    return (
      <Alert variant="success">
        A payment method is already on file for this workspace — nothing more to do here. You can
        review or change it any time from Billing.
      </Alert>
    );
  }

  if (paid && session) {
    return (
      <Alert variant="success">
        {`Card saved for ${session.plan.displayName}. Your trial stays free until ${trialEndDate(
          session.trialPeriodDays
        )} — we'll only charge ${formatPrice(session.plan.price, session.plan.currency)} then, and you can cancel any time before.`}
      </Alert>
    );
  }

  const selectable = !planWasPreselected && plans && plans.length > 1;

  return (
    <div className="space-y-4">
      {selectable && (
        <div className="grid grid-cols-2 gap-3">
          {plans.map((plan) => {
            const active = plan.name === chosenPlan;
            return (
              /* Same selectable-card pattern as the AI and Storage steps. */
              <button
                key={plan.name}
                type="button"
                aria-pressed={active}
                onClick={() => setChosenPlan(plan.name)}
                className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card
                  className={cn(
                    'h-full cursor-pointer transition-colors hover:border-primary/60',
                    active && 'border-primary ring-2 ring-primary'
                  )}
                >
                  <CardContent className="space-y-1 p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{plan.displayName}</span>
                      {active && <Check className="ml-auto h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {`${formatPrice(plan.price, plan.currency)}/${plan.billingInterval}`}
                    </p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <Alert variant="warning">{error}</Alert>
      ) : !session || !stripePromise ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {`${session.plan.displayName} · ${formatPrice(session.plan.price, session.plan.currency)}/${session.plan.billingInterval}. `}
            <span className="font-medium text-foreground">
              {`Your trial is free until ${trialEndDate(session.trialPeriodDays)}`}
            </span>
            {` — nothing is charged today, and you can cancel before then. Prefer to decide later? Skip this step; you can add a card any time from Billing.`}
          </p>

          <EmbeddedCheckoutProvider
            key={session.clientSecret}
            stripe={stripePromise}
            options={{ clientSecret: session.clientSecret, onComplete: handleComplete }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </>
      )}
    </div>
  );
};
