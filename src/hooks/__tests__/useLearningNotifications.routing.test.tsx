/**
 * The bell for people who manage routing rules but are not org admins (spec 4.6): they see the
 * three routing proposal types and the routing auto-actions, nothing else, and get no count for
 * anything else. A person WITHOUT the permission sees nothing and the hook never fetches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type * as LearningServiceModule from '@/services/learning.service';

const access = vi.hoisted(() => ({
  routing: true,
  orgRole: 'moderator',
  listNotifications: vi.fn<() => Promise<LearningServiceModule.LearningNotification[]>>(),
  listSuggestions: vi.fn<() => Promise<LearningServiceModule.LearningSuggestion[]>>(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({
      user: { id: 3, role: 'user', organizationRole: access.orgRole },
      selectedOrganizationId: 1,
    }),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({
    canActOn: (domain: string) =>
      access.orgRole === 'org_admin' || (domain === 'routing' && access.routing),
  }),
}));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      listNotifications: () => access.listNotifications(),
      listSuggestions: () => access.listSuggestions(),
    },
  };
});

const { useLearningNotifications } = await import('../useLearningNotifications');

const FRESH = '2026-10-14T09:00:00Z';
type Note = LearningServiceModule.LearningNotification;
type Sug = LearningServiceModule.LearningSuggestion;
const note = (id: number, domain: string, actionType: Note['actionType']): Note => ({
  id,
  organizationId: 1,
  domain,
  actionType,
  ruleTable: 'routing_rules',
  ruleId: id,
  summary: `note ${id}`,
  evidence: {},
  undoAvailableUntil: '2026-10-24T09:00:00Z',
  createdAt: FRESH,
});
const sug = (
  id: number,
  domain: Sug['domain'],
  suggestionType: string,
  status: Sug['status'] = 'pending'
): Sug => ({
  id,
  domain,
  suggestionType,
  status,
  payload: {},
  evidenceCount: 1,
  evidenceEventIds: [],
  confidence: null,
  expiresAt: '9999-12-31T00:00:00Z',
  createdAt: FRESH,
});

beforeEach(() => {
  access.routing = true;
  access.orgRole = 'moderator';
  window.localStorage.clear();
  access.listNotifications
    .mockReset()
    .mockResolvedValue([note(1, 'routing', 'auto_accept'), note(2, 'spam', 'promote')]);
  access.listSuggestions
    .mockReset()
    .mockResolvedValue([
      sug(10, 'routing', 'propose_rule'),
      sug(11, 'routing', 'resolve_routing_disagreement'),
      sug(12, 'routing', 'confirm_learned_rule'),
      sug(13, 'routing', 'resolve_conflict'),
      sug(14, 'routing', 'propose_rule', 'accepted'),
      sug(15, 'spam', 'add_pattern'),
      sug(16, 'kb_quality', 'promote'),
    ]);
});

describe('bell visibility for routing managers', () => {
  it('a moderator with Manage Routing Rules sees the three routing proposal types and routing auto-actions only', async () => {
    const { result } = renderHook(() => useLearningNotifications());
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));
    expect(result.current.suggestions.map((row) => row.id)).toEqual([10, 11, 12]);
    expect(result.current.showLearning).toBe(true);
    expect(result.current.notifications.map((row) => row.id)).toEqual([1]);
    // The count covers exactly what is listed: 1 auto-action + 3 proposals, none of the hidden rows.
    expect(result.current.unreadCount).toBe(4);
  });

  it('a moderator WITHOUT Manage Routing Rules gets nothing, no count, and no request', async () => {
    access.routing = false;
    const { result } = renderHook(() => useLearningNotifications());
    // Give an (unwanted) fetch the chance to land.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(access.listNotifications).not.toHaveBeenCalled();
    expect(access.listSuggestions).not.toHaveBeenCalled();
    expect(result.current.showLearning).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('a viewer who loses the permission mid-session gets no count and no request', async () => {
    const { result, rerender } = renderHook(() => useLearningNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(4));
    const calls = access.listSuggestions.mock.calls.length;
    access.routing = false;
    rerender();
    await waitFor(() => expect(result.current.showLearning).toBe(false));
    expect(result.current.unreadCount).toBe(0);
    result.current.refresh();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(access.listSuggestions.mock.calls.length).toBe(calls);
  });

  it('an org admin keeps the full list (control: the admin path is unchanged)', async () => {
    access.orgRole = 'org_admin';
    const { result } = renderHook(() => useLearningNotifications());
    await waitFor(() => expect(result.current.suggestions.length).toBeGreaterThan(0));
    expect(result.current.showLearning).toBe(true);
    expect(result.current.notifications.map((row) => row.id)).toEqual([1, 2]);
    expect(result.current.suggestions.map((row) => row.id)).toEqual([10, 11, 12, 13, 15, 16]);
  });
});
