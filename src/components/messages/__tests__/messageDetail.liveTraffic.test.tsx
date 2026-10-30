/**
 * What an open thread costs the API while it is live — rendered for real over the REAL api-client
 * (only the wire and the socket are fake):
 *
 *  1. Our own send reloads once. The send path re-reads the thread and calls onRefresh when the
 *     request returns; the `message:replied` echo of that same send (it carries our idempotency
 *     key) used to do both again.
 *  2. A new message on the open thread (`thread:message`) reads only the events after the newest
 *     one on screen and appends them, instead of the 300-event window plus notes, activity,
 *     attachments, merges and participants (~6 GETs per message per viewer).
 *  3. Typing in the composer does not re-render the messages on screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { installTransport, ok, type WireRequest, type WireResponse } from '@/test/apiTransport';
import { resetOwnSends } from '@/lib/ownSends';
import type { Message, MessageEvent } from '@/types';

const socket = vi.hoisted(() => ({
  listeners: new Map<string, Set<(data?: unknown) => void>>(),
  emit(event: string, data?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(data);
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => undefined,
  subscribeToEvent: (event: string, listener: (data?: unknown) => void) => {
    const set = socket.listeners.get(event) ?? new Set();
    set.add(listener);
    socket.listeners.set(event, set);
  },
  unsubscribeFromEvent: (event: string, listener: (data?: unknown) => void) => {
    socket.listeners.get(event)?.delete(listener);
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ departments: [], data: [], teamsEnabled: true }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
// The composer's editor is out of scope: a field that writes the text, and Send.
vi.mock('../MessageComposer', () => ({
  MessageComposer: ({
    setComposer,
    onSend,
  }: {
    setComposer: (value: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="composer">
      <textarea aria-label="reply text" onChange={(event) => setComposer(event.target.value)} />
      <button type="button" onClick={onSend}>
        send draft
      </button>
    </div>
  ),
}));
vi.mock('../MessagePanelTabs', () => ({ MessagePanelTabs: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
// Every render of a message on screen passes through its bubble: count them.
const bubbles = vi.hoisted(() => ({ renders: 0 }));
vi.mock('../ThreadBubble', () => ({
  ThreadBubble: ({ content }: { content?: string | null }) => {
    bubbles.renders += 1;
    return <div data-testid="bubble">{content}</div>;
  },
}));

import { MessageDetail } from '../MessageDetail';

const THREAD_ID = 101;
const event = (id: number, overrides: Partial<MessageEvent> = {}): MessageEvent => ({
  id,
  conversationId: THREAD_ID,
  type: 'inbound',
  content: `message ${id}`,
  channel: 'email',
  createdAt: `2026-09-22T10:${String(id % 60).padStart(2, '0')}:00Z`,
  ...overrides,
});

const message = {
  id: THREAD_ID,
  channel: 'email',
  subject: 'Where is my order?',
  content: 'Hello',
  sender: 'Cust <cust@example.com>',
  status: 'in_progress',
  lastReplyFromClient: true,
  assigneeId: null,
  metadata: {},
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

type ThreadMode = 'incremental' | 'legacy';
const backend = { mode: 'incremental' as ThreadMode, events: [] as MessageEvent[] };

const answer = (request: WireRequest): WireResponse => {
  if (request.method === 'GET' && request.path === `/api/messages/${THREAD_ID}/thread`) {
    const after = Number(request.params.afterEventId ?? 0);
    if (after > 0 && backend.mode === 'incremental') {
      const newer = backend.events.filter((row) => row.id > after);
      return {
        status: 200,
        data: { success: true, data: newer, incremental: true, hasMore: false },
      };
    }
    // A full read, or an older backend that ignores afterEventId.
    return {
      status: 200,
      data: {
        success: true,
        data: backend.events,
        page: {
          total: backend.events.length,
          hasEarlier: false,
          earliestId: backend.events[0]?.id,
        },
      },
    };
  }
  return ok([]);
};

let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1 });
  backend.mode = 'incremental';
  backend.events = [event(1), event(2), event(3)];
  bubbles.renders = 0;
  resetOwnSends();
  wire = installTransport(apiClient, answer);
});
afterEach(() => {
  cleanup();
  wire.restore();
  socket.listeners.clear();
});

const renderDetail = (props: Partial<React.ComponentProps<typeof MessageDetail>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={message} onClose={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

/**
 * The GETs a refresh makes. A message's own body (`/api/messages/events/:id/html`) is left out:
 * it is read once per event when the bubble comes into view (useMessageHtml, cached per event) —
 * the new content itself, not a re-read of what is already on screen.
 */
const gets = () =>
  wire.requests.filter(
    (request) => request.method === 'GET' && !request.path.startsWith('/api/messages/events/')
  );
const threadReads = () => wire.calls('GET', `/api/messages/${THREAD_ID}/thread`);
/** Let every request a render started settle, then report how many were made. */
const settle = async () => {
  let seen = -1;
  while (seen !== wire.requests.length) {
    seen = wire.requests.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  }
};

const opened = async (props: Partial<React.ComponentProps<typeof MessageDetail>> = {}) => {
  renderDetail(props);
  await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(3));
  await settle();
};

const liveMessage = async () => {
  act(() => socket.emit('thread:message', { conversationId: THREAD_ID }));
  // useThreadMessageRefresh coalesces for 500 ms.
  await act(() => new Promise((resolve) => setTimeout(resolve, 550)));
  await settle();
};

describe('our own send reloads once', () => {
  it('the echo carrying our idempotency key reloads nothing', async () => {
    const onRefresh = vi.fn();
    await opened({ onRefresh });
    fireEvent.change(screen.getByLabelText('reply text'), {
      target: { value: '<p>On its way</p>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'send draft' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    await settle();
    const sent = wire.calls('POST', `/api/messages/${THREAD_ID}/reply`)[0];
    const key = (sent?.body as { idempotencyKey?: string }).idempotencyKey;
    expect(key).toBeTruthy();
    const readsAfterSend = threadReads().length;

    act(() => socket.emit('message:replied', { messageId: THREAD_ID, idempotencyKey: key }));
    await settle();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(threadReads().length).toBe(readsAfterSend);
  });

  it("control: another agent's reply (other key, or none from an older backend) reloads", async () => {
    const onRefresh = vi.fn();
    await opened({ onRefresh });
    const reads = threadReads().length;
    act(() => socket.emit('message:replied', { messageId: THREAD_ID, idempotencyKey: 'other' }));
    await settle();
    act(() => socket.emit('message:replied', { messageId: THREAD_ID }));
    await settle();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(threadReads().length).toBe(reads + 2);
  });
});

describe('a new message on the open thread', () => {
  it('a reply from our side costs ONE request: the events after the newest on screen', async () => {
    await opened();
    const before = gets().length;
    backend.events = [...backend.events, event(4, { type: 'outbound', authorEmail: 'bot' })];
    await liveMessage();
    const made = gets().slice(before);
    expect(made.map((request) => request.path)).toEqual([`/api/messages/${THREAD_ID}/thread`]);
    expect(made[0]?.params.afterEventId).toBe('3');
    expect(screen.getAllByTestId('bubble')).toHaveLength(4);
  });

  it("a customer's message costs TWO: the new events + the thread's files", async () => {
    await opened();
    const before = gets().length;
    backend.events = [...backend.events, event(4)];
    await liveMessage();
    expect(
      gets()
        .slice(before)
        .map((request) => request.path)
        .sort()
    ).toEqual([`/api/messages/${THREAD_ID}/attachments`, `/api/messages/${THREAD_ID}/thread`]);
    expect(screen.getAllByTestId('bubble')).toHaveLength(4);
  });

  it('an event already on screen is not shown twice', async () => {
    await opened();
    backend.events = [...backend.events, event(4)];
    await liveMessage();
    await liveMessage();
    expect(screen.getAllByTestId('bubble')).toHaveLength(4);
  });

  it('control: an older backend ignores afterEventId — its window is applied, panels re-read', async () => {
    backend.mode = 'legacy';
    await opened();
    const before = gets().length;
    backend.events = [...backend.events, event(4)];
    await liveMessage();
    expect(threadReads().length).toBeGreaterThan(0);
    expect(gets().length - before).toBeGreaterThan(2);
    expect(screen.getAllByTestId('bubble')).toHaveLength(4);
  });
});

describe('typing in the composer', () => {
  it('re-renders none of the messages on screen', async () => {
    await opened();
    const rendersBefore = bubbles.renders;
    const field = screen.getByLabelText('reply text');
    for (const text of ['O', 'On', 'On i', 'On its', 'On its way']) {
      fireEvent.change(field, { target: { value: `<p>${text}</p>` } });
    }
    expect(bubbles.renders - rendersBefore).toBe(0);
  });
});
