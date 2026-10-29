import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { getMetadata, fetchTicketViewCounts, list, save, remove } = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  fetchTicketViewCounts: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/services/ticket.service', () => ({
  ticketService: { getMetadata },
  fetchTicketViewCounts,
}));
vi.mock('@/services/ticketSavedViews.service', () => ({
  ticketSavedViewsService: { list, save, remove },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {} } }));

const { useTicketViews } = await import('../useTicketViews');

beforeEach(() => {
  // Default: a backend without POST /api/tickets/counts, so the per-view path below still runs.
  fetchTicketViewCounts.mockReset().mockResolvedValue(null);
  getMetadata.mockReset().mockImplementation((filters?: Record<string, string>) =>
    Promise.resolve({ success: true, data: { total: filters?.needs ? 12 : 30 } })
  );
  list.mockReset().mockResolvedValue([{ id: 9, name: 'Billing', filters: { categoryId: '3' } }]);
  save.mockReset();
  remove.mockReset().mockResolvedValue(undefined);
});

describe('useTicketViews', () => {
  it('lists the built-ins, then the agent’s own views from the server', async () => {
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.views.map((view) => view.name)).toContain('Billing'));
    expect(result.current.views[0].name).toBe('Needs us');
  });

  it('counts each view with that view’s own filters, "me" resolved to the agent', async () => {
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.counts['Needs us']).toBe(12));
    expect(result.current.counts.All).toBe(30);
    expect(getMetadata).toHaveBeenCalledWith({ needs: 'yes' }, 1);
    expect(getMetadata).toHaveBeenCalledWith({ assigneeId: '7' }, 1);
  });

  it('counts again when the refresh key changes', async () => {
    const { rerender } = renderHook(({ key }) => useTicketViews(7, key), { initialProps: { key: 0 } });
    await waitFor(() => expect(getMetadata).toHaveBeenCalled());
    const before = getMetadata.mock.calls.length;
    rerender({ key: 1 });
    await waitFor(() => expect(getMetadata.mock.calls.length).toBeGreaterThan(before));
  });

  it('counts once for a burst of refreshes, not once per event', async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderHook(({ key }) => useTicketViews(7, key), { initialProps: { key: 'a' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      const settled = getMetadata.mock.calls.length;
      rerender({ key: 'b' });
      rerender({ key: 'c' });
      rerender({ key: 'd' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      // Six built-ins (the saved view is not loaded under fake timers' first tick): one round.
      expect(getMetadata.mock.calls.length - settled).toBeLessThanOrEqual(7);
      expect(getMetadata.mock.calls.length - settled).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts every view — built-ins and saved — in ONE request, once, after the saved views arrive', async () => {
    // The saved views arrive after the debounce, as on staging (~0.7 s): the case that counted twice.
    const billing = [{ id: 9, name: 'Billing', filters: { categoryId: '3' } }];
    list.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(billing), 700))
    );
    fetchTicketViewCounts.mockImplementation((views: Array<{ id: string }>) =>
      Promise.resolve(Object.fromEntries(views.map((view, at) => [view.id, at + 1])))
    );
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.counts.Billing).toBe(7), { timeout: 3000 });
    expect(result.current.counts['Needs us']).toBe(1);
    // Give a second round time to happen: the old hook counted the built-ins, then everything again.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(fetchTicketViewCounts).toHaveBeenCalledTimes(1);
    type Asked = Array<{ id: string; filters: Record<string, string> }>;
    const [asked] = fetchTicketViewCounts.mock.calls[0] as [Asked];
    expect(asked.map((view) => view.id)).toEqual([
      'Needs us',
      'All',
      'Mine',
      'Unassigned',
      'Owes reply',
      'Urgent',
      'Billing',
    ]);
    expect(asked[2].filters).toEqual({ assigneeId: '7' });
    // CONTROL: nothing went the per-view way.
    expect(getMetadata).not.toHaveBeenCalled();
  });

  it('a view the server could not count keeps no number rather than a wrong one', async () => {
    fetchTicketViewCounts.mockResolvedValue({ 'Needs us': null, All: 30 });
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.counts.All).toBe(30));
    expect(result.current.counts['Needs us']).toBeUndefined();
  });

  it('still counts the built-ins when the saved views fail to load', async () => {
    list.mockRejectedValue(new Error('down'));
    fetchTicketViewCounts.mockResolvedValue({ All: 30 });
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.counts.All).toBe(30));
    expect(fetchTicketViewCounts).toHaveBeenCalledTimes(1);
  });

  it('saves a view and shows it, replacing one with the same name', async () => {
    save.mockResolvedValue({ id: 10, name: 'Billing', filters: { owes: 'yes' } });
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.views.some((view) => view.id === 9)).toBe(true));
    await act(() => result.current.saveView('Billing', { owes: 'yes' }));
    const billing = result.current.views.filter((view) => view.name === 'Billing');
    expect(billing).toEqual([expect.objectContaining({ id: 10, filters: { owes: 'yes' } })]);
  });

  it('removes a deleted view', async () => {
    const { result } = renderHook(() => useTicketViews(7, 0));
    await waitFor(() => expect(result.current.views.some((view) => view.id === 9)).toBe(true));
    await act(() => result.current.deleteView({ id: 9, name: 'Billing', filters: {} }));
    expect(result.current.views.some((view) => view.id === 9)).toBe(false);
    expect(remove).toHaveBeenCalledWith(9);
  });
});
