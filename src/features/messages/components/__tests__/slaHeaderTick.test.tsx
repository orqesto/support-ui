/**
 * The header's SLA and Resolve chips are clocks: while the thread stays open and nothing about it
 * changes, they must still move. They were memoised on the message's fields only, so a thread left
 * open on screen showed the minute it was opened at forever.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { message as baseMessage, renderHeader } from './md4.header.utils';
import type { Message } from '@/types';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: { getCategories: () => Promise.resolve([]) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));

const NOW = Date.parse('2026-11-12T12:00:00Z');
const MIN = 60 * 1000;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the header SLA clocks tick', () => {
  it('after 2 minutes on screen, the SLA and Resolve chips show 2 more minutes', async () => {
    renderHeader({
      message: {
        ...baseMessage,
        status: 'open',
        slaResponseMinutes: 60,
        slaWaitStartedAt: ago(10),
        lastReplyFromClient: true,
        slaResolutionMinutes: 240,
        slaResolutionStartedAt: ago(30),
      } as Message,
    });
    const reply = await screen.findByTestId('sla-clock');
    const resolve = screen.getByTestId('sla-resolution-clock');
    expect(reply.textContent).toContain('10m');
    expect(resolve.textContent).toContain('30m');

    act(() => {
      vi.advanceTimersByTime(2 * MIN);
    });

    expect(screen.getByTestId('sla-clock').textContent).toContain('12m');
    expect(screen.getByTestId('sla-resolution-clock').textContent).toContain('32m');
  });

  it('a message change between ticks is judged at the current time, not the last tick', async () => {
    const open = {
      ...baseMessage,
      status: 'open',
      slaResponseMinutes: 60,
      slaWaitStartedAt: ago(5),
      lastReplyFromClient: true,
    } as Message;
    const { rerenderHeader } = renderHeader({ message: open });
    expect((await screen.findByTestId('sla-clock')).textContent).toContain('5m');
    // 50 s later, no tick yet: a new customer message moves the wait start to 10 m 30 s ago.
    vi.setSystemTime(NOW + 50_000);
    rerenderHeader({
      message: { ...open, slaWaitStartedAt: new Date(NOW - 10.5 * MIN).toISOString() } as Message,
    });
    // At the current time that is 11 m 20 s; read at the last tick it would be 10 m.
    expect(screen.getByTestId('sla-clock').textContent).toContain('11m');
  });
});
