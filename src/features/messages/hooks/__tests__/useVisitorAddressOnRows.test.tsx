/**
 * A website visitor with no email leaves one while the Threads list is open: the row — the real
 * list row, fed by the real list data hook — shows the address without a reload. The backend
 * announces it as `conversation:new`, which on the list's first page reads no row by itself.
 *
 * Fake timers: the refresh window is advanced exactly instead of slept through. They go on only
 * AFTER the list is shown, and WITHOUT `shouldAdvanceTime`: with it the fake clock also follows
 * real time, so a runner stalled for a few tens of ms (GC, a busy CI box) between the event and
 * "one millisecond short" moved the clock past the window and the read had already happened —
 * the ~1-in-3 failure, reproduced by holding the thread 30 ms there. The list is shown, and the
 * address awaited, on real timers so `waitFor` keeps working. `show()` lets pending effects run
 * before it returns: an event fired before the hook has seen the rows is ignored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';

const { getThreads, getById } = vi.hoisted(() => ({ getThreads: vi.fn(), getById: vi.fn() }));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads, getById } }));
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(() => null),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ABC' }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { subscribeToEvent } from '@/lib/socketManager';
import { MessageListItem } from '../../components/MessageListItem';
import { useMessagesData } from '../useMessagesData';
import { VISITOR_ADDRESS_ROW_REFRESH_MS } from '../useVisitorAddressOnRows';

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitor (no email)';

const thread = (id: number, sender: string) => ({
  threadId: `conv_${id}`,
  publicId: `SUP-${id}`,
  sender,
  subject: `Subject ${id}`,
  status: 'open',
  priority: 'medium',
  channel: 'chat',
  lastMessageAt: new Date().toISOString(),
  latestMessage: {
    id: id * 10,
    conversationId: id,
    type: 'inbound',
    content: 'Hello',
    channel: 'chat',
    createdAt: new Date().toISOString(),
    metadata: {},
  },
});

function List() {
  const urlSyncedRef = useRef(true);
  const { threads } = useMessagesData({ urlSyncedRef, isKanban: false });
  return (
    <>
      {threads.map((row) => (
        <MessageListItem
          key={row.threadId}
          thread={row}
          onOpen={() => {}}
          selected={false}
          onToggleSelected={() => {}}
        />
      ))}
    </>
  );
}

const fire = (data: unknown) => {
  const calls = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([event]) => event === 'conversation:new');
  calls.forEach(([, handler]) => (handler as (data: unknown) => void)(data));
  return calls.length;
};
const pass = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const show = async () => {
  getThreads.mockResolvedValue({
    success: true,
    data: [thread(7, PLACEHOLDER), thread(8, 'bo@example.com')],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  });
  render(
    <MemoryRouter>
      <List />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0));
  // The hook learns the rows in an effect after the paint: let it run before any event comes.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // From here the clock moves only when the test moves it.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
};

beforeEach(() => {
  vi.clearAllMocks();
  getById.mockResolvedValue({ success: true, data: { id: 7, sender: 'ada@example.com' } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the list row of a website visitor who leaves an email later', () => {
  it('shows the address once it is announced, without the list being read again', async () => {
    await show();
    expect(fire({ conversationId: 7 })).toBeGreaterThan(0);
    await pass(VISITOR_ADDRESS_ROW_REFRESH_MS - 1);
    expect(getById).not.toHaveBeenCalled();
    await pass(1);
    expect(getById).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await waitFor(() => expect(screen.getAllByText('ada@example.com').length).toBeGreaterThan(0));
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(document.body.innerHTML).not.toContain('chat-widget.local');
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith(7);
    expect(getThreads).toHaveBeenCalledTimes(1);
  });

  it('events inside the window join ONE read', async () => {
    await show();
    fire({ conversationId: 7 });
    fire({ conversationId: 7 });
    await pass(VISITOR_ADDRESS_ROW_REFRESH_MS);
    expect(getById).toHaveBeenCalledTimes(1);
  });

  it('keeps the label when the visitor still has no email', async () => {
    getById.mockResolvedValue({ success: true, data: { id: 7, sender: PLACEHOLDER } });
    await show();
    fire({ conversationId: 7 });
    await pass(VISITOR_ADDRESS_ROW_REFRESH_MS);
    expect(getById).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0);
  });

  it('CONTROL: mail on a row that has an address, or on a thread not shown, reads nothing', async () => {
    await show();
    fire({ conversationId: 8 });
    fire({ conversationId: 99 });
    fire({});
    await pass(VISITOR_ADDRESS_ROW_REFRESH_MS);
    expect(getById).not.toHaveBeenCalled();
    expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0);
  });
});
