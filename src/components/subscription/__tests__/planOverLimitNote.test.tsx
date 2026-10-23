/**
 * Owner decision 3 (2026-10-23): a workspace above its plan's users or mailboxes keeps them and
 * adds none — the Users and Channels pages say so, from the usage limits (never hard-coded).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let usage: unknown;
let planName: string | undefined;
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    getUsage: () => Promise.resolve(usage),
    getPlanName: () => Promise.resolve(planName),
  },
}));

const { PlanOverLimitNote, overPlanLimitText } = await import('../PlanOverLimitNote');

const counts = (users: [number, number], integrations: [number, number]) => ({
  current: { messages: 0, users: users[0], integrations: integrations[0] },
  limits: { messages: 0, users: users[1], integrations: integrations[1] },
});

const show = (kind: 'users' | 'mailboxes') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanOverLimitNote kind={kind} />
    </QueryClientProvider>
  );

afterEach(cleanup);

describe('PlanOverLimitNote', () => {
  it('users over the Free limit: the note, with the limit from the data', async () => {
    usage = counts([4, 2], [1, 1]);
    planName = 'free';
    show('users');
    expect(await screen.findByTestId('over-limit-users')).toHaveTextContent(
      'Your workspace keeps its existing users; Free includes 2. Upgrade to add more.'
    );
  });

  it('mailboxes over the Free limit: the note', async () => {
    usage = counts([1, 2], [3, 1]);
    planName = 'free';
    show('mailboxes');
    expect(await screen.findByTestId('over-limit-mailboxes')).toHaveTextContent(
      'Your workspace keeps its existing mailboxes; Free includes 1. Upgrade to add more.'
    );
  });

  it('CONTROL: at or under the limit, no note', async () => {
    usage = counts([2, 2], [1, 1]);
    planName = 'free';
    show('users');
    show('mailboxes');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('over-limit-users')).toBeNull();
    expect(screen.queryByTestId('over-limit-mailboxes')).toBeNull();
  });

  it('no positive limit or no data: no note; a paid plan names "Your plan"', () => {
    expect(overPlanLimitText('users', 5, 0, 'free')).toBeUndefined();
    expect(overPlanLimitText('users', undefined, 2, 'free')).toBeUndefined();
    expect(overPlanLimitText('users', 6, 5, 'starter')).toBe(
      'Your workspace keeps its existing users; your plan includes 5. Upgrade to add more.'
    );
  });
});
