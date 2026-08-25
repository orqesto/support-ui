/**
 * Translates our design tokens into a Stripe Elements `appearance`.
 *
 * The point of moving off embedded Checkout was that its iframe cannot be
 * themed — `StripeEmbeddedCheckoutOptions` has no appearance hook at all, so
 * the payment form was a white panel on a dark page regardless of what the
 * rest of the app was doing.
 *
 * Values are READ from the live CSS custom properties rather than restated as
 * hex literals here. A copied palette is a second source of truth that drifts
 * the first time someone adjusts `--primary`, and the drift shows up only on
 * the one screen that takes money.
 */

import type { Appearance } from '@stripe/stripe-js';

/** How a token is looked up. Injected so this is testable without a browser. */
export type TokenReader = (name: string) => string;

/**
 * Tokens are stored as bare HSL triplets ("221.2 83.2% 53.3%") so Tailwind can
 * compose them with an alpha channel. Stripe needs a real CSS colour.
 */
export const hslToken = (raw: string): string | null => {
  const value = raw.trim().replace(/,\s*/g, ' ');
  return value.length > 0 ? `hsl(${value})` : null;
};

export const domTokenReader: TokenReader = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name);

/**
 * Build the appearance for the current theme.
 *
 * Every colour is optional: a token that is missing (an older stylesheet, a
 * test environment with no CSS) is simply omitted, and Stripe falls back to its
 * own default for that one value rather than rendering something unreadable.
 */
export const buildStripeAppearance = (
  theme: 'light' | 'dark',
  read: TokenReader = domTokenReader
): Appearance => {
  const token = (name: string): string | undefined => {
    try {
      return hslToken(read(name)) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const variables: Record<string, string> = {};
  const assign = (key: string, value: string | undefined) => {
    if (value) variables[key] = value;
  };

  assign('colorPrimary', token('--primary'));
  assign('colorBackground', token('--card'));
  assign('colorText', token('--foreground'));
  assign('colorTextSecondary', token('--muted-foreground'));
  assign('colorTextPlaceholder', token('--muted-foreground'));
  assign('colorDanger', token('--destructive'));
  assign('colorBorder', token('--border'));

  // Radius is a length, not a colour — read straight through.
  try {
    const radius = read('--radius').trim();
    if (radius) variables.borderRadius = radius;
  } catch {
    /* no stylesheet — Stripe's default radius is fine */
  }

  variables.fontFamily =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  return {
    // `night` gives Stripe a sane starting point for everything we do NOT
    // override — input backgrounds, icons, the tab strip. Without it, dark-mode
    // overrides sit on a light base and the untouched parts stay white.
    theme: theme === 'dark' ? 'night' : 'stripe',
    variables,
  };
};
