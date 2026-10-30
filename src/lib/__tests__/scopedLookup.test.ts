/**
 * Workspace lookups a thread open asked for again (scopedLookup.ts): one request per scope is
 * shared for a minute; another workspace or department selection is another answer; a write the
 * user makes clears the lookup it changed, and a read never does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateSharedFetch } from '@/lib/sharedFetch';
import {
  clearScopedLookupsAfterWrite,
  scopedLookup,
  SCOPED_LOOKUP_TTL_MS,
} from '@/lib/scopedLookup';
import { noteSessionFromResponse } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';

const asUser = (orgId: number, depts: number[] = []) => {
  useAuthStore.setState({ user: { id: 5 } as never, selectedOrganizationId: orgId });
  useDepartmentContextStore.setState({ _selectedByKey: { [`5:${orgId}`]: depts } });
};

describe('scopedLookup', () => {
  beforeEach(() => {
    invalidateSharedFetch();
    asUser(1);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks once for callers in the same scope, and reuses the answer', async () => {
    const fetcher = vi.fn(() => Promise.resolve(['a']));
    const [first, second] = await Promise.all([
      scopedLookup('labels', fetcher),
      scopedLookup('labels', fetcher),
    ]);
    await scopedLookup('labels', fetcher);
    expect(first).toEqual(['a']);
    expect(second).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks again for another workspace, another department selection, or other arguments', async () => {
    const fetcher = vi.fn(() => Promise.resolve(1));
    await scopedLookup('assignable-users', fetcher, 'skill', 'de');
    asUser(2);
    await scopedLookup('assignable-users', fetcher, 'skill', 'de');
    asUser(2, [7]);
    await scopedLookup('assignable-users', fetcher, 'skill', 'de');
    await scopedLookup('assignable-users', fetcher, 'skill', 'fr');
    expect(fetcher).toHaveBeenCalledTimes(4);
    // CONTROL: the first scope is still held.
    asUser(1);
    await scopedLookup('assignable-users', fetcher, 'skill', 'de');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('asks again once the answer is a minute old', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => Promise.resolve(1));
    await scopedLookup('categories', fetcher);
    vi.advanceTimersByTime(SCOPED_LOOKUP_TTL_MS + 1);
    await scopedLookup('categories', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a write clears the lookup it changed — and only that one; a read clears nothing', async () => {
    const labels = vi.fn(() => Promise.resolve('labels'));
    const org = vi.fn(() => Promise.resolve('org'));
    await scopedLookup('labels', labels);
    await scopedLookup('org-current', org);

    clearScopedLookupsAfterWrite('get', '/api/labels');
    await scopedLookup('labels', labels);
    expect(labels).toHaveBeenCalledTimes(1);

    clearScopedLookupsAfterWrite('post', 'https://app.example.com/api/labels/12');
    await scopedLookup('labels', labels);
    await scopedLookup('org-current', org);
    expect(labels).toHaveBeenCalledTimes(2);
    expect(org).toHaveBeenCalledTimes(1);

    clearScopedLookupsAfterWrite('patch', '/api/organizations/lead-config');
    await scopedLookup('org-current', org);
    expect(org).toHaveBeenCalledTimes(2);
  });

  it('a failed request is not kept: the next caller asks again', async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(3);
    await expect(scopedLookup('lead-config', fetcher)).rejects.toThrow('down');
    await expect(scopedLookup('lead-config', fetcher)).resolves.toBe(3);
  });

  it('the API client clears a lookup after a successful write to it (the wiring, not just the rule)', async () => {
    const labels = vi.fn(() => Promise.resolve('labels'));
    await scopedLookup('labels', labels);
    noteSessionFromResponse({ data: {}, config: { method: 'get', url: '/api/labels' } } as never);
    await scopedLookup('labels', labels);
    expect(labels).toHaveBeenCalledTimes(1);
    noteSessionFromResponse({
      data: {},
      config: { method: 'delete', url: '/api/labels/3' },
    } as never);
    await scopedLookup('labels', labels);
    expect(labels).toHaveBeenCalledTimes(2);
  });
});
