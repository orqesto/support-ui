/**
 * "No reply needed" (owner 2026-11-17): a customer email that only thanks or confirms gets no AI
 * draft; the backend marks the thread `metadata.noReplyNeeded = {eventId, at}`. The inbox card says
 * so while nothing on the row contradicts it, and the thread says so in place of "No suggestion
 * found" while that email is the customer's latest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { getAiState, noReplyNeededShown } from '../inboxCardHelpers';
import { MessageGhostBubble } from '../MessageGhostBubble';
import { useThreadEvents } from '../messageDetail/useThreadEvents';
import { MARKER_READ_BACKOFF_MS, useNoReplyNote } from '../messageDetail/useNoReplyNote';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';
import { messageService } from '@/services/message.service';
import type { Message, MessageEvent } from '@/types';
import type { MessageThread } from '@/services/message.service';

const socketHandlers = vi.hoisted(() => new Map<string, Set<(data: unknown) => void>>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: vi.fn(),
  subscribeToEvent: (name: string, handler: (data: unknown) => void) => {
    if (!socketHandlers.has(name)) socketHandlers.set(name, new Set());
    socketHandlers.get(name)?.add(handler);
  },
  unsubscribeFromEvent: (name: string, handler: (data: unknown) => void) =>
    socketHandlers.get(name)?.delete(handler),
}));
const emit = (name: string) => socketHandlers.get(name)?.forEach((handler) => handler(undefined));

const thread = { isLead: false } as unknown as MessageThread;
const MARKED_AT = '2026-11-17T21:30:00.000Z';
const card = (metadata: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({
    id: 1,
    status: 'open',
    needsHumanReview: false,
    lastReplyFromClient: true,
    lastReplyAt: '2026-11-17T21:27:00.000Z',
    metadata,
    ...extra,
  }) as unknown as Message;
const marked = { noReplyNeeded: { eventId: 7, at: MARKED_AT } };

describe('inbox card — "No reply needed" chip', () => {
  it('shows for a thread the backend marked, the customer having written last', () => {
    expect(getAiState(card(marked), thread)?.label).toBe('No reply needed');
  });

  it('never promises the AI draft button (it is off when drafts are off)', () => {
    expect(getAiState(card(marked), thread)?.tooltip).not.toMatch(/still writes|by hand/);
  });

  it.each([
    ['no marker', card({})],
    ['a marker of another shape', card({ noReplyNeeded: true })],
    ['a string id', card({ noReplyNeeded: { eventId: '7', at: MARKED_AT } })],
    ['our reply is the last word', card(marked, { lastReplyFromClient: false })],
    ['a draft stored by hand', card({ ...marked, suggestedAnswer: { answer: 'hi' } })],
  ])('no chip with %s', (_label, message) => {
    expect(noReplyNeededShown(message, thread)).toBe(false);
  });

  it('a thread we never answered (lastReplyFromClient null) shows it — as the thread view does', () => {
    expect(noReplyNeededShown(card(marked, { lastReplyFromClient: null }), thread)).toBe(true);
  });

  it('trusts the backend marker: no row-time rule of its own (the backend clears a stale one)', () => {
    expect(noReplyNeededShown(card({ noReplyNeeded: { eventId: 7 } }), thread)).toBe(true);
  });

  it('a resolved or closed thread (its latest message) has no chip — the thread view shows none', () => {
    expect(noReplyNeededShown(card(marked, { status: 'resolved' }), thread)).toBe(false);
    const closedLatest = {
      ...thread,
      latestMessage: card(marked, { status: 'closed' }),
    } as MessageThread;
    expect(noReplyNeededShown(card(marked, { status: 'open' }), closedLatest)).toBe(false);
  });

  it("the row gives no reply flag: the thread's says our reply was last — no chip", () => {
    const answered = { ...thread, lastReplyFromClient: false } as unknown as MessageThread;
    expect(noReplyNeededShown(card(marked, { lastReplyFromClient: undefined }), answered)).toBe(
      false
    );
  });

  it('a stored draft (an object, as the backend filter reads it) hides the chip', () => {
    const stored = card({ ...marked, suggestedAnswer: { answer: 'old' } });
    expect(noReplyNeededShown(stored, thread)).toBe(false);
    // Not a draft object: the filter lists the thread, so the card shows the chip.
    expect(noReplyNeededShown(card({ ...marked, suggestedAnswer: 'text' }), thread)).toBe(true);
  });

  it('a review reason keeps its chip; a STALE "Auto-handled" from an earlier email does not', () => {
    expect(getAiState(card(marked, { needsHumanReview: true }), thread)?.label).toBe(
      'Needs review'
    );
    expect(getAiState(card({ ...marked, autoReply: { sent: true } }), thread)?.label).toBe(
      'No reply needed'
    );
    // CONTROL: without a marker the auto-replied thread still reads "Auto-handled".
    expect(getAiState(card({ autoReply: { sent: true } }), thread)?.label).toBe('Auto-handled');
    // The bot_handled filter's column decides when the list sends it (review of #980).
    expect(getAiState(card({}, { botHandled: true }), thread)?.label).toBe('Auto-handled');
    expect(
      getAiState(card({ autoReply: { sent: true } }, { botHandled: false }), thread)
    ).toBeNull();
  });
});

const event = (id: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'inbound',
    metadata: { spamCheck: { category: 'legitimate' } },
    createdAt: `2026-11-17T1${id}:00:00Z`,
    ...extra,
  }) as unknown as MessageEvent;

describe("thread view — the served marker is shown as it is (the rule is the backend's)", () => {
  const marker = { noReplyNeeded: { eventId: 2 } };
  const conversation = (metadata: Record<string, unknown>, status = 'open') =>
    ({ id: 41, channel: 'email', status, metadata }) as unknown as Message;
  type Read = Awaited<ReturnType<typeof messageService.getById>>;
  const served = (metadata: Record<string, unknown>) =>
    ({ success: true, data: conversation(metadata) }) as unknown as Read;
  /** A read the test settles. */
  const pendingRead = () => {
    let settle: { resolve: (value: Read) => void; reject: (error: Error) => void } | undefined;
    const promise = new Promise<Read>((resolve, reject) => {
      settle = { resolve, reject };
    });
    return { promise, ...settle! };
  };
  const mountNote = (message: Message, newestInboundId: number, eventsLoaded = true) =>
    renderHook(
      (props: { message: Message; newest: number; loaded: boolean }) =>
        useNoReplyNote(props.message, props.newest, props.loaded),
      { initialProps: { message, newest: newestInboundId, loaded: eventsLoaded } }
    );
  const turn = () => act(() => vi.advanceTimersByTimeAsync(0));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    socketHandlers.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a served marker with nothing newer loaded: the note at once, and no read of its own', () => {
    const getById = vi.spyOn(messageService, 'getById');
    const hook = mountNote(conversation(marker), 2);
    expect(hook.result.current).toBe(true);
    // Also while the events are still being read.
    expect(mountNote(conversation(marker), 0, false).result.current).toBe(true);
    expect(getById).not.toHaveBeenCalled();
  });

  it('SANITY: no marker served — no note, nothing read', () => {
    const getById = vi.spyOn(messageService, 'getById');
    expect(mountNote(conversation({}), 3).result.current).toBe(false);
    expect(getById).not.toHaveBeenCalled();
  });

  it('a resolved or closed thread: no note, and no read spent on one that cannot show', () => {
    const getById = vi.spyOn(messageService, 'getById');
    for (const status of ['resolved', 'closed']) {
      expect(mountNote(conversation(marker, status), 3).result.current).toBe(false);
    }
    expect(getById).not.toHaveBeenCalled();
  });

  it('a newer inbound event: hidden while its read is in flight; the answer decides (still marked: shown)', async () => {
    const read = pendingRead();
    const getById = vi.spyOn(messageService, 'getById').mockReturnValue(read.promise);
    const hook = mountNote(conversation(marker), 3);
    expect(hook.result.current).toBe(false);
    expect(getById).toHaveBeenCalledTimes(1);
    read.resolve(served(marker));
    await turn();
    expect(hook.result.current).toBe(true);
    expect(getById).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the answer serves no marker (the customer wrote again): no note', async () => {
    vi.spyOn(messageService, 'getById').mockResolvedValue(served({}));
    const hook = mountNote(conversation(marker), 3);
    await turn();
    expect(hook.result.current).toBe(false);
  });

  it('another refresh of the conversation (sent before the ask) landing meanwhile confirms nothing', async () => {
    const read = pendingRead();
    vi.spyOn(messageService, 'getById').mockReturnValue(read.promise);
    const hook = mountNote(conversation(marker), 3);
    // The parent hands over a NEW conversation object still carrying the old marker.
    hook.rerender({ message: conversation({ ...marker }), newest: 3, loaded: true });
    await turn();
    expect(hook.result.current).toBe(false);
    // Only THIS read's answer counts.
    read.resolve(served({}));
    await turn();
    expect(hook.result.current).toBe(false);
  });

  it('a newer email arriving while a read is in flight: the earlier answer is dropped, the new one decides', async () => {
    const first = pendingRead();
    const second = pendingRead();
    const getById = vi
      .spyOn(messageService, 'getById')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const message = conversation(marker);
    const hook = mountNote(message, 3);
    hook.rerender({ message, newest: 4, loaded: true });
    expect(getById).toHaveBeenCalledTimes(2);
    // The answer for email 3 (an auto-ack: still marked) must not show the note over email 4.
    first.resolve(served(marker));
    await turn();
    expect(hook.result.current).toBe(false);
    second.resolve(served(marker));
    await turn();
    expect(hook.result.current).toBe(true);
  });

  it('focus or a reconnect while a read is still out starts no second read', async () => {
    const read = pendingRead();
    const getById = vi.spyOn(messageService, 'getById').mockReturnValue(read.promise);
    const hook = mountNote(conversation(marker), 3);
    for (let tab = 0; tab < 5; tab += 1) act(() => void window.dispatchEvent(new Event('focus')));
    act(() => emit(SOCKET_RECONNECTED_EVENT));
    await turn();
    expect(getById).toHaveBeenCalledTimes(1);
    read.resolve(served(marker));
    await turn();
    expect(hook.result.current).toBe(true);
  });

  it('a retry at once (focus) keeps the count of failures: the next wait is the longer one', async () => {
    const getById = vi.spyOn(messageService, 'getById').mockRejectedValue(new Error('offline'));
    mountNote(conversation(marker), 3);
    await turn();
    // First failure: the 5 s wait is running. Focus retries now — the second failure.
    act(() => void window.dispatchEvent(new Event('focus')));
    await turn();
    expect(getById).toHaveBeenCalledTimes(2);
    // The next wait is the 30 s one, not 5 s again.
    await act(() => vi.advanceTimersByTimeAsync(MARKER_READ_BACKOFF_MS[0] + 100));
    expect(getById).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(MARKER_READ_BACKOFF_MS[1]));
    expect(getById).toHaveBeenCalledTimes(3);
  });

  it('switching thread while a retry is waiting: the old timer is gone, the new thread asks for itself', async () => {
    const getById = vi.spyOn(messageService, 'getById').mockRejectedValue(new Error('offline'));
    const hook = mountNote(conversation(marker), 3);
    await turn();
    expect(vi.getTimerCount()).toBe(1);
    const other = { ...conversation({ noReplyNeeded: { eventId: 7 } }), id: 42 } as Message;
    hook.rerender({ message: other, newest: 9, loaded: true });
    await turn();
    expect(getById).toHaveBeenLastCalledWith(42);
    expect(getById).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a failed read: hidden, tried again after 5 s, 30 s and 2 min, then no more', async () => {
    const getById = vi.spyOn(messageService, 'getById').mockRejectedValue(new Error('offline'));
    const hook = mountNote(conversation(marker), 3);
    await turn();
    expect(getById).toHaveBeenCalledTimes(1);
    for (const [index, wait] of MARKER_READ_BACKOFF_MS.entries()) {
      await act(() => vi.advanceTimersByTimeAsync(wait - 100));
      expect(getById).toHaveBeenCalledTimes(index + 1);
      await act(() => vi.advanceTimersByTimeAsync(101));
      expect(getById).toHaveBeenCalledTimes(index + 2);
      expect(hook.result.current).toBe(false);
    }
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(getById).toHaveBeenCalledTimes(MARKER_READ_BACKOFF_MS.length + 1);
    expect(hook.result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an unsuccessful answer (success: false) is a failed read too', async () => {
    const getById = vi
      .spyOn(messageService, 'getById')
      .mockResolvedValue({ success: false } as unknown as Read);
    const hook = mountNote(conversation(marker), 3);
    await turn();
    await act(() => vi.advanceTimersByTimeAsync(MARKER_READ_BACKOFF_MS[0] + 1));
    expect(getById).toHaveBeenCalledTimes(2);
    expect(hook.result.current).toBe(false);
  });

  it('still waiting: window focus and a socket reconnect each try again at once; a success then shows', async () => {
    const getById = vi.spyOn(messageService, 'getById').mockRejectedValue(new Error('offline'));
    const hook = mountNote(conversation(marker), 3);
    await turn();
    expect(getById).toHaveBeenCalledTimes(1);
    act(() => void window.dispatchEvent(new Event('focus')));
    await turn();
    expect(getById).toHaveBeenCalledTimes(2);
    getById.mockResolvedValue(served(marker));
    act(() => emit(SOCKET_RECONNECTED_EVENT));
    await turn();
    expect(getById).toHaveBeenCalledTimes(3);
    expect(hook.result.current).toBe(true);
    // Answered: focus asks for nothing more.
    act(() => void window.dispatchEvent(new Event('focus')));
    await turn();
    expect(getById).toHaveBeenCalledTimes(3);
  });

  it('unmounting while a retry is waiting leaves no timer and takes no late answer', async () => {
    const getById = vi.spyOn(messageService, 'getById').mockRejectedValue(new Error('offline'));
    const hook = mountNote(conversation(marker), 3);
    await turn();
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(getById).toHaveBeenCalledTimes(1);
  });

  it('WIRING (useThreadEvents): a loaded inbound event newer than the marked email asks for the marker', async () => {
    vi.spyOn(messageService, 'getThreadMessages').mockResolvedValue({
      data: [event(2), event(3)],
    } as unknown as Awaited<ReturnType<typeof messageService.getThreadMessages>>);
    const getById = vi.spyOn(messageService, 'getById').mockResolvedValue(served(marker));
    const hook = renderHook(() => useThreadEvents(conversation(marker), vi.fn(), vi.fn()));
    await turn();
    await turn();
    expect(getById).toHaveBeenCalledTimes(1);
    expect(hook.result.current.noReplyNeeded).toBe(true);
  });

  it('WIRING CONTROL: our own reply after the marked email asks for nothing', async () => {
    vi.spyOn(messageService, 'getThreadMessages').mockResolvedValue({
      data: [event(2), event(3, { type: 'outbound' })],
    } as unknown as Awaited<ReturnType<typeof messageService.getThreadMessages>>);
    const getById = vi.spyOn(messageService, 'getById');
    const hook = renderHook(() => useThreadEvents(conversation(marker), vi.fn(), vi.fn()));
    await turn();
    await turn();
    expect(getById).not.toHaveBeenCalled();
    expect(hook.result.current.noReplyNeeded).toBe(true);
  });
});

const noop = () => undefined;
const renderEmptyBubble = (
  noReplyNeeded?: boolean,
  extra: { autoReply?: { sent?: boolean }; aiLoading?: boolean } = {}
) =>
  render(
    <MessageGhostBubble
      aiLoading={extra.aiLoading ?? false}
      ghostVisible
      ghostOption={null}
      autoReply={extra.autoReply}
      composer=""
      composerMode="reply"
      resolved={false}
      {...(noReplyNeeded !== undefined ? { noReplyNeeded } : {})}
      alternativeCount={0}
      onGhostClick={noop}
      onShowAlternatives={noop}
    />
  );

describe('thread — no draft for a thank-you', () => {
  it('says why instead of "No suggestion found", and still points at the KB button', () => {
    renderEmptyBubble(true);
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
    expect(screen.getByText('KB')).toBeInTheDocument();
    expect(screen.queryByText(/No suggestion found/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still writes|by hand/)).not.toBeInTheDocument();
  });

  it('a marked thread shows its note, not the similar-search spinner first', () => {
    renderEmptyBubble(true, { aiLoading: true });
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
    expect(screen.queryByText(/Generating/)).not.toBeInTheDocument();
  });

  it('after an earlier auto-reply only the NOTE opens — never the spinner', () => {
    const { container } = renderEmptyBubble(false, { autoReply: { sent: true }, aiLoading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('an auto-reply to an EARLIER email does not hide the note for the latest thank-you', () => {
    renderEmptyBubble(true, { autoReply: { sent: true } });
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
  });

  it('CONTROL: not marked — "No suggestion found" as before', () => {
    renderEmptyBubble();
    expect(screen.getByText(/No suggestion found/)).toBeInTheDocument();
  });
});
