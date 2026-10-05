/**
 * Task #8 — moving to Free over its limits: the admin chooses who and what stays active, and the
 * rest is paused (never deleted). The choice is what gets posted; a backend without pausing (or
 * without `/plan-fit`) keeps the plain confirmation.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

type ApiResult = { data: unknown };
const get = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
const post = vi.fn<(...args: unknown[]) => Promise<ApiResult>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { PricingPage } from '@/pages/PricingPage';

const plan = (name: string, displayName: string, price: number) => ({
  id: price + 1,
  name,
  displayName,
  planType: 'base',
  price,
  currency: 'EUR',
  billingInterval: 'month',
  features: {},
  limits: { maxUsers: 2, maxMessagesPerMonth: 500, maxIntegrations: 1 },
});

const overFree = {
  enforced: true,
  limits: { maxUsers: 2, maxIntegrations: 1 },
  over: { members: 1, sources: 1 },
  members: [
    { userId: 1, name: 'Ada Admin', email: 'ada@acme.io', role: 'org_admin', state: 'active', joinedAt: '2026-01-01T00:00:00Z' },
    { userId: 2, name: 'Bo Agent', email: 'bo@acme.io', role: 'support', state: 'active', joinedAt: '2026-02-01T00:00:00Z' },
    { userId: 3, name: 'Cy Agent', email: 'cy@acme.io', role: 'support', state: 'active', joinedAt: '2026-03-01T00:00:00Z' },
  ],
  channels: [
    { id: 10, name: 'Support inbox', type: 'gmail', state: 'active', createdAt: '2026-01-01T00:00:00Z' },
    { id: 11, name: 'Sales inbox', type: 'email', state: 'active', createdAt: '2026-02-01T00:00:00Z' },
  ],
};

const load = (fit: unknown) => {
  get.mockImplementation((...args: unknown[]) => {
    const url = String(args[0]);
    if (url.includes('/plans')) {
      return Promise.resolve({ data: { success: true, data: { plans: [plan('free', 'Free', 0), plan('pro', 'Pro', 50000)] } } });
    }
    if (url.includes('/plan-fit')) return Promise.resolve({ data: { success: true, data: fit } });
    return Promise.resolve({ data: { success: true, data: { plan: { name: 'pro' }, subscription: { status: 'active' } } } });
  });
};

/** The workspace is on Pro, so the first selectable card's button is Free's. */
const chooseFree = async () => {
  const [freeButton] = await screen.findAllByRole('button', { name: 'Get Started' });
  fireEvent.click(freeButton);
};

describe('PricingPage — moving to Free over its limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true, data: { message: 'ok', plan: { name: 'free' } } } });
  });
  afterEach(cleanup);

  it('opens the keep-active choice on the default (the admin, then by joining order; the oldest channel) and posts it', async () => {
    load(overFree);
    render(<PricingPage />);
    await chooseFree();
    expect(await screen.findByRole('heading', { name: 'Choose who stays active on Free' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ada Admin/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Bo Agent/ })).toBeChecked();
    // The seats are full: the third member cannot be added without removing someone.
    expect(screen.getByRole('checkbox', { name: /Cy Agent/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Support inbox/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Sales inbox/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Free' }));
    expect(post).toHaveBeenCalledWith('/api/subscriptions/upgrade', {
      planName: 'free',
      keep: { memberUserIds: [1, 2], sourceIds: [10] },
    });
  });

  it('a different choice is what gets posted', async () => {
    load(overFree);
    render(<PricingPage />);
    await chooseFree();
    await screen.findByRole('heading', { name: 'Choose who stays active on Free' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Bo Agent/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cy Agent/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Support inbox/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Sales inbox/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Free' }));
    expect(post).toHaveBeenCalledWith('/api/subscriptions/upgrade', {
      planName: 'free',
      keep: { memberUserIds: [1, 3], sourceIds: [11] },
    });
  });

  it('refuses a choice with no admin — nobody could manage the workspace', async () => {
    load(overFree);
    render(<PricingPage />);
    await chooseFree();
    await screen.findByRole('heading', { name: 'Choose who stays active on Free' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Ada Admin/ }));
    expect(screen.getByText(/Keep at least one admin active/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Free' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('CONTROL: pausing off (or an older backend) keeps the plain confirmation, with no keep', async () => {
    load({ ...overFree, enforced: false });
    render(<PricingPage />);
    await chooseFree();
    expect(await screen.findByText(/Free's limits apply/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose who stays active on Free' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Free' }));
    expect(post).toHaveBeenCalledWith('/api/subscriptions/upgrade', { planName: 'free' });
  });

  it('CONTROL: a workspace that already fits Free gets the plain confirmation', async () => {
    load({ ...overFree, over: { members: 0, sources: 0 } });
    render(<PricingPage />);
    await chooseFree();
    expect(await screen.findByText(/Free's limits apply/)).toBeInTheDocument();
  });
});
