import { forwardRef } from 'react';
import { Turnstile as TurnstileWidget } from '@marsidev/react-turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

type TurnstileProps = {
  onSuccess: (token: string) => void;
  onError?: () => void;
};

export const Turnstile = forwardRef<TurnstileInstance, TurnstileProps>(
  ({ onSuccess, onError }, ref) => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    if (!siteKey) {
      console.warn('Turnstile site key not configured');
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
