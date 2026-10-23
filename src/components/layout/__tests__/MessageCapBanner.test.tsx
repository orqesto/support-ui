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

let viewer: { role: string; organizationRole: string } = {
  role: 'user',
  organizationRole: 'support',
};
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: viewer }),
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
  viewer = { role: 'user', organizationRole: 'support' };
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
    // …and does not read /api/usage/current there: the page reads it itself (one request, not two).
    expect(getUsage).not.toHaveBeenCalled();
  });

  it('shows the fact but no links to members who cannot open the Subscription page', async () => {
    canView = false;
    getUsage.mockResolvedValue(usage());
    renderBanner();
    await screen.findByTestId('message-cap-banner');
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });
});

describe('the AI-paused banner inside the app-level banner', () => {
  const paused = {
    currency: 'USD' as const,
    active: true,
    usedMicros: 5_000_000,
    budgetMicros: 5_000_000,
    paused: true,
    bulkPaused: true,
    reason: 'budget_used' as const,
    message: 'AI allowance used up.',
    resetsAt: null,
  };

  it('shows the API reason and both doors, below the message cap too', async () => {
    getUsage.mockResolvedValue(
      usage({ current: { messages: 10, users: 3, integrations: 2 }, ai: paused })
    );
    renderBanner();
    expect(await screen.findByTestId('ai-paused-banner')).toHaveTextContent(
      /AI messages are used up/
    );
    expect(screen.getByText(/Buy 1,000 messages/)).toHaveAttribute('href', '/subscription');
    expect(screen.getByText('Upgrade')).toHaveAttribute('href', '/pricing');
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
  });

  it('not paused: nothing', async () => {
    getUsage.mockResolvedValue(
      usage({
        current: { messages: 10, users: 3, integrations: 2 },
        ai: { ...paused, paused: false, reason: null, message: null },
      })
    );
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  describe('AI paused: who reads the money', () => {
    const paused = () =>
      usage({
        ai: {
          currency: 'USD',
          active: true,
          usedMicros: 5_000_000,
          budgetMicros: 5_000_000,
          paused: true,
          bulkPaused: false,
          reason: 'budget_used',
          message: 'Used up ($5.00 of $5.00).',
          resetsAt: '2026-10-05T13:00:00.000Z',
        },
      });

    it('an organisation admin reads the API sentence with the money', async () => {
      viewer = { role: 'user', organizationRole: 'org_admin' };
      getUsage.mockResolvedValue(paused());
      renderBanner();
      expect(await screen.findByTestId('ai-paused-banner')).toHaveTextContent('$5.00 of $5.00');
    });

    it('an agent reads a money-free sentence', async () => {
      getUsage.mockResolvedValue(paused());
      renderBanner();
      const banner = await screen.findByTestId('ai-paused-banner');
      expect(banner).toHaveTextContent(/AI messages are used up/);
      expect(banner).not.toHaveTextContent(/\$/);
    });
  });
});

describe('budget_used to a member who cannot buy (F4)', () => {
  it('asks an admin instead of offering to buy', async () => {
    canView = false;
    getUsage.mockResolvedValue(
      usage({
        current: { messages: 10, users: 3, integrations: 2 },
        ai: {
          currency: 'USD',
          active: true,
          usedMicros: 5_000_000,
          budgetMicros: 5_000_000,
          paused: true,
          bulkPaused: false,
          reason: 'budget_used',
          message: 'Used up.',
          resetsAt: null,
        },
      })
    );
    renderBanner();
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent(/Ask an admin to buy more messages or upgrade/);
    expect(banner).not.toHaveTextContent(/Buying more messages/);
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });
});

describe('Free starter allowance used up', () => {
  const exhausted = (paused: boolean) =>
    usage({
      current: { messages: 10, users: 3, integrations: 2 },
      ai: {
        currency: 'USD',
        active: true,
        usedMicros: null,
        budgetMicros: null,
        paused,
        bulkPaused: paused,
        reason: paused ? 'free_allowance_used' : null,
        message: paused
          ? 'Your free AI allowance is used. Add your own AI key to keep AI running.'
          : null,
        resetsAt: null,
        starterAllowance: {
          totalMicros: 400_000,
          usedMicros: 400_000,
          remainingMicros: 0,
          exhausted: true,
        },
      },
    });

  it('an admin: the sentence, Add your AI key and Upgrade', async () => {
    viewer = { role: 'user', organizationRole: 'org_admin' };
    getUsage.mockResolvedValue(exhausted(true));
    renderBanner();
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent(
      'Your free AI allowance is used. Add your own AI key to keep AI running.'
    );
    expect(screen.getByText('Add your AI key')).toHaveAttribute(
      'href',
      '/settings#integrations/ai-providers'
    );
    expect(screen.getByText('Upgrade')).toHaveAttribute('href', '/pricing');
  });

  it('an agent: "ask your admin", no buttons', async () => {
    getUsage.mockResolvedValue(exhausted(true));
    renderBanner();
    const banner = await screen.findByTestId('ai-paused-banner');
    expect(banner).toHaveTextContent(/ask your admin/);
    expect(screen.queryByText('Add your AI key')).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });

  it('exhausted but not paused (an own-key Free workspace): no banner', async () => {
    getUsage.mockResolvedValue(exhausted(false));
    renderBanner();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });
});

describe('the KB allowance and no-AI notices (BE #1112): admins only, beside the cap banner', () => {
  const freeAi = (over: Record<string, unknown>) =>
    usage({
      ai: {
        currency: 'USD',
        active: true,
        usedMicros: 0,
        budgetMicros: null,
        paused: false,
        bulkPaused: true,
        reason: null,
        message: null,
        resetsAt: null,
        ...over,
      },
    });

  it('an admin sees the KB banner, and the cap banner still shows', async () => {
    viewer = { role: 'user', organizationRole: 'org_admin' };
    getUsage.mockResolvedValue(freeAi({ kbPaused: true, kbMessage: 'KB allowance used.' }));
    renderBanner();
    expect(await screen.findByTestId('kb-paused-banner')).toHaveTextContent(
      'KB allowance used. AI for new mail keeps running.'
    );
    expect(screen.getByTestId('message-cap-banner')).toBeInTheDocument();
  });

  it('an admin below the cap sees why there is no AI', async () => {
    viewer = { role: 'user', organizationRole: 'org_admin' };
    getUsage.mockResolvedValue({
      ...freeAi({ unavailableReason: 'own_key_required' }),
      current: { messages: 10, users: 1, integrations: 1 },
    });
    renderBanner();
    expect(await screen.findByTestId('ai-unavailable-notice')).toHaveTextContent(
      'Add your own AI key to use AI.'
    );
    expect(screen.queryByTestId('message-cap-banner')).not.toBeInTheDocument();
  });

  it('an agent sees neither in the global strip', async () => {
    getUsage.mockResolvedValue(
      freeAi({ kbPaused: true, kbMessage: 'x', unavailableReason: 'admin_not_verified' })
    );
    renderBanner();
    expect(await screen.findByTestId('message-cap-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('kb-paused-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-unavailable-notice')).not.toBeInTheDocument();
  });
});
