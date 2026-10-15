/** An auto-accepted routing proposal shows as "Accepted automatically" with its Undo button. */
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
        summary: 'Route mail mentioning "pallet label" to Logistics',
        evidence: {},
        undoAvailableUntil: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-10-14T00:00:00.000Z',
      },
    ]);
    render(<LearningNotificationsInbox />);
    expect(await screen.findByText('Accepted automatically')).toBeTruthy();
    expect(screen.queryByText('auto_accept')).toBeNull();
    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy();
  });
});
