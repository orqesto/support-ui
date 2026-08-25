import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { ElementsCheckoutMount } from '@/components/onboarding/steps/ElementsCheckout';
import type { WizardCheckoutSession } from '@/services/subscription.service';

/**
 * Mounts whichever Stripe UI the session was created for.
 *
 * Shared by the onboarding wizard and the Billing page's "add a payment
 * method" flow, because the choice is not a preference either screen gets to
 * make: a client secret from an `elements` session fails at mount inside
 * embedded checkout, and the reverse, both with an opaque Stripe error. Putting
 * the decision in one place stops a second caller from getting it wrong.
 */
export const CheckoutSessionForm = ({
  session,
  stripePromise,
  onComplete,
  submitLabel,
}: {
  session: WizardCheckoutSession;
  stripePromise: Promise<Stripe | null>;
  onComplete: () => void;
  /** Only used by the Elements form — embedded checkout renders its own button. */
  submitLabel: string;
}) => {
  if (session.uiMode === 'elements') {
    return (
      <ElementsCheckoutMount
        key={session.clientSecret}
        stripePromise={stripePromise}
        clientSecret={session.clientSecret}
        onComplete={onComplete}
        submitLabel={submitLabel}
      />
    );
  }

  return (
    <EmbeddedCheckoutProvider
      key={session.clientSecret}
      stripe={stripePromise}
      options={{ clientSecret: session.clientSecret, onComplete }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
};
