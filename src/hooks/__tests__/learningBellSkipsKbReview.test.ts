/**
 * KB capture reviews have their own bell section (useKbReviewAlerts), which also reaches
 * moderators. The org-admin learning section must not list them again, or an org admin sees
 * every review twice and its unread count double-counts it.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const suggestion = (id: number, domain: string) => ({
  id,
  domain,
  suggestionType: domain === 'kb_review' ? 'kb_review.capture' : 'add_rule',
  status: 'pending',
  payload: {},
  evidenceCount: 1,
  confidence: null,
  createdAt: '2026-09-19T09:00:00.000Z',
  expiresAt: '2026-10-19T09:00:00.000Z',
});

vi.mock('@/services/learning.service', () => ({
  learningService: {
    listNotifications: () => Promise.resolve([]),
    listSuggestions: () => Promise.resolve([suggestion(1, 'routing'), suggestion(2, 'kb_review')]),
  },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedOrganizationId: 21,
      user: { id: 3, organizationId: 21, role: 'user', organizationRole: 'org_admin' },
    }),
}));
vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));

const { useLearningNotifications } = await import('../useLearningNotifications');

describe('learning bell section', () => {
  it('lists engine suggestions but not KB capture reviews', async () => {
    const { result } = renderHook(() => useLearningNotifications());
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));
    expect(result.current.suggestions.map((row) => row.id)).toEqual([1]);
  });
});
