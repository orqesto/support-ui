/**
 * KB consolidation proposals (kb_quality consolidate/attach) have their own bell row and need a
 * reviewed body to accept. The org-admin learning section must not list them — but it must keep
 * the REST of kb_quality (routing-rule promotes), so the exclusion is by TYPE, not domain.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const suggestion = (id: number, domain: string, suggestionType: string) => ({
  id,
  domain,
  suggestionType,
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
    listSuggestions: () =>
      Promise.resolve([
        suggestion(1, 'routing', 'add_rule'),
        suggestion(2, 'kb_quality', 'consolidate'),
        suggestion(3, 'kb_quality', 'attach'),
        suggestion(4, 'kb_quality', 'promote'),
      ]),
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

describe('learning bell section vs KB consolidation', () => {
  it('drops consolidate and attach, keeps a kb_quality promote', async () => {
    const { result } = renderHook(() => useLearningNotifications());
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));
    expect(result.current.suggestions.map((row) => row.id)).toEqual([1, 4]);
  });
});
