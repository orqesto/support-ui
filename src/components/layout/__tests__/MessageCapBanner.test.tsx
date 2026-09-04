/**
 * The message-cap banner is what tells a workspace WHY the AI went quiet (owner decision
 * 2026-09-04: at the cap mail keeps arriving, only managed AI pauses). These pin the
 * decisions that make it safe: it shows only AT the cap, it says mail still lands, it
 * offers the pack door only when the backend says a pack can be bought, and it stays
 * out of the way below the cap and on deployments without billing.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessageCapBanner } from '../MessageCapBanner';
import type { OrgUsage } from '@/services/subscription.service';

const getUsage = vi.fn<() => Promise<OrgUsage>>();
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: { getUsage: () => getUsage() },
}));

let billingEnabled = true;
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { billingEnabled } }),
}));

let canView = true;
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => canView }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ selectedOrganizationId: 4 }),
}));

const usage = (over: Partial<OrgUsage> = {}): OrgUsage => ({
  current: { messages: 4000, users: 3, integrations: 2 },
  limits: { messages: 4000, users: 5, integrations: 3 },
  percentage: { messages: 100, users: 60, integrations: 66 },
  month: '2026-09-05',
  period: {
    key: '2026-09-05',
    start: '2026-09-05T13:00:00.000Z',
    end: '2026-10-05T13:00:00.000Z',
    source: 'billing',
  },
  extra: { messages: 0 },
  messagePack: { available: true, messages: 1000, priceCents: 5000, currency: 'EUR' },
  ...over,
});

const renderBanner = (path = '/tickets') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <MessageCapBanner />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  billingEnabled = true;
  canView = true;
  getUsage.mockReset();
});
afterEach(cleanup);

describe('the message-cap banner', () => {
  it('appears at the cap, says mail still lands, and names the reset day', async () => {
    getUsage.mockResolvedValue(usage());
    renderBanner();
    const banner = await screen.findByTestId('message-cap-banner');
    expect(banner).toHaveTextContent(/New messages still arrive/);
    // Locale-neutral: en-GB renders "5 October", en-US "October 5".
    expect(banner).toHaveTextContent(/(5 October|October 5)/);
  });

  it('offers both doors when a pack can be bought', async () => {
    getUsage.mockResolvedValue(usage());
    renderBanner();
    await screen.findByTestId('message-cap-banner');
    expect(screen.getByText('Upgrade')).toHaveAttribute('href', '/pricing');
    expect(screen.getByText(/Buy 1,000 messages/)).toHaveAttribute('href', '/subscription');
  });

  it('offers upgrade only when the backend refuses a pack (free plan, trial)', async () => {
    getUsage.mockResolvedValue(
      usage({
        messagePack: {
          available: false,
          reason: 'free_plan',
          messages: 1000,
          priceCents: 5000,
          currency: 'EUR',
        },
      })
    );
    renderBanner();
    await screen.findByTestId('message-cap-banner');
    expect(screen.getByText('Upgrade')).toBeInTheDocument();
    expect(screen.queryByText(/Buy 1,000 messages/)).not.toBeInTheDocument();
  });

  it('stays hidden below the cap — one message short is not the cap', async () => {
    getUsage.mockResolvedValue(usage({ current: { messages: 3999, users: 3, integrations: 2 } }));
    renderBanner();
    // Let the query settle, then assert absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
  });

  it('counts a bought pack as part of the cap (4,000 used of 5,000 is not the cap)', async () => {
    getUsage.mockResolvedValue(
      usage({ limits: { messages: 5000, users: 5, integrations: 3 }, extra: { messages: 1000 } })
    );
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
  });

  it('never renders without billing — there is no cap to explain, and never even asks', async () => {
    billingEnabled = false;
    getUsage.mockResolvedValue(usage());
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
    expect(getUsage).not.toHaveBeenCalled();
  });

  it('stays off the Subscription page, which already shows the full picture', async () => {
    getUsage.mockResolvedValue(usage());
    renderBanner('/subscription');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
  });

  it('shows the fact but no links to members who cannot open the Subscription page', async () => {
    canView = false;
    getUsage.mockResolvedValue(usage());
    renderBanner();
    await screen.findByTestId('message-cap-banner');
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });
});
