/**
 * Resend on an undelivered reply (owner 2026-11-20), through MessageDetail as the app calls the
 * services: the bubble's Resend puts the reply back in the composer, the next Send names it
 * (`resendOfEventId`) and the thread is read again in full — the backend hides the replaced
 * bubble, so the thread shows the reply once.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetail } from '../../MessageDetail';

const pressSend = () => fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));
const editor = () => screen.getByTestId('rich-text-editor');
const refused = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, data: { error: message, code } });

type Call = unknown[];
const keyOf = (call: Call | undefined) => call?.[5];
const optionsOf = (call: Call | undefined) => call?.[10];

const failed = (metadata: Record<string, unknown>) =>
  event({
    id: 942,
    type: 'agent_reply',
    content: 'Your parcel ships today.',
    authorEmail: 'support@shop.example',
    // The signed-in agent's own reply (the harness signs in user 7).
    authorId: 7,
    metadata,
  });

const withThread = (...events: ReturnType<typeof event>[]) => {
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: events });
};

beforeEach(() => {
  window.localStorage.clear();
  withThread(event({ id: 900 }), failed({ delivered: false }));
});

const ready = async () => {
  await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
  await screen.findByText('Not delivered');
};

describe('Resend on an undelivered reply', () => {
  it('puts the reply back in the composer, and Send names the event it replaces', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await waitFor(() => expect(editor()).toHaveValue('<p>Your parcel ships today.</p>'));
    expect(screen.getByText(/Resending a reply that was not delivered/)).toBeTruthy();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    const call = svc.message.reply.mock.calls[0] as Call;
    expect(call[1]).toBe('<p>Your parcel ships today.</p>');
    expect(optionsOf(call)).toEqual({ seenLastEventId: 942, resendOfEventId: 942 });
    // The replaced bubble is gone server-side: a FULL read, not the incremental one.
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    await waitFor(() => expect(screen.queryByText(/Resending a reply/)).toBeNull());
  });

  it('CONTROL: an ordinary reply carries no resendOfEventId', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Something else.</p>' } });
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(optionsOf(svc.message.reply.mock.calls[0] as Call)).toEqual({ seenLastEventId: 942 });
  });

  it('an uncertain reply warns that the customer may get it twice before it is put back', async () => {
    withThread(event({ id: 900 }), failed({ delivered: false, sendUncertain: true }));
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await screen.findByText('May not have been delivered');
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    const dialog = await screen.findByRole('dialog');
    expect(editor()).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resend anyway' }));
    await waitFor(() => expect(editor()).toHaveValue('<p>Your parcel ships today.</p>'));
    expect(
      screen.getByText(
        /We could not confirm that this reply reached the customer — if you resend it/
      )
    ).toBeTruthy();
  });

  it('never writes over a reply the agent is typing', async () => {
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>My own words.</p>' } });
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    expect(editor()).toHaveValue('<p>My own words.</p>');
    expect(screen.queryByText(/Resending a reply/)).toBeNull();
  });

  it('"Not a resend" keeps the text but sends it as a new reply', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    fireEvent.click(screen.getByRole('button', { name: 'Not a resend' }));
    expect(screen.queryByText(/Resending a reply/)).toBeNull();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(optionsOf(svc.message.reply.mock.calls[0] as Call)).toEqual({ seenLastEventId: 942 });
  });

  it('a refused resend ends the resend and offers no Retry (it would only be refused again)', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        refused(
          409,
          'REPLY_RESEND_SUPERSEDED',
          'This reply was already resent — reload the thread.'
        )
      );
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    pressSend();
    await screen.findByText('Send failed');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText(/Resending a reply/)).toBeNull();
  });

  it('each resend gets its own idempotency key, never the failed send kept for a retry', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    await ready();
    // A first send of the same words fails and keeps its key for a retry …
    fireEvent.change(editor(), { target: { value: '<p>Your parcel ships today.</p>' } });
    pressSend();
    await screen.findByText('Send failed');
    // … the agent clears it and resends the undelivered bubble with the same words instead.
    fireEvent.change(editor(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(keyOf(second)).toEqual(expect.any(String));
    expect(keyOf(second)).not.toBe(keyOf(first));
  });
});

/** Fire a socket event the way the socket would, to every handler subscribed to it. */
const socketEvent = async (name: string, payload: unknown) => {
  const { subscribeToEvent } = await import('@/lib/socketManager');
  const handlers = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([subscribed]) => subscribed === name)
    .map(([, handler]) => handler);
  act(() => {
    for (const handler of handlers) handler(payload);
  });
};
const incremental = (...events: ReturnType<typeof event>[]) => ({
  data: events,
  page: { total: events.length, hasEarlier: false },
  newEvents: { incremental: true, hasMore: false },
});

describe('after a resend', () => {
  it('a delivered resend reads the WHOLE thread (the incremental read cannot drop a bubble)', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    pressSend();
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    expect(svc.message.getThreadMessagesAfter).not.toHaveBeenCalled();
  });

  it('a resend that failed again offers no Retry: the new bubble carries its own Resend', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    pressSend();
    await screen.findByText('Send failed');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('CONTROL: an ordinary reply that failed the same way does offer Retry', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Something else.</p>' } });
    pressSend();
    await screen.findByText('Send failed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe("a Retry with the failed send's own key", () => {
  it('reads the whole thread: the backend replaced the dead attempt (one bubble)', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
      .mockResolvedValueOnce({ success: true });
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Something else.</p>' } });
    pressSend();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(keyOf(second)).toBe(keyOf(first));
    const readsAfterFailure = svc.message.getThreadMessages.mock.calls.length;
    await waitFor(() => expect(editor()).toHaveValue(''));
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThanOrEqual(
        readsAfterFailure
      )
    );
    expect(svc.message.getThreadMessagesAfter).not.toHaveBeenCalled();
  });

  it('CONTROL: a first send reads only the new events', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Something else.</p>' } });
    pressSend();
    await waitFor(() => expect(svc.message.getThreadMessagesAfter).toHaveBeenCalled());
  });
});

describe('live: the bubble follows the send', () => {
  it('a "Sending…" reply on screen turns "✓ Sent" from the next incremental read', async () => {
    withThread(event({ id: 900 }), failed({ sendState: 'sending' }));
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(
        incremental(
          failed({ isSystemReply: true }),
          event({ id: 950, type: 'agent_reply', content: 'Next one.' })
        )
      );
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await screen.findByText('Sending…');
    fireEvent.change(editor(), { target: { value: '<p>Next one.</p>' } });
    pressSend();
    await waitFor(() => expect(svc.message.getThreadMessagesAfter).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
  });

  it("a colleague's resend (message:replied naming the replaced bubble) re-reads the whole thread", async () => {
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await ready();
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    await socketEvent('message:replied', { messageId: 101, supersededEventId: 942 });
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    expect(svc.message.getThreadMessagesAfter).not.toHaveBeenCalled();
  });

  it('a reply delivered late (`late: true`, no status) re-reads the whole thread: its bubble turns "✓ Sent"', async () => {
    withThread(event({ id: 900 }), failed({ delivered: false, sendUncertain: true }));
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await screen.findByText('May not have been delivered');
    withThread(event({ id: 900 }), failed({ isSystemReply: true }));
    await socketEvent('message:replied', { messageId: 101, late: true });
    await screen.findByText('✓ Sent');
    expect(svc.message.getThreadMessagesAfter).not.toHaveBeenCalled();
  });

  it('CONTROL: an ordinary colleague reply reads only the new events', async () => {
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail();
    await ready();
    await socketEvent('message:replied', { messageId: 101, supersededEventId: null });
    await waitFor(() => expect(svc.message.getThreadMessagesAfter).toHaveBeenCalled());
  });

  it('the "Send failed" bar hides once the failed reply shows as delivered after all', async () => {
    renderDetail();
    await ready();
    // The async failure names reply 942 …
    await socketEvent('send-failed', { messageId: 101, channel: 'email', outgoingMessageId: 942 });
    await screen.findByText('Send failed');
    // … and a later read shows it delivered (the backend cleared its marks on a late answer).
    withThread(event({ id: 900 }), failed({ isSystemReply: true }));
    await socketEvent('message:replied', { messageId: 101, late: true });
    await screen.findByText('✓ Sent');
    await waitFor(() => expect(screen.queryByText('Send failed')).toBeNull());
  });

  it('an uncertain failure is worded as the bubble words it, never "not sent"', async () => {
    withThread(event({ id: 900 }), failed({ delivered: false, sendUncertain: true }));
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await socketEvent('send-failed', {
      messageId: 101,
      channel: 'email',
      outgoingMessageId: 942,
      uncertain: true,
    });
    await screen.findByText(/We could not confirm that the reply reached the customer via email/);
    expect(screen.queryByText(/saved but not sent/)).toBeNull();
    await screen.findByText('May not have been delivered');
  });

  it('CONTROL: while the reply is still undelivered the bar stays', async () => {
    renderDetail();
    await ready();
    await socketEvent('send-failed', { messageId: 101, channel: 'email', outgoingMessageId: 942 });
    await screen.findByText('Send failed');
    await waitFor(() => expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(1));
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.getByText('Not delivered')).toBeTruthy();
  });
});

describe('review of #999', () => {
  it('H1: an HTML reply goes back into the composer as HTML, never escaped', async () => {
    const html =
      '<p>Hello <strong>Ann</strong>, see <a href="https://shop.example/t?a=1&amp;b=2">tracking</a>:</p><ul><li><p>one</p></li></ul>';
    withThread(
      event({ id: 900 }),
      event({ id: 942, type: 'agent_reply', content: html, metadata: { delivered: false } })
    );
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await waitFor(() => expect(editor()).toHaveValue(html));
  });

  it('M1: "Send anyway" after a collision is still the resend, with the same key', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(refused(409, 'REPLY_NEWER_EXISTS', 'The bot replied — send anyway?'))
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    pressSend();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send anyway' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(optionsOf(second)).toEqual({
      seenLastEventId: 942,
      confirmOverride: true,
      resendOfEventId: 942,
    });
    expect(keyOf(second)).toBe(keyOf(first));
  });

  it('M2: a resend that failed in the transport stays a resend — of the NEW undelivered reply', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 502 }))
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    // The backend stored the attempt as a new undelivered reply that replaced 942.
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({
      data: [
        event({ id: 900 }),
        event({
          id: 950,
          type: 'agent_reply',
          content: 'Your parcel ships today.',
          metadata: { delivered: false, resendOf: 942 },
        }),
      ],
    });
    pressSend();
    await screen.findByText('Send failed');
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    expect(screen.getByText(/Resending a reply/)).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(optionsOf(second)).toMatchObject({ resendOfEventId: 950 });
    expect(keyOf(second)).not.toBe(keyOf(first));
  });

  it("M3/M4: the sender's own uncertain failure is worded as uncertain, and Retry asks first", async () => {
    svc.message.reply = vi.fn().mockImplementationOnce(async () => {
      // The backend announces the failure before it answers the request.
      await socketEvent('send-failed', {
        messageId: 101,
        channel: 'email',
        outgoingMessageId: 950,
        uncertain: true,
      });
      svc.message.getThreadMessages = vi.fn().mockResolvedValue({
        data: [
          event({ id: 900 }),
          event({
            id: 950,
            type: 'agent_reply',
            content: 'Hi',
            // The signed-in agent's own reply: only then is "send it again?" asked.
            authorId: 7,
            metadata: { delivered: false, sendUncertain: true },
          }),
        ],
      });
      throw Object.assign(new Error('Failed to send. Please try again.'), { status: 502 });
    });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hi</p>' } });
    pressSend();
    await screen.findByText(/We could not confirm that the reply reached the customer/);
    expect(screen.queryByText('Failed to send. Please try again.')).toBeNull();
    // Retry asks first, as Resend does: the customer may get it twice.
    svc.message.reply.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const dialog = await screen.findByRole('dialog');
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
  });

  it("M4: a late delivery hides the bar the sender's own failure left", async () => {
    svc.message.reply = vi.fn().mockImplementationOnce(async () => {
      await socketEvent('send-failed', {
        messageId: 101,
        channel: 'email',
        outgoingMessageId: 950,
      });
      svc.message.getThreadMessages = vi.fn().mockResolvedValue({
        data: [
          event({ id: 900 }),
          event({
            id: 950,
            type: 'agent_reply',
            content: 'Hi',
            authorId: 7,
            metadata: { delivered: false },
          }),
        ],
      });
      throw Object.assign(new Error('boom'), { status: 502 });
    });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hi</p>' } });
    pressSend();
    await screen.findByText('Send failed');
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({
      data: [
        event({ id: 900 }),
        event({ id: 950, type: 'agent_reply', content: 'Hi', authorId: 7, metadata: {} }),
      ],
    });
    await socketEvent('message:replied', { messageId: 101, late: true });
    await waitFor(() => expect(screen.queryByText('Send failed')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('LOW: a send-failed with no channel never says "via null"', async () => {
    renderDetail();
    await ready();
    await socketEvent('send-failed', { messageId: 101, channel: null, outgoingMessageId: 942 });
    await screen.findByText(/^Reply could not be delivered\. The message was saved/);
    expect(screen.queryByText(/via null/)).toBeNull();
  });

  it('LOW: no Resend on a bot reply or any non-agent event, even undelivered', async () => {
    withThread(
      event({ id: 900 }),
      event({ id: 942, type: 'bot_reply', content: 'Auto answer', metadata: { delivered: false } })
    );
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await screen.findByText('Not delivered');
    expect(screen.queryByRole('button', { name: /^Resend the reply/ })).toBeNull();
  });

  it('LOW: a thread switch drops the resend target (even without a remount)', async () => {
    const tree = (id: number) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <MessageDetail
            message={{ ...baseMessage, id, publicId: `SUP-${id}` } as Message}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(tree(101));
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    view.rerender(tree(202));
    await waitFor(() => expect(screen.queryByText(/Resending a reply/)).toBeNull());
  });
});
