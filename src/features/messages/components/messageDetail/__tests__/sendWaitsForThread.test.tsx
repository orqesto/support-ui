/**
 * A reply sent while the thread's events are still being read waits for them (what it may repeat
 * is only known from the thread). What waits is the reply AS PRESSED; it goes out once; a read
 * that fails or takes too long sends nothing and says so. Through MessageDetail, as the app calls
 * the services. Invented data.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { subscribeToEvent } from '@/lib/socketManager';
import type { Message } from '@/types';
import { MessageDetail } from '../../MessageDetail';
import { WAIT_FOR_THREAD_MS } from '../useReplySend';

const NOT_LOADED = 'Could not load the conversation. Check your connection and send again.';
const editor = () => screen.getByTestId('rich-text-editor');
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const sendButton = () => screen.getByRole('button', { name: /^(SEND|SENDING…)$/ });
const pressSend = () => fireEvent.click(sendButton());
const posts = () => svc.message.reply.mock.calls as unknown[][];
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 60)));

type Events = ReturnType<typeof event>[];
/** Every read of the thread is held until the test lands or fails it. */
const reads: { land: (events: Events) => Promise<void>; fail: () => Promise<void> }[] = [];

beforeEach(() => {
  window.localStorage.clear();
  reads.length = 0;
  svc.message.reply = vi.fn().mockResolvedValue({ success: true });
  svc.message.getThreadMessages = vi.fn().mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        reads.push({
          land: (events) => act(() => Promise.resolve(resolve({ data: events }))),
          fail: () => act(() => Promise.resolve(reject(new Error('read failed')))),
        });
      })
  );
});
afterEach(() => vi.useRealTimers());

describe('what waits is the reply as it was pressed', () => {
  // (The editor is read-only during the wait — sendOnceAsPressed.test.tsx; these hold whatever
  //  reaches the composer another way.)
  it('text typed after Send does not reach the composer, and is not what goes out', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    type('<p>On its way. And one more half-typed senten</p>');
    expect(editor()).toHaveValue('<p>On its way.</p>');
    await reads[0].land([event({ id: 900 })]);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1]).toBe('<p>On its way.</p>');
  });

  it('words a command put into the composer after Send: the pressed reply goes out, and they are kept', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    fireEvent.click(screen.getByTestId('rte-command'));
    await reads[0].land([event({ id: 900 })]);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1]).toBe('<p>On its way.</p>');
    await settle();
    expect(editor()).toHaveValue('<p>On its way.</p><p>Put in by a command</p>');
  });

  it('Send pressed three times while waiting, then more reads and events: one POST', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    pressSend();
    pressSend();
    await reads[0].land([event({ id: 900 })]);
    await settle();
    for (const read of reads.slice(1)) await read.land([event({ id: 900 }), event({ id: 901 })]);
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it('the thread is left (unmounted) while waiting: nothing is sent when the read lands', async () => {
    const view = renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    view.unmount();
    await reads[0].land([event({ id: 900 })]);
    await settle();
    expect(posts()).toHaveLength(0);
  });

  it('a switch to another thread without a remount: the reply pressed for the first is not sent to the second', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (message: Message) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MessageDetail message={message} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(view(baseMessage));
    type('<p>For the first thread.</p>');
    pressSend();
    rerender(view({ ...baseMessage, id: 202, publicId: 'SUP-202' } as Message));
    await settle();
    for (const read of [...reads]) await read.land([event({ id: 977 })]);
    await settle();
    expect(posts()).toHaveLength(0);
  });
});

describe('the thread cannot be read: nothing is sent, the text stays, and it says so', () => {
  it('the read fails', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    await reads[0].fail();
    expect(await screen.findByText(NOT_LOADED)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(editor()).toHaveValue('<p>On its way.</p>');
    expect(sendButton().textContent).toBe('SEND');
  });

  it('Send pressed again reads the thread again and waits for it: one POST, with what the thread showed', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    await reads[0].fail();
    await screen.findByText(NOT_LOADED);
    expect(reads).toHaveLength(1);
    pressSend();
    await waitFor(() => expect(reads).toHaveLength(2));
    expect(screen.queryByText(NOT_LOADED)).toBeNull();
    expect(posts()).toHaveLength(0);
    await reads[1].land([event({ id: 900 })]);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1]).toBe('<p>On its way.</p>');
    expect(posts()[0][10]).toEqual({ seenLastEventId: 900 });
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it('…and when that read fails too: the message again, nothing sent, no further read on its own', async () => {
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    await reads[0].fail();
    await screen.findByText(NOT_LOADED);
    pressSend();
    await waitFor(() => expect(reads).toHaveLength(2));
    await reads[1].fail();
    expect(await screen.findByText(NOT_LOADED)).toBeTruthy();
    await settle();
    expect(reads).toHaveLength(2);
    expect(posts()).toHaveLength(0);
  });

  it(`the read never answers: after ${WAIT_FOR_THREAD_MS / 1000} s the same outcome`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderDetail();
    type('<p>On its way.</p>');
    pressSend();
    act(() => void vi.advanceTimersByTime(WAIT_FOR_THREAD_MS - 1));
    expect(screen.queryByText(NOT_LOADED)).toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.getByText(NOT_LOADED)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    expect(editor()).toHaveValue('<p>On its way.</p>');
    expect(sendButton().textContent).toBe('SEND');
    // …and the read landing afterwards sends nothing on its own.
    vi.useRealTimers();
    await reads[0].land([event({ id: 900 })]);
    await settle();
    expect(posts()).toHaveLength(0);
  });
});

describe('a send-failed event while this tab saves a NOTE still reads the thread', () => {
  const reply = (metadata: Record<string, unknown>) =>
    event({
      id: 950,
      type: 'agent_reply',
      content: 'We are looking into it.',
      authorId: 8,
      metadata,
    });

  it("a colleague's reply fails while the note is out: the newest events are read and the bubble says so", async () => {
    svc.message.getThreadMessages = vi
      .fn()
      .mockResolvedValue({ data: [event({ id: 900 }), reply({})] });
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue({
      data: [reply({ delivered: false })],
      page: { total: 1, hasEarlier: false },
      newEvents: { incremental: true, hasMore: false },
    });
    let finish: (value: unknown) => void = () => undefined;
    svc.message.addNote = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderDetail();
    await screen.findAllByText('Hi there');
    fireEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    await settle();
    type('<p>Checked with the warehouse.</p>');
    fireEvent.click(screen.getByRole('button', { name: /post note/i }));
    await waitFor(() => expect(svc.message.addNote).toHaveBeenCalledTimes(1));
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'send-failed')
      .map(([, handler]) => handler as (data: unknown) => void);
    act(() => handlers.at(-1)?.({ messageId: baseMessage.id, outgoingMessageId: 950 }));
    expect(await screen.findByText('Not delivered')).toBeTruthy();
    expect(svc.message.getThreadMessagesAfter).toHaveBeenCalledTimes(1);
    await act(() => Promise.resolve(finish({ success: true })));
  });
});
