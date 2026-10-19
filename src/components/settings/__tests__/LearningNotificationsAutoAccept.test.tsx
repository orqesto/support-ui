/** An auto-accepted routing proposal shows as "Auto-accepted" with the bars it cleared and its Undo button. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const listNotifications = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/learning.service', () => ({
  learningService: {
    listNotifications: () => listNotifications(),
    undoNotification: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ selectedOrganizationId: 21 }),
}));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({ canActOn: () => true, canActOnAnyDomain: true }),
}));

import { LearningNotificationsInbox } from '../LearningNotificationsInbox';

afterEach(cleanup);

describe('LearningNotificationsInbox auto_accept', () => {
  it('labels an auto-accepted proposal and offers Undo', async () => {
    listNotifications.mockResolvedValue([
      {
        id: 1,
        organizationId: 21,
        domain: 'routing',
        actionType: 'auto_accept',
        ruleTable: 'routing_rules',
        ruleId: 10,
        // The BE's real summary text (routingProposalPass.ts: `Accepted automatically: ${summary}`).
        summary: 'Accepted automatically: Route mail mentioning "pallet label" in the message to Logistics',
        evidence: {
          suggestionId: 77,
          mode: 'balanced',
          acceptedRuleIds: [10],
          weightedConversations: 6,
          spanDays: 7.4,
          replay: {
            matches: 12,
            inDepartment: 11,
            ratio: 11 / 12,
            lookbackDays: 30,
            at: '2026-10-14T00:00:00.000Z',
            skipped: 0,
            truncated: false,
            recommendation: 'recommended',
          },
        },
        undoAvailableUntil: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-10-14T00:00:00.000Z',
      },
    ]);
    render(<LearningNotificationsInbox />);
    expect(await screen.findByText('Auto-accepted')).toBeTruthy();
    expect(
      screen.getByText('Accepted automatically: Route mail mentioning "pallet label" in the message to Logistics')
    ).toBeTruthy();
    expect(screen.getByText(/Threads 6/)).toBeTruthy();
    expect(screen.getByText(/Over 7 days/)).toBeTruthy();
    expect(screen.getByText(/Replay 92%/)).toBeTruthy();
    expect(screen.queryByText('auto_accept')).toBeNull();
    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy();
  });

  it('reads a fractional weighted count as "about N"', async () => {
    listNotifications.mockResolvedValue([
      {
        id: 1,
        organizationId: 21,
        domain: 'routing',
        actionType: 'auto_accept',
        ruleTable: 'routing_rules',
        ruleId: 10,
        // The BE's real summary text (routingProposalPass.ts: `Accepted automatically: ${summary}`).
        summary: 'Accepted automatically: Route mail mentioning "pallet label" in the message to Logistics',
        evidence: {
          suggestionId: 77,
          mode: 'balanced',
          acceptedRuleIds: [10],
          weightedConversations: 4.75,
          spanDays: 7.4,
          replay: {
            matches: 12,
            inDepartment: 11,
            ratio: 11 / 12,
            lookbackDays: 30,
            at: '2026-10-14T00:00:00.000Z',
            skipped: 0,
            truncated: false,
            recommendation: 'recommended',
          },
        },
        undoAvailableUntil: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-10-14T00:00:00.000Z',
      },
    ]);
    render(<LearningNotificationsInbox />);
    expect(await screen.findByText('Auto-accepted')).toBeTruthy();
    expect(
      screen.getByText('Accepted automatically: Route mail mentioning "pallet label" in the message to Logistics')
    ).toBeTruthy();
    expect(screen.getByText(/Threads about 5/)).toBeTruthy();
    expect(screen.getByText(/Over 7 days/)).toBeTruthy();
    expect(screen.getByText(/Replay 92%/)).toBeTruthy();
    expect(screen.queryByText('auto_accept')).toBeNull();
    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy();
  });
});
