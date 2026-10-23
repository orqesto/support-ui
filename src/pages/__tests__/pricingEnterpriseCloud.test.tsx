/** Enterprise Cloud is for everyone on hosted, hidden on self-hosted; AI included; trial text. */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const get = vi.fn<(...args: unknown[]) => Promise<{ data: unknown }>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
let selfHosted = false;
let viewer: { id: number; role: string } = { id: 1, role: 'user' };
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { selfHostedDeployment: selfHosted } }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: viewer }),
}));

import { PricingPage } from '@/pages/PricingPage';

const plan = (name: string, displayName: string, planType: string, extra = {}) => ({
  id: name.length * 7,
  name,
  displayName,
  planType,
  price: 1000,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 2, maxMessagesPerMonth: 500, maxIntegrations: 1, ...extra },
});

beforeEach(() => {
  viewer = { id: 1, role: 'user' };
  get.mockImplementation((...args: unknown[]) =>
    String(args[0]).includes('/plans')
      ? Promise.resolve({
          data: {
            success: true,
            data: {
              plans: [
                plan('free', 'Free', 'base', { maxHistoryDays: 30 }),
                plan('pro', 'Pro', 'base', { maxHistoryDays: 90 }),
                plan('enterprise-cloud', 'Enterprise Cloud', 'enterprise'),
                plan('self-hosted', 'Self-Hosted', 'enterprise'),
              ],
            },
          },
        })
      : Promise.resolve({ data: { success: true, data: { plan: { name: 'pro' } } } })
  );
});
afterEach(cleanup);

describe('PricingPage Enterprise Cloud', () => {
  it('shows Enterprise Cloud to a non-admin on hosted, with AI included and the history line', async () => {
    selfHosted = false;
    render(<PricingPage />);
    expect(await screen.findByText('Enterprise Cloud')).toBeInTheDocument();
    expect(screen.queryByText('Self-Hosted')).toBeNull();
    expect(screen.getAllByText('AI included').length).toBeGreaterThan(0);
    expect(screen.getByText(/of history import \(uses the plan's AI allowance\)/)).toBeInTheDocument();
    expect(
      screen.getByText('14-day free trial on any paid plan, up to 1,000 messages, no card.')
    ).toBeInTheDocument();
  });
  it('Free card: no "AI included", its history line uses the KB allowance first, then your own key; Pro keeps both', async () => {
    selfHosted = false;
    render(<PricingPage />);
    await screen.findByText('Free');
    // Audit A-F12: the one-time knowledge-base allowance analyses history first.
    expect(
      screen.getByText(
        /of history import \(analysed with the free knowledge-base allowance of AI on us first, then your own AI key\)/
      )
    ).toBeInTheDocument();
    // Pro and Enterprise Cloud carry AI; the Free card does not.
    expect(screen.getAllByText('AI included')).toHaveLength(2);
    expect(screen.getAllByText(/\(uses the plan's AI allowance\)/)).toHaveLength(1);
  });

  it('a global admin on hosted sees only Enterprise Cloud in the enterprise grid, not Self-Hosted', async () => {
    selfHosted = false;
    viewer = { id: 9, role: 'admin' };
    render(<PricingPage />);
    expect(await screen.findByText('Enterprise Cloud')).toBeInTheDocument();
    expect(screen.queryByText('Self-Hosted')).toBeNull();
  });

  it('hides Enterprise Cloud on self-hosted', async () => {
    selfHosted = true;
    render(<PricingPage />);
    expect(await screen.findByText('Pro')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Cloud')).toBeNull();
  });
});
