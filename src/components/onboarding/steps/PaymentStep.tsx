import { useCallback, useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Check } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { CheckoutSessionForm } from '@/components/billing/CheckoutSessionForm';
import { Card, CardContent } from '@/components/ui/Card';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Spinner } from '@/components/ui/Spinner';
import {
  subscriptionService,
  type SubscriptionPlan,
  type WizardCheckoutSession,
} from '@/services/subscription.service';
import { SALES_CONTACT_URL } from '@/lib/config';
import { PAID_PLANS, SALES_ASSISTED_PLAN } from '../wizardSteps';
import { formatFeatureAdditions, planFeatureAdditions, planLimitLines } from '../planSummary';
import { logger } from '@/lib/logger';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

interface PaymentStepProps {
  /** Plan to open on — from the marketing site, or the recommended default. */
  initialPlan: string;
  /** True when the plan came from the marketing site rather than our default. */
  planWasPreselected: boolean;
  /** Reported up so the wizard can swap its footer copy once a card is on file. */
  onPaidChange?: (paid: boolean) => void;
}

const formatDay = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * When the customer is actually charged.
 *
 * The backend now reports this, because computing "today + trialPeriodDays"
 * here was wrong for anyone finishing the wizard after day 0 — it promised a
 * trial end later than the one the workspace actually has. The fallback keeps
 * the old (approximate) behaviour against a backend that does not send it yet.
 */
const chargeDate = (session: WizardCheckoutSession): string | null => {
  if (session.trialEndsAt === null) return null;
  if (session.trialEndsAt) return formatDay(session.trialEndsAt);

  // Only reachable against a backend that predates the trial anchoring. It
  // sends `trialPeriodDays` and no `trialEndsAt`, and this reproduces its old
  // (approximate) answer. Guarded rather than assumed: adding `undefined` to a
  // date yields "Invalid Date", which would be printed at a customer on the
  // screen that takes money.
  if (typeof session.trialPeriodDays !== 'number') return null;
  const approximate = new Date();
  approximate.setDate(approximate.getDate() + session.trialPeriodDays);
  return formatDay(approximate);
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
  // The FULL catalog: the sellable tiers are a slice of it, and the
  // sales-assisted tier is read from it too so its price is never hardcoded.
  const [catalog, setCatalog] = useState<SubscriptionPlan[] | null>(null);
  const [session, setSession] = useState<WizardCheckoutSession | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // Set when the BE reports the workspace is already subscribed (409).
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  // Only needed for the selector; a preselected plan skips the round-trip.
  useEffect(() => {
    if (planWasPreselected) return;
    let cancelled = false;
    subscriptionService
      .getPlans()
      .then((all) => {
        if (!cancelled) setCatalog(all);
      })
      .catch((err: unknown) => {
        // Non-fatal: fall back to checking out on the default plan.
        logger.error('Failed to load plans for the onboarding payment step:', err);
        if (!cancelled) setCatalog([]);
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
          "We couldn't load the payment form right now. You can finish setup and sort billing out later from Billing."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [chosenPlan, onPaidChange]);

  const handleComplete = useCallback(() => {
    // Close first: the success alert replaces this whole step, so leaving the
    // dialog mounted would stack a confirmation behind a modal.
    setFormOpen(false);
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
        {chargeDate(session)
          ? `Card saved for ${session.plan.displayName}. Your trial stays free until ${chargeDate(
              session
            )} — we'll only charge ${formatMoney(session.plan.price, session.plan.currency)} then, and you can cancel any time before.`
          : `Card saved for ${session.plan.displayName}. Your trial has run out, so ${formatMoney(
              session.plan.price,
              session.plan.currency
            )} is charged now — you can cancel any time.`}
      </Alert>
    );
  }

  // Plans arrive ordered by price, so a tier's "previous" plan is simply the one
  // before it — which is what makes the "adds ..." line a delta over the tier below.
  const sellable = catalog?.filter((plan) => PAID_PLANS.includes(plan.name)) ?? null;
  const selectable = !planWasPreselected && sellable && sellable.length > 1;
  const salesAssisted = catalog?.find((plan) => plan.name === SALES_ASSISTED_PLAN);

  return (
    <div className="space-y-4">
      {selectable && (
        /* Tiers stack on narrow viewports; the grid tracks the catalog so a
           deploy missing a tier never renders a hole. */
        <div
          className={cn(
            'grid grid-cols-1 gap-3',
            sellable.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
          )}
        >
          {sellable.map((plan, index) => {
            const active = plan.name === chosenPlan;
            const additions = formatFeatureAdditions(
              planFeatureAdditions(plan, sellable[index - 1])
            );
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
                      {`${formatMoney(plan.price, plan.currency)}/${plan.billingInterval}`}
                    </p>
                    <ul className="space-y-0.5 pt-2 text-xs text-muted-foreground">
                      {planLimitLines(plan).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {additions && <p className="pt-1 text-xs text-foreground/80">{additions}</p>}
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* The sales-assisted tier is shown but deliberately NOT selectable — it has
          no Stripe price and provisions a separate single-tenant installation, so
          a card that looked buyable would be a lie. Its price comes from the same
          catalog response as the tiers above, so it cannot drift from billing. */}
      {selectable && salesAssisted && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {`${salesAssisted.displayName} · ${formatMoney(salesAssisted.price, salesAssisted.currency)}/${salesAssisted.billingInterval}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Run it on your own infrastructure, with your own AI keys and storage. Set up with
                us — it is not bought online.
              </p>
            </div>
            <ExternalLink href={SALES_CONTACT_URL}>Talk to us</ExternalLink>
          </CardContent>
        </Card>
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
            {`${session.plan.displayName} · ${formatMoney(session.plan.price, session.plan.currency)}/${session.plan.billingInterval}. `}
            {chargeDate(session) ? (
              <>
                <span className="font-medium text-foreground">
                  {`Your trial is free until ${chargeDate(session)}`}
                </span>
                {` — nothing is charged today, and you can cancel before then. Prefer to decide later? Skip this step and set billing up any time from Billing.`}
              </>
            ) : (
              <>
                {/* No trial left to promise. Saying "free until <date>" here and
                    then charging today is the surprise that produces a
                    chargeback rather than a support ticket. */}
                <span className="font-medium text-foreground">
                  {`${formatMoney(session.plan.price, session.plan.currency)} is charged today`}
                </span>
                {` — your trial has run out. You can cancel any time.`}
              </>
            )}
          </p>

          {/* The form opens in a dialog rather than sitting in the step.
              Embedded Checkout renders light regardless of our theme and cannot
              be styled from here, so inline it was a white slab in the middle of
              a dark page. A modal is expected to carry its own surface, which
              turns that from a defect into a deliberate payment sheet — and it
              makes this identical to the Billing page's flow instead of being a
              second, different way to do the same thing. */}
          <Button className="w-full" onClick={() => setFormOpen(true)}>
            {chargeDate(session)
              ? 'Add payment method'
              : `Pay ${formatMoney(session.plan.price, session.plan.currency)} and save card`}
          </Button>

          <Dialog open={formOpen} onOpenChange={setFormOpen} size="lg">
            <DialogHeader>
              <DialogTitle>{`Start your ${session.plan.displayName} plan`}</DialogTitle>
            </DialogHeader>
            <DialogContent>
              <CheckoutSessionForm
                session={session}
                stripePromise={stripePromise}
                onComplete={handleComplete}
                submitLabel={`Start ${session.plan.displayName} trial`}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};
