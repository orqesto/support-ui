/**
 * Task #8 — on Free with pausing on, the subscription page says who is paused and lets an admin
 * change who is active. Nowhere else does it appear.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { PlanFit } from '@/services/subscription.service';

const getPlanFit = vi.fn<(plan?: string) => Promise<PlanFit>>();
const setActiveWithinPlan = vi.fn<(keep: unknown) => Promise<unknown>>();
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    getPlanFit: (plan?: string) => getPlanFit(plan),
    setActiveWithinPlan: (keep: unknown) => setActiveWithinPlan(keep),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { FreePlanActiveCard } = await import('@/components/subscription/FreePlanActiveCard');

const fit = (over: Partial<PlanFit> = {}): PlanFit => ({
  enforced: true,
  limits: { maxUsers: 2, maxIntegrations: 1 },
  over: { members: 0, sources: 0 },
  members: [
    { userId: 1, name: 'Ada', email: 'ada@x.io', role: 'org_admin', state: 'active', joinedAt: null },
    { userId: 2, name: 'Bo', email: 'bo@x.io', role: 'support', state: 'active', joinedAt: null },
    { userId: 3, name: 'Cy', email: 'cy@x.io', role: 'support', state: 'paused', joinedAt: null },
  ],
  channels: [{ id: 10, name: 'Inbox', type: 'gmail', state: 'active', createdAt: null }],
  ...over,
});

describe('FreePlanActiveCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActiveWithinPlan.mockResolvedValue({});
  });
  afterEach(cleanup);

  it('says who is paused and saves a swap', async () => {
    getPlanFit.mockResolvedValue(fit());
    render(<FreePlanActiveCard planName="free" canManage currentUserId={1} />);
    expect(await screen.findByText(/1 member paused to fit Free — nothing was deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Choose who's active" }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Bo/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setActiveWithinPlan).toHaveBeenCalledWith({ memberUserIds: [1, 3], sourceIds: [10] }));
  });

  it('nothing when nothing is paused and the workspace fits', async () => {
    getPlanFit.mockResolvedValue(fit({ members: fit().members.filter((member) => member.state === 'active') }));
    const { container } = render(<FreePlanActiveCard planName="free" canManage />);
    await waitFor(() => expect(getPlanFit).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('nothing when pausing is off, on another plan, or for someone who cannot manage billing', async () => {
    getPlanFit.mockResolvedValue(fit({ enforced: false }));
    const off = render(<FreePlanActiveCard planName="free" canManage />);
    await waitFor(() => expect(getPlanFit).toHaveBeenCalledTimes(1));
    expect(off.container).toBeEmptyDOMElement();
    cleanup();
    getPlanFit.mockClear();
    render(<FreePlanActiveCard planName="pro" canManage />);
    render(<FreePlanActiveCard planName="free" canManage={false} />);
    expect(getPlanFit).not.toHaveBeenCalled();
  });
});
