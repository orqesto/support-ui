import { useEffect, useRef, useState } from 'react';
import type { Stripe, StripeCheckoutElementsSdk } from '@stripe/stripe-js';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useTheme } from '@/contexts/ThemeContext';
import { logger } from '@/lib/logger';
import { buildStripeAppearance } from './stripeAppearance';

/**
 * The payment form, built from Stripe Elements so it wears OUR theme.
 *
 * Replaces embedded Checkout on this step. Embedded Checkout is a cross-origin
 * iframe whose options carry no appearance hook, so it rendered as a white
 * panel with a green button on a dark page and ignored the theme toggle
 * entirely. Elements exposes `changeAppearance`, which is what lets the form
 * follow the toggle live rather than only at mount.
 *
 * What did NOT change: the session behind this is the same Checkout Session,
 * with the same price, trial, promotion codes, customer and metadata. Only the
 * surface the customer looks at is different, so the `checkout.session.completed`
 * webhook still finishes the upgrade exactly as before.
 */

type ElementsCheckoutProps = {
  stripe: Stripe;
  clientSecret: string;
  /** Called once the payment is confirmed and no redirect was required. */
  onComplete: () => void;
  /** Label for the submit button — the caller knows the plan and trial wording. */
  submitLabel: string;
};

export const ElementsCheckout = ({
  stripe,
  clientSecret,
  onComplete,
  submitLabel,
}: ElementsCheckoutProps) => {
  const { theme } = useTheme();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sdkRef = useRef<StripeCheckoutElementsSdk | null>(null);

  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount once per client secret. Keyed that way by the caller, so a plan change
  // remounts the whole component rather than mutating a live Stripe session.
  useEffect(() => {
    let cancelled = false;
    const container = mountRef.current;
    if (!container) return;

    const sdk = stripe.initCheckoutElementsSdk({
      clientSecret,
      elementsOptions: { appearance: buildStripeAppearance(theme) },
    });
    sdkRef.current = sdk;

    const paymentElement = sdk.createPaymentElement();
    paymentElement.mount(container);
    if (!cancelled) setReady(true);

    return () => {
      cancelled = true;
      // Unmount explicitly: React removes our container, but the Element holds
      // its own iframe and listeners which would otherwise leak across remounts.
      try {
        paymentElement.unmount();
      } catch (err) {
        logger.warn('Stripe payment element failed to unmount', err);
      }
      sdkRef.current = null;
    };
    // `theme` is deliberately absent — a theme change must NOT tear down a form
    // the customer is halfway through typing into. It is applied below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, clientSecret]);

  // Re-theme in place. This is the whole reason for the migration: the form
  // follows the light/dark toggle without losing entered card details.
  useEffect(() => {
    sdkRef.current?.changeAppearance(buildStripeAppearance(theme));
  }, [theme]);

  const handleSubmit = async () => {
    const sdk = sdkRef.current;
    if (!sdk) return;

    setSubmitting(true);
    setError(null);
    try {
      const loaded = await sdk.loadActions();
      if (loaded.type === 'error') {
        setError(loaded.error.message);
        return;
      }

      // `if_required` keeps the customer on the wizard unless their bank
      // insists on a redirect for authentication — the same "never leave the
      // app mid-onboarding" property embedded Checkout gave us.
      const result = await loaded.actions.confirm({ redirect: 'if_required' });
      if (result.type === 'error') {
        setError(result.error.message);
        return;
      }

      onComplete();
    } catch (err) {
      logger.error('Stripe confirmation threw:', err);
      setError('We could not confirm that payment method. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div ref={mountRef} />

      {!ready && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {ready && (
        <Button
          className="w-full"
          isLoading={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
};

/**
 * Resolves the Stripe promise before mounting.
 *
 * `loadStripe` hands back a promise, but the Elements SDK is initialised
 * imperatively and needs the real instance. Keeping the await here means
 * `ElementsCheckout` itself never has to reason about a half-loaded Stripe.
 */
export const ElementsCheckoutMount = ({
  stripePromise,
  clientSecret,
  onComplete,
  submitLabel,
}: {
  stripePromise: Promise<Stripe | null>;
  clientSecret: string;
  onComplete: () => void;
  submitLabel: string;
}) => {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    stripePromise
      .then((instance) => {
        if (cancelled) return;
        if (instance) setStripe(instance);
        else setFailed(true);
      })
      .catch((err: unknown) => {
        logger.error('Stripe.js failed to load:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [stripePromise]);

  if (failed) {
    return (
      <Alert variant="warning">
        We couldn&apos;t load the payment form right now. You can finish setup and add a card
        later from Billing.
      </Alert>
    );
  }

  if (!stripe) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <ElementsCheckout
      stripe={stripe}
      clientSecret={clientSecret}
      onComplete={onComplete}
      submitLabel={submitLabel}
    />
  );
};
