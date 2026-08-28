/**
 * The dashboard's "Avg First Response" tile was the one card of fifteen with a number and
 * nowhere to check it — its `navigate('/sla')` handler was written but never attached,
 * because `DashboardStatCards` does `onClick={card.isClickable ? card.onClick : undefined}`
 * and the flag was `false`.
 *
 * Wiring it up is only useful if the destination shows the SAME window. The tile's figure
 * comes from `/api/sla/summary`, whose `days` defaults to 30; this page defaults
 * independently. A drill-down that lands on a different period than the number it came from
 * is worse than no drill-down: two figures that disagree, and nothing saying why.
 *
 * So the window travels in the URL, and these pin that it is honoured — and that a period
 * this page cannot select is refused rather than silently adopted, which would leave the
 * selector with no active button while the charts showed a window nobody could change.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let search = '';
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(search)],
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Each chart renders the window it was handed, so the assertion is on what the page
// actually passes down rather than on which button looks active.
const spy = (name: string) => ({ days }: { days: number }) => <div>{`${name}:${days}`}</div>;
vi.mock('@/components/sla/SLAOverviewCards', () => ({ SLAOverviewCards: spy('overview') }));
vi.mock('@/components/sla/SLAByChannelChart', () => ({ SLAByChannelChart: spy('channel') }));
vi.mock('@/components/sla/SLATrendChart', () => ({ SLATrendChart: spy('trend') }));
vi.mock('@/components/sla/SLABreachList', () => ({ SLABreachList: spy('breaches') }));
vi.mock('@/components/sla/SLAByPriorityTable', () => ({
  SLAByPriorityTable: spy('priority'),
  SLA_DEFAULT_DAYS: 30,
}));

const { SLADashboardPage } = await import('../SLADashboardPage');

afterEach(cleanup);

describe('SLA drill-down window', () => {
  it('opens on the window the dashboard sent it', () => {
    search = '?days=7';
    render(<SLADashboardPage />);
    expect(screen.getByText('trend:7')).toBeTruthy();
    expect(screen.getByText('priority:7')).toBeTruthy();
  });

  it('falls back to the default for a period it cannot select', () => {
    // `/api/sla/summary` clamps `days` to 1..365, so it can report a window — 1, say —
    // that this page has no button for. Adopting it would strand the selector.
    search = '?days=1';
    render(<SLADashboardPage />);
    expect(screen.getByText('trend:30')).toBeTruthy();
  });

  it('ignores junk rather than rendering NaN days', () => {
    search = '?days=all';
    render(<SLADashboardPage />);
    expect(screen.getByText('trend:30')).toBeTruthy();
  });

  it('still defaults when arriving with no window at all', () => {
    search = '';
    render(<SLADashboardPage />);
    expect(screen.getByText('trend:30')).toBeTruthy();
  });
});
