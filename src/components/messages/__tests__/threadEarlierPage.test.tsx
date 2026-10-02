/**
 * The thread opens on its latest page and says what it left out; "Show earlier messages" fetches
 * the page before it and puts it above. The header counts the whole thread, not the page.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderDetail, svc } from './md4.mobile.utils';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/api-client', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});

const event = (id: number) => ({
  id,
  type: 'inbound',
  content: `event ${id}`,
  authorEmail: 'orders@shop.example',
  createdAt: `2026-09-16T06:${String(id % 60).padStart(2, '0')}:00Z`,
  metadata: {},
});

describe('the thread as pages', () => {
  it('opens on the latest page, offers the earlier ones, and prepends them on request', async () => {
    const latest = [event(40), event(41), event(42)];
    const older = [event(37), event(38), event(39)];
    svc.message.getThreadMessages = vi.fn((_id: number, page?: { before?: number }) =>
      Promise.resolve(
        page?.before === 40
          ? { data: older, page: { total: 1887, hasEarlier: true, earliestId: 37 } }
          : { data: latest, page: { total: 1887, hasEarlier: true, earliestId: 40 } }
      )
    );
    renderDetail({}, { isFullPage: true });
    expect(await screen.findByText('event 42')).toBeInTheDocument();
    expect(svc.message.getThreadMessages).toHaveBeenCalledWith(101, { limit: 300 });
    // The header counts the thread, not the page.
    expect(screen.getByText(/1887 msgs/)).toBeInTheDocument();
    const earlier = screen.getByRole('button', { name: /Show earlier messages \(1884 more\)/ });
    fireEvent.click(earlier);
    expect(await screen.findByText('event 37')).toBeInTheDocument();
    expect(svc.message.getThreadMessages).toHaveBeenLastCalledWith(101, { limit: 300, before: 40 });
    // Above the page that was already there, in thread order.
    const bodies = screen.getAllByText(/^event \d+$/).map((node) => node.textContent);
    expect(bodies).toEqual(['event 37', 'event 38', 'event 39', 'event 40', 'event 41', 'event 42']);
    // The older page's own bound: 1881 still earlier.
    expect(screen.getByRole('button', { name: /Show earlier messages \(1881 more\)/ })).toBeInTheDocument();
  });

  it('CONTROL: a thread that fits in one page offers nothing earlier', async () => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({
      data: [event(1), event(2)],
      page: { total: 2, hasEarlier: false, earliestId: 1 },
    });
    renderDetail({}, { isFullPage: true });
    expect(await screen.findByText('event 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show earlier messages/ })).toBeNull();
    expect(screen.getByText(/2 msgs/)).toBeInTheDocument();
  });

  it('CONTROL: a bare envelope (the backend before paging, a stub) is the whole thread', async () => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event(1), event(2)] });
    renderDetail({}, { isFullPage: true });
    expect(await screen.findByText('event 2')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Show earlier/ })).toBeNull());
    expect(screen.getByText(/2 msgs/)).toBeInTheDocument();
  });
});
