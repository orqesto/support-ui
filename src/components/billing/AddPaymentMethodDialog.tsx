import { useCallback, useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { CheckoutSessionForm } from '@/components/billing/CheckoutSessionForm';
import { logger } from '@/lib/logger';
import { formatMoney } from '@/lib/money';
import {
  subscriptionService,
  type WizardCheckoutSession,
} from '@/services/subscription.service';

/**
 * Adding a card AFTER onboarding.
 *
 * The wizard's skip path has always promised "you can add a card any time from
 * Billing", and that was untrue: an org that finished without one has no Stripe
 * customer, so the billing portal refuses it, and the pricing page disables the
 * button for the plan the workspace is already on. There was no route to paying
 * for the plan you already have — only to switching to a different one.
 *
 * Uses the same checkout session the wizard uses, so the trial the workspace is
 * on is preserved rather than restarted, and the same
 * `checkout.session.completed` webhook finishes it.
 */
export const AddPaymentMethodDialog = ({
  open,
  onOpenChange,
  planName,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The plan the workspace is already on — this collects a card for it. */
  planName: string;
  /** Called after a successful add so the page can re-read its state. */
  onAdded: () => void;
}) => {
  const [session, setSession] = useState<WizardCheckoutSession | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setSession(null);
    setError(null);
    setDone(false);

    subscriptionService
      .createWizardCheckoutSession(planName)
      .then((created) => {
        if (cancelled) return;
        setSession(created);
        // The publishable key ships WITH the session so it can never belong to
        // a different Stripe account or mode than the key that created it.
        setStripePromise(loadStripe(created.publishableKey));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('Failed to create a checkout session for adding a card:', err);
        setError(
          (err as { status?: number } | null)?.status === 409
            ? 'This workspace already has a payment method on file. Use Billing & Invoices to change it.'
            : "We couldn't open the payment form right now. Please try again in a moment."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [open, planName]);

  const handleComplete = useCallback(() => {
    setDone(true);
    onAdded();
  }, [onAdded]);

  // What submitting actually DOES, in the customer's words.
  //
  // `trialEndsAt: null` means Stripe is charging on completion — either no
  // trial is recorded or too little of one remains for Stripe to accept it.
  // Saying "save a card, nothing changes" and then taking €500 is the kind of
  // surprise that becomes a chargeback rather than a support ticket, and
  // production runs on LIVE Stripe keys.
  // THREE cases, not two. `null` is the backend saying "Stripe charges on
  // completion". `undefined` is an older backend that does not report it at all
  // — treating that as "charged now" would warn about a charge that is not
  // happening, which is its own kind of lie.
  const chargedNow = session?.trialEndsAt === null;
  const billsFrom = typeof session?.trialEndsAt === 'string' ? session.trialEndsAt : null;
  const priceLabel = session
    ? formatMoney(session.plan.price, session.plan.currency)
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" dismissOnOverlayClick={false}>
      <DialogHeader>
        <DialogTitle>Add a payment method</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {done ? (
          <Alert variant="success">
            {chargedNow
              ? `Payment method saved and ${priceLabel} charged for ${session?.plan.displayName}.`
              : 'Payment method saved. Nothing about your current plan or trial changes.'}
          </Alert>
        ) : error ? (
          <Alert variant="warning">{error}</Alert>
        ) : !session || !stripePromise ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {chargedNow ? (
              <Alert variant="warning">
                {`Your trial has ended, so saving a card charges ${priceLabel} for ${session.plan.displayName} now.`}
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">
                {billsFrom
                  ? `Nothing is charged today — your ${session.plan.displayName} plan continues on its current terms, and we bill from ${new Date(
                      billsFrom
                    ).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}.`
                  : `Nothing is charged today — your ${session.plan.displayName} plan continues on its current terms.`}
              </p>
            )}
            <CheckoutSessionForm
            session={session}
            stripePromise={stripePromise}
            onComplete={handleComplete}
              submitLabel={chargedNow ? `Pay ${priceLabel} and save card` : 'Save payment method'}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
