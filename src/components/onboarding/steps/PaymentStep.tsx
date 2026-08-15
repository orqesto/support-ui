import { useCallback, useEffect, useRef, useState } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { subscriptionService, type WizardCheckoutSession } from '@/services/subscription.service';
import { logger } from '@/lib/logger';

interface PaymentStepProps {
  /** Plan slug preselected on the marketing site — `starter` or `pro`. */
  planName: string;
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
 * Optional last step — put a card on file for the plan picked on the marketing
 * site, without paying today.
 *
 * The Stripe subscription is created with a trial, so completing this collects a
 * payment method and converts automatically at the end of the trial. Skipping is
 * a first-class outcome: the org keeps the trial it already has, which is what
 * keeps the site's "no card required" promise true.
 *
 * Uses Stripe's EMBEDDED Checkout (`redirect_on_completion: 'never'` on the BE)
 * so the user is never thrown to another domain mid-onboarding. The publishable
 * key ships with the session rather than from an env var, so it can't belong to
 * a different Stripe account or mode than the key that created it.
 */
export const PaymentStep = ({ planName, onPaidChange }: PaymentStepProps) => {
  const [session, setSession] = useState<WizardCheckoutSession | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  // Stripe mounts an iframe keyed on clientSecret; re-creating the session on a
  // re-render would tear it down mid-typing, so this runs exactly once.
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    let cancelled = false;
    subscriptionService
      .createWizardCheckoutSession(planName)
      .then((created) => {
        if (cancelled) return;
        setSession(created);
        setStripePromise(loadStripe(created.publishableKey));
      })
      .catch((err: unknown) => {
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
  }, [planName]);

  const handleComplete = useCallback(() => {
    setPaid(true);
    onPaidChange?.(true);
  }, [onPaidChange]);

  if (error) {
    return <Alert variant="warning">{error}</Alert>;
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

  if (!session || !stripePromise) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {`${session.plan.displayName} · ${formatPrice(session.plan.price, session.plan.currency)}/${session.plan.billingInterval}. `}
        <span className="font-medium text-foreground">
          {`Your trial is free until ${trialEndDate(session.trialPeriodDays)}`}
        </span>
        {` — nothing is charged today, and you can cancel before then. Prefer to decide later? Skip this step; you can add a card any time from Billing.`}
      </p>

      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ clientSecret: session.clientSecret, onComplete: handleComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
};
