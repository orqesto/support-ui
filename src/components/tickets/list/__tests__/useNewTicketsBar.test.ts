import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {} } }));

const { useNewTicketsBar } = await import('../useNewTicketsBar');

const page = (ids: number[]) => Promise.resolve({ success: true, data: ids.map((id) => ({ id })) });
const sorting = { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };

beforeEach(() => {
  getAll.mockReset();
});

describe('useNewTicketsBar', () => {
  it('holds back a new ticket that belongs in the current list, and counts it', async () => {
    getAll.mockReturnValue(page([50, 49, 48]));
    const { result } = renderHook(() => useNewTicketsBar({ needs: 'yes' }, sorting));
    act(() => result.current.onCreated(50));
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(getAll).toHaveBeenCalledWith({ needs: 'yes' }, 1, expect.any(Number), 'createdAt', 'desc');
  });

  it('does not count a new ticket the current filters leave out', async () => {
    getAll.mockReturnValue(page([49, 48]));
    const { result } = renderHook(() => useNewTicketsBar({ owes: 'yes' }, sorting));
    act(() => result.current.onCreated(50));
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('counts each new ticket once, however many events arrive for it', async () => {
    getAll.mockReturnValue(page([50, 49]));
    const { result } = renderHook(() => useNewTicketsBar({}, sorting));
    act(() => {
      result.current.onCreated(50);
      result.current.onCreated(50);
    });
    await waitFor(() => expect(result.current.count).toBe(1));
  });

  it('starts over once the agent shows them, or the filters change', async () => {
    getAll.mockReturnValue(page([50]));
    const { result, rerender } = renderHook(({ filters }) => useNewTicketsBar(filters, sorting), {
      initialProps: { filters: {} as Record<string, string> },
    });
    act(() => result.current.onCreated(50));
    await waitFor(() => expect(result.current.count).toBe(1));
    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
    act(() => result.current.onCreated(50));
    await waitFor(() => expect(result.current.count).toBe(1));
    rerender({ filters: { status: 'open' } });
    expect(result.current.count).toBe(0);
  });
});
