import { forwardRef } from 'react';
import { Turnstile as TurnstileWidget } from '@marsidev/react-turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { logger } from '@/lib/logger';

type TurnstileProps = {
  onSuccess: (token: string) => void;
  onError?: () => void;
};

/**
 * Whether a widget can actually be rendered.
 *
 * Without a site key `Turnstile` renders nothing, so `onSuccess` never fires and
 * any caller gating on a token waits forever. Callers must ask this before making
 * a token mandatory — the backend already treats captcha as verify-if-sent for the
 * same reason.
 */
export const isTurnstileConfigured = (): boolean =>
  Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

export const Turnstile = forwardRef<TurnstileInstance, TurnstileProps>(
  ({ onSuccess, onError }, ref) => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    if (!siteKey) {
      logger.warn('Turnstile site key not configured');
      return null;
    }

    return (
      <TurnstileWidget
        ref={ref}
        siteKey={siteKey}
        onSuccess={onSuccess}
        onError={onError}
        options={{
          theme: 'light',
          size: 'normal',
        }}
      />
    );
  }
);

Turnstile.displayName = 'Turnstile';
