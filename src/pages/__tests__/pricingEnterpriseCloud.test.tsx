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
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { selfHostedDeployment: selfHosted } }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 1, role: 'user' } }),
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
  get.mockImplementation((...args: unknown[]) =>
    String(args[0]).includes('/plans')
      ? Promise.resolve({
          data: {
            success: true,
            data: {
              plans: [
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
    expect(screen.getByText(/of history import \(uses the monthly AI allowance\)/)).toBeInTheDocument();
    expect(
      screen.getByText('14-day free trial on any paid plan, up to 1,000 messages, no card.')
    ).toBeInTheDocument();
  });
  it('hides Enterprise Cloud on self-hosted', async () => {
    selfHosted = true;
    render(<PricingPage />);
    expect(await screen.findByText('Pro')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Cloud')).toBeNull();
  });
});
