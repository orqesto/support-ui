/**
 * Audit pass 2 (M1): a slow finding response that lands after a newer request — e.g. "Show all
 * entries" clicked while the finding list was loading — must not reach the page, or it replaces
 * the newer list with the finding's entries under no banner.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const pending: Array<(value: unknown) => void> = [];
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: () => new Promise((resolve) => pending.push(resolve)),
    },
  };
});

const { useKbFindingFilter } = await import('../useKbFindingFilter');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/knowledge-base?finding=raw_email&departmentId=3']}>
    {children}
  </MemoryRouter>
);
const answer = (finding: string | null) => ({
  data: {
    entries: [],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    filters: { finding },
  },
});

describe('useKbFindingFilter.fetchList', () => {
  it('an overtaken response comes back as null; the newest one comes back as itself', async () => {
    const { result } = renderHook(() => useKbFindingFilter(''), { wrapper });
    let first: unknown = 'unset';
    let second: unknown = 'unset';
    await act(async () => {
      const slow = result.current.fetchList({ type: 'qa_pair' });
      const fast = result.current.fetchList({ type: 'qa_pair' });
      pending[1](answer('raw_email'));
      second = await fast;
      pending[0](answer('raw_email'));
      first = await slow;
    });
    expect(first).toBeNull();
    expect(second).toEqual(answer('raw_email'));
    expect(result.current.banner.result).toBe('applied');
  });

  it('overtaken() tells the page an older request must not switch the spinner off', async () => {
    pending.length = 0;
    const { result } = renderHook(() => useKbFindingFilter(''), { wrapper });
    await act(async () => {
      const slow = result.current.fetchList({ type: 'qa_pair' });
      const fast = result.current.fetchList({ type: 'qa_pair' });
      pending[0](answer('raw_email'));
      await slow;
      expect(result.current.overtaken()).toBe(true);
      pending[1](answer('raw_email'));
      await fast;
      expect(result.current.overtaken()).toBe(false);
    });
  });

  it('pageAfter: the last row of a later page re-reads the page before it', () => {
    const { result } = renderHook(() => useKbFindingFilter(''), { wrapper });
    expect(result.current.pageAfter(1, 3)).toBe(2);
    expect(result.current.pageAfter(5, 3)).toBe(3);
    expect(result.current.pageAfter(1, 1)).toBe(1);
  });
});
