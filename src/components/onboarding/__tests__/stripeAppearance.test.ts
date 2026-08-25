import { describe, it, expect } from 'vitest';
import { buildStripeAppearance, hslToken } from '../steps/stripeAppearance';

/**
 * Embedded Checkout could not be themed at all — its options carry no
 * appearance hook — which is why the payment form was a white panel on a dark
 * page. These pin down the translation from our tokens to Stripe's appearance,
 * and in particular that a missing token degrades instead of producing a
 * malformed colour that Stripe rejects.
 */

const TOKENS: Record<string, string> = {
  '--primary': ' 221.2 83.2% 53.3% ',
  '--card': '0 0% 100%',
  '--foreground': '222.2 84% 4.9%',
  '--muted-foreground': '215.4 16.3% 46.9%',
  '--destructive': '0 84.2% 60.2%',
  '--border': '214.3 31.8% 91.4%',
  '--radius': '0.5rem',
};

const reader = (tokens: Record<string, string>) => (name: string) => tokens[name] ?? '';

describe('hslToken', () => {
  it('turns a bare Tailwind triplet into a CSS colour', () => {
    expect(hslToken('221.2 83.2% 53.3%')).toBe('hsl(221.2 83.2% 53.3%)');
  });

  it('normalises the comma-separated form some tokens use', () => {
    // `--muted` is authored as "210, 20%, 95%" — hsl() with stray commas and
    // spaces is not something Stripe parses.
    expect(hslToken('210, 20%, 95%')).toBe('hsl(210 20% 95%)');
  });

  it('is null for an absent token rather than "hsl()"', () => {
    expect(hslToken('')).toBeNull();
    expect(hslToken('   ')).toBeNull();
  });
});

describe('buildStripeAppearance', () => {
  it('maps our tokens onto Stripe variables', () => {
    const appearance = buildStripeAppearance('light', reader(TOKENS));
    expect(appearance.variables).toMatchObject({
      colorPrimary: 'hsl(221.2 83.2% 53.3%)',
      colorBackground: 'hsl(0 0% 100%)',
      colorText: 'hsl(222.2 84% 4.9%)',
      colorDanger: 'hsl(0 84.2% 60.2%)',
      borderRadius: '0.5rem',
    });
  });

  it('starts from Stripe\'s night base in dark mode', () => {
    // Without this, our dark overrides sit on a light base and everything we do
    // NOT override — input backgrounds, icons, the tab strip — stays white.
    expect(buildStripeAppearance('dark', reader(TOKENS)).theme).toBe('night');
    expect(buildStripeAppearance('light', reader(TOKENS)).theme).toBe('stripe');
  });

  it('omits a missing token instead of emitting a malformed colour', () => {
    const appearance = buildStripeAppearance('light', reader({ '--primary': '0 0% 0%' }));
    expect(appearance.variables?.colorPrimary).toBe('hsl(0 0% 0%)');
    expect(appearance.variables).not.toHaveProperty('colorBackground');
    expect(appearance.variables).not.toHaveProperty('borderRadius');
  });

  it('survives an environment with no stylesheet at all', () => {
    const throwing = () => {
      throw new Error('no computed style');
    };
    expect(() => buildStripeAppearance('dark', throwing)).not.toThrow();
  });
});
