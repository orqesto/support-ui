/**
 * Token caps wave 2b: a limit notice names the limit it is about. A monthly notice gives the
 * DATED reset and "this month"; an alliance pool's notice says the shared pool; a released monthly
 * or alliance regular notice promises the catch-up, not the one-day re-run. A daily notice (and
 * one from a backend before wave 2b, which sends no period) reads as before.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type React from 'react';
import type { TokenLimitAlert } from '@/hooks/useTokenLimitAlerts';
import { TokenLimitSection } from '../TokenLimitSection';

const Label = ({ children }: { children: React.ReactNode }) => <span>{children}</span>;
const NOW = Date.parse('2026-10-12T10:00:00.000Z');

const alert = (extra: Partial<TokenLimitAlert> = {}): TokenLimitAlert => ({
  id: 1,
  bucket: 'regular',
  title: null,
  spent: 18_000_000,
  limit: 18_000_000,
  enforced: true,
  resetsAt: '2026-11-01T00:00:00.000Z',
  effect: 'The backend effect.',
  releasedAt: null,
  checkedAt: null,
  releasePartial: null,
  releaseKind: null,
  releaseCause: 'limit_setting',
  period: 'month',
  scope: 'workspace',
  ...extra,
});
const show = (item: TokenLimitAlert) =>
  render(
    <TokenLimitSection
      alerts={[item]}
      dismiss={() => {}}
      now={NOW}
      showLabel={false}
      SectionLabel={Label}
    />
  );
const text = () => document.body.textContent ?? '';

afterEach(cleanup);

describe('TokenLimitSection — per period and scope (wave 2b)', () => {
  it('a monthly notice: "Monthly", "this month", and the DATED reset — never a time alone', () => {
    show(alert());
    expect(screen.getByText('Monthly AI limit for regular work reached')).toBeTruthy();
    expect(text()).toContain('18,000,000 of 18,000,000 tokens used this month');
    expect(text()).toMatch(/Resets at 00:00 UTC on 2026-11-01/);
    expect(text()).not.toMatch(/Resets at 00:00 UTC \(/);
  });

  it("an alliance pool's notice says the shared pool", () => {
    show(alert({ scope: 'alliance', period: 'day', resetsAt: '2026-10-13T00:00:00.000Z' }));
    expect(
      screen.getByText("Organisation's shared daily AI pool for regular work reached")
    ).toBeTruthy();
    expect(text()).toContain('used by the organisation today');
  });

  it('a monthly notice from an earlier month is a record of that month', () => {
    show(alert({ resetsAt: '2026-10-01T00:00:00.000Z' }));
    expect(text()).toContain('Monthly AI limit for regular work was reached in an earlier month');
  });

  it('a released monthly regular notice promises the catch-up, not the one-day best effort', () => {
    show(alert({ releasedAt: '2026-10-12T09:00:00.000Z', checkedAt: '2026-10-12T09:00:00.000Z' }));
    expect(text()).toContain('are analysed again with AI, in batches');
    expect(text()).not.toContain('best effort');
  });

  it('CONTROL: a daily notice (or one with no period from an older backend) reads as before', () => {
    show(alert({ period: undefined, scope: undefined, resetsAt: '2026-10-13T00:00:00.000Z' }));
    expect(screen.getByText('Daily AI limit for regular work reached')).toBeTruthy();
    expect(text()).toContain('tokens used today');
    expect(text()).toMatch(/Resets at 00:00 UTC \(/);
  });
});
