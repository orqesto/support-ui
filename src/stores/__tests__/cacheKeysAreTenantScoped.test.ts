/**
 * A cached list must be labelled with WHO it belongs to, not only with what was asked.
 *
 * The thread and ticket caches are keyed on filters, sorting, page, department context and
 * board-vs-list. Twice a missing dimension caused a real poisoning incident, and twice the
 * fix was to add that dimension to the key — `deptCtx`, then `isKanban`. Both post-mortems
 * are still in the comments above `messagesCacheKey`. Neither key carried identity.
 *
 * That is reachable. The caches are in-memory only (`partialize` persists `filters` and
 * `sorting`, never `cache`), so every path that reloads the page is safe — the organization
 * switcher assigns `window.location.href`, as do the 401, subscription-gate and socket
 * logout paths. Two paths do not reload: `Layout.handleLogout` calls `logout()` then
 * `navigate('/login')`, and `App.tsx`'s 401/403 profile-restore branch calls `logout()` and
 * leaves routing to the guard. Down either one the store module survives, so signing in as
 * someone else in the same tab could be served the previous person's rows.
 *
 * These assertions are the reason that cannot come back. Each was confirmed to fail with
 * `identityScope()` removed from the key before it was kept.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { messagesCacheKey, defaultFilters } from '@/stores/messagesStore';
import { ticketsCacheKey } from '@/stores/ticketsStore';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/stores/departmentContextStore', () => ({
  useDepartmentContextStore: { getState: () => ({ getSelectedDeptIds: () => [] }) },
}));

const sorting = { sortBy: 'time', sortOrder: 'desc' } as const;
const ticketSorting = { sortBy: 'createdAt', sortOrder: 'desc' } as const;
const ticketFilters = {
  search: '',
  status: 'all',
  priority: 'all',
  categoryId: 'all',
  messageSourceId: 'all',
  assigneeId: 'all',
  linked: 'all',
} as unknown as Parameters<typeof ticketsCacheKey>[0];

const signIn = (userId: number, organizationId: number) => {
  useAuthStore.setState({
    user: { id: userId } as User,
    selectedOrganizationId: organizationId,
    isAuthenticated: true,
    token: 'test',
  });
};

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    selectedOrganizationId: null,
    isAuthenticated: false,
    token: null,
  });
});

describe('list cache keys are scoped to the signed-in identity', () => {
  it('gives two workspaces different thread-cache keys for the same question', () => {
    signIn(7, 100);
    const inFirstWorkspace = messagesCacheKey(defaultFilters, sorting, 1, false);
    signIn(7, 200);
    const inSecondWorkspace = messagesCacheKey(defaultFilters, sorting, 1, false);
    expect(inSecondWorkspace).not.toBe(inFirstWorkspace);
  });

  it('gives two people different thread-cache keys in the same workspace', () => {
    // The same-tab logout path: `navigate('/login')` keeps this module alive, so the
    // next person signing in must not be able to address the previous person's entry.
    signIn(7, 100);
    const firstPerson = messagesCacheKey(defaultFilters, sorting, 1, false);
    signIn(8, 100);
    const secondPerson = messagesCacheKey(defaultFilters, sorting, 1, false);
    expect(secondPerson).not.toBe(firstPerson);
  });

  it('gives two workspaces different ticket-cache keys for the same question', () => {
    signIn(7, 100);
    const inFirstWorkspace = ticketsCacheKey(ticketFilters, ticketSorting, 1);
    signIn(7, 200);
    const inSecondWorkspace = ticketsCacheKey(ticketFilters, ticketSorting, 1);
    expect(inSecondWorkspace).not.toBe(inFirstWorkspace);
  });

  it('gives two people different ticket-cache keys in the same workspace', () => {
    signIn(7, 100);
    const firstPerson = ticketsCacheKey(ticketFilters, ticketSorting, 1);
    signIn(8, 100);
    const secondPerson = ticketsCacheKey(ticketFilters, ticketSorting, 1);
    expect(secondPerson).not.toBe(firstPerson);
  });

  it('still returns a stable key for one identity asking twice', () => {
    // Identity must not make the key volatile — that would defeat the cache entirely
    // rather than scope it, and the failure would look like a performance problem.
    signIn(7, 100);
    expect(messagesCacheKey(defaultFilters, sorting, 1, false)).toBe(
      messagesCacheKey(defaultFilters, sorting, 1, false)
    );
    expect(ticketsCacheKey(ticketFilters, ticketSorting, 1)).toBe(
      ticketsCacheKey(ticketFilters, ticketSorting, 1)
    );
  });
});
