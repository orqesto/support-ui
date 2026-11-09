/**
 * usePresenceReport: the ticket composer reports this tab's state on its ticked threads while the
 * ticket view holds the watch on the same socket (and, in the arbiter block, reports viewing).
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { createElement, Fragment } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import type { PresenceSettings } from '../presence.types';

type Handler = (data: unknown) => void;
const fake = vi.hoisted(() => ({
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  emitWithAck: null as unknown as Mock,
  emit: null as unknown as Mock,
}));

vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({
    timeout: () => ({ emitWithAck: fake.emitWithAck }),
    emit: fake.emit,
  }),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: Handler) => {
    if (!fake.handlers.has(event)) fake.handlers.set(event, new Set());
    fake.handlers.get(event)?.add(handler);
  },
  unsubscribeFromEvent: (event: string, handler: Handler) => {
    fake.handlers.get(event)?.delete(handler);
  },
}));

const { usePresenceWatch } = await import('../usePresenceWatch');
const { usePresenceReport } = await import('../usePresenceReport');
const { resetPresenceClientForTests } = await import('../presenceClient');
const { resetWatchRegistryForTests } = await import('../watchRegistry');
const { resetPresenceArbiterForTests } = await import('../presenceArbiter');
const { VIEWER_ONLY_REPORTER } = await import('../usePresenceReporter');

const SETTINGS: PresenceSettings = {
  enabled: true,
  heartbeatMs: 15_000,
  expiryMs: 45_000,
  writingIdleMs: 120_000,
  awayAfterMs: 300_000,
  listFlushMs: 2_000,
  ticketWatchCap: 50,
};
const okAck = (ids: number[]) => ({
  ok: true,
  organizationId: 1,
  viewers: {},
  settings: SETTINGS,
  mapped: Object.fromEntries(ids.map((id) => [id, id])),
});

const states = () =>
  (fake.emit.mock.calls as unknown[][])
    .filter(([name]) => name === 'presence:state')
    .map(([, payload]) => payload as { conversationId: number; state: string });
const watchEvents = () =>
  [...(fake.emitWithAck.mock.calls as unknown[][]), ...(fake.emit.mock.calls as unknown[][])]
    .map(([name]) => name)
    .filter((name) => name === 'presence:watch' || name === 'presence:unwatch');

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

type Props = { watched: number[]; selected: number[]; text: string };
const edit = { current: null as number | null };
const renderPair = (initialProps: Props) =>
  renderHook(
    ({ watched, selected, text }: Props) => {
      usePresenceWatch(watched);
      usePresenceReport(selected, {
        composerText: text,
        composerMode: 'reply',
        lastAgentEditAt: edit,
      });
    },
    { initialProps }
  );

beforeEach(() => {
  vi.useFakeTimers();
  fake.handlers.clear();
  fake.emit = vi.fn();
  fake.emitWithAck = vi.fn((event: string, payload?: { conversationIds: number[] }) =>
    Promise.resolve(
      event === 'presence:watch' ? okAck(payload?.conversationIds ?? []) : { ok: true }
    )
  );
  resetPresenceClientForTests();
  resetWatchRegistryForTests();
  resetPresenceArbiterForTests();
  edit.current = null;
  useAuthStore.setState({ user: { id: 1, role: 'user' } as User, selectedOrganizationId: 1 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePresenceReport — state from the ticket composer', () => {
  it('reports on the ticked threads the ticket view watches, and skips one it does not', async () => {
    renderPair({ watched: [10, 11], selected: [10, 11, 99], text: '' });
    await settle(1_000);
    expect(states()).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 11, state: 'viewing' },
    ]);
  });

  it('typing a reply turns those threads to writing_reply', async () => {
    const { rerender } = renderPair({ watched: [10, 11], selected: [10], text: '' });
    await settle(1_500);
    edit.current = Date.now();
    rerender({ watched: [10, 11], selected: [10], text: '<p>We are on it</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'writing_reply' });
    expect(states().some((row) => row.conversationId === 11)).toBe(false);
  });

  it('sends no watch or unwatch of its own (only the ticket view watches)', async () => {
    const { rerender, unmount } = renderPair({ watched: [10], selected: [10], text: '' });
    await settle(1_000);
    expect(watchEvents()).toEqual(['presence:watch']);
    rerender({ watched: [10], selected: [], text: '' });
    await settle(1_000);
    expect(watchEvents()).toEqual(['presence:watch']);
    unmount();
    // The only unwatch is the ticket view's own, on its unmount.
    expect(watchEvents()).toEqual(['presence:watch', 'presence:unwatch']);
  });

  it('a thread unticked while writing goes back to viewing', async () => {
    edit.current = Date.now();
    const { rerender } = renderPair({ watched: [10], selected: [10], text: '<p>Draft</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'writing_reply' });
    rerender({ watched: [10], selected: [], text: '<p>Draft</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'viewing' });
  });

  it('a global admin sends nothing', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } as User });
    edit.current = Date.now();
    renderPair({ watched: [10], selected: [10], text: '<p>Draft</p>' });
    await settle(20_000);
    expect(states()).toEqual([]);
  });

  it('keeps the entry alive with a heartbeat', async () => {
    renderPair({ watched: [10], selected: [10], text: '' });
    await settle(1_000);
    expect(states()).toHaveLength(1);
    await settle(SETTINGS.heartbeatMs);
    expect(states()).toHaveLength(2);
  });

  it('a viewer-list event that changes no watch does not re-render the reporter', async () => {
    let reporterRenders = 0;
    const input = { composerText: '', composerMode: 'reply' as const, lastAgentEditAt: edit };
    const Watcher = () => {
      usePresenceWatch([10]);
      return null;
    };
    const Reporter = () => {
      reporterRenders += 1;
      usePresenceReport([10], input);
      return null;
    };
    render(createElement(Fragment, null, createElement(Watcher), createElement(Reporter)));
    await settle(1_000);
    expect(states()).toHaveLength(1); // the reporter is live: it sent its state
    const before = reporterRenders;
    await act(async () => {
      fake.handlers.get('presence:thread')?.forEach((handler) =>
        handler({
          organizationId: 1,
          conversationId: 10,
          viewers: [{ userId: 2, state: 'viewing', since: '2026-11-09T10:00:00Z' }],
        })
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reporterRenders).toBe(before);
  });
});

describe('presence arbiter — the ticket view and its composer on one socket', () => {
  /** The ticket view (watches + reports viewing) and, on the Threads tab, the composer. */
  const TicketView = ({ ids }: { ids: number[] }) => {
    usePresenceWatch(ids, VIEWER_ONLY_REPORTER);
    return null;
  };
  const Composer = ({ selected, text }: { selected: number[]; text: string }) => {
    usePresenceReport(selected, {
      composerText: text,
      composerMode: 'reply',
      lastAgentEditAt: edit,
    });
    return null;
  };
  const Page = ({ composer, text = '' }: { composer: boolean; text?: string }) =>
    createElement(
      Fragment,
      null,
      createElement(TicketView, { ids: [10, 11, 12] }),
      composer ? createElement(Composer, { selected: [11], text }) : null
    );
  const statesOf = (id: number) =>
    states()
      .filter((row) => row.conversationId === id)
      .map((row) => row.state);

  it('the ticket view on its Details tab (no composer) sends viewing for every watched thread', async () => {
    render(createElement(Page, { composer: false }));
    await settle(1_000);
    expect(states()).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 11, state: 'viewing' },
      { conversationId: 12, state: 'viewing' },
    ]);
  });

  it('CONTROL: a global admin on the ticket view sends nothing', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } as User });
    render(createElement(Page, { composer: false }));
    await settle(20_000);
    expect(states()).toEqual([]);
  });

  it('typing on a ticked thread: writing_reply there only, the others stay viewing — no flapping', async () => {
    // Details tab first; the Threads tab (the composer) opens 5 s later, so the two heartbeats
    // fall at different moments.
    const { rerender } = render(createElement(Page, { composer: false }));
    await settle(5_000);
    edit.current = Date.now();
    rerender(createElement(Page, { composer: true, text: '<p>On it</p>' }));
    await settle(1_500);
    await settle(2 * SETTINGS.heartbeatMs);
    const eleven = statesOf(11);
    const firstWriting = eleven.indexOf('writing_reply');
    expect(firstWriting).toBeGreaterThan(-1);
    // The ticket view's heartbeat never overwrites the composer's "writing".
    expect(eleven.slice(firstWriting).every((state) => state === 'writing_reply')).toBe(true);
    expect(eleven.slice(firstWriting).length).toBeGreaterThanOrEqual(3);
    expect(statesOf(10).every((state) => state === 'viewing')).toBe(true);
    expect(statesOf(12).every((state) => state === 'viewing')).toBe(true);
    expect(statesOf(10).length).toBeGreaterThanOrEqual(3); // first send + heartbeats
  });

  it('the composer leaving does not drop the ticket view: its thread goes back to viewing, all stay alive', async () => {
    edit.current = Date.now();
    const { rerender } = render(createElement(Page, { composer: true, text: '<p>On it</p>' }));
    await settle(1_500);
    expect(statesOf(11).at(-1)).toBe('writing_reply');
    rerender(createElement(Page, { composer: false }));
    await settle(1_500);
    expect(statesOf(11).at(-1)).toBe('viewing');
    const before = states().length;
    await settle(SETTINGS.heartbeatMs);
    expect(states().slice(before)).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 11, state: 'viewing' },
      { conversationId: 12, state: 'viewing' },
    ]);
  });

  it('a second view leaving does not drop the writer: the thread view keeps writing_reply', async () => {
    // The thread view (MessageDetail) writing on 11, and a viewer-only watcher of 11 beside it.
    const Thread = () => {
      usePresenceWatch([11], {
        composerText: '<p>On it</p>',
        composerMode: 'reply',
        lastAgentEditAt: edit,
      });
      return null;
    };
    const Viewer = () => {
      usePresenceWatch([10, 11], VIEWER_ONLY_REPORTER);
      return null;
    };
    edit.current = Date.now();
    const Both = ({ viewer }: { viewer: boolean }) =>
      createElement(Fragment, null, createElement(Thread), viewer ? createElement(Viewer) : null);
    const { rerender } = render(createElement(Both, { viewer: true }));
    await settle(1_500);
    expect(statesOf(11).at(-1)).toBe('writing_reply');
    rerender(createElement(Both, { viewer: false }));
    await settle(SETTINGS.heartbeatMs);
    expect(statesOf(11).at(-1)).toBe('writing_reply');
    expect(statesOf(11)).not.toContain('viewing');
  });
});
