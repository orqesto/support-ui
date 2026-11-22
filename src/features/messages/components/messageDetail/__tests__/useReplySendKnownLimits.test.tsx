/**
 * The limits #999 listed as known, closed (follow-up of #999), through MessageDetail as the app
 * calls the services:
 * - a send key the server says belongs to another thread is dropped, so sending again goes out;
 * - a transport failure no `send-failed` event named (socket down, a proxy's 502) is worded from
 *   the reply it left, as the bubble words it, and its Retry asks first when that reply is uncertain.
 */
import { renderDetail, svc, event } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const pressSend = () => fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));
const editor = () => screen.getByTestId('rich-text-editor');
const refused = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, data: { error: message, code } });
const REUSED = 'This send key was already used on another thread — send the reply again';

type Call = unknown[];
const keyOf = (call: Call | undefined) => call?.[5];
const optionsOf = (call: Call | undefined) => call?.[10];

const failed = (metadata: Record<string, unknown>) =>
  event({ id: 942, type: 'agent_reply', content: 'Your parcel ships today.', metadata });

const withThread = (...events: ReturnType<typeof event>[]) => {
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: events });
};

beforeEach(() => {
  window.localStorage.clear();
  withThread(event({ id: 900 }));
});

const ready = async () => {
  await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
};

describe('a send key used on another thread', () => {
  it('is dropped: Retry is offered and sends the same reply with a NEW key', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(refused(409, 'REPLY_IDEMPOTENCY_KEY_REUSED', REUSED))
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hello</p>' } });
    pressSend();
    await screen.findByText(REUSED);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(second[1]).toBe('<p>Hello</p>');
    expect(typeof keyOf(second)).toBe('string');
    expect(keyOf(second)).not.toBe(keyOf(first));
  });

  it('CONTROL: another 409 offers no Retry', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(refused(409, 'SOMETHING_ELSE', 'The thread is closed.'));
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hello</p>' } });
    pressSend();
    await screen.findByText('The thread is closed.');
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });

  it('a resend refused for it stays a resend, and the next Send goes out with a new key', async () => {
    withThread(event({ id: 900 }), failed({ delivered: false }));
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(refused(409, 'REPLY_IDEMPOTENCY_KEY_REUSED', REUSED))
      .mockResolvedValueOnce({ success: true });
    renderDetail();
    await screen.findByText('Not delivered');
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    await screen.findByText(/Resending a reply/);
    pressSend();
    await screen.findByText(REUSED);
    expect(screen.getByText(/Resending a reply/)).toBeTruthy();
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(optionsOf(second)).toMatchObject({ resendOfEventId: 942 });
    expect(keyOf(second)).not.toBe(keyOf(first));
  });
});

describe('a transport failure with no send-failed event (socket down)', () => {
  const failWith502LeavingReply = (authorId: number, metadata: Record<string, unknown>) => {
    svc.message.reply = vi.fn().mockImplementationOnce(() => {
      // The re-read after the failure shows the reply the send left.
      withThread(
        event({ id: 900 }),
        event({ id: 950, type: 'agent_reply', content: 'Hi', authorId, metadata })
      );
      return Promise.reject(
        Object.assign(new Error('Failed to send. Please try again.'), { status: 502 })
      );
    });
  };

  it("is worded from the agent's own uncertain reply, and Retry asks first", async () => {
    failWith502LeavingReply(7, { delivered: false, sendUncertain: true });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hi</p>' } });
    pressSend();
    await screen.findByText(/We could not confirm that the reply reached the customer/);
    svc.message.reply.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    const dialog = await screen.findByRole('dialog');
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
  });

  it('hides once that reply shows as delivered', async () => {
    failWith502LeavingReply(7, {});
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hi</p>' } });
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText('Send failed')).toBeNull());
  });

  it("CONTROL: a colleague's uncertain reply does not reword the bar; Retry does not ask", async () => {
    failWith502LeavingReply(8, { delivered: false, sendUncertain: true });
    svc.message.reply.mockResolvedValueOnce({ success: true });
    renderDetail();
    await ready();
    fireEvent.change(editor(), { target: { value: '<p>Hi</p>' } });
    pressSend();
    await screen.findByText('Failed to send. Please try again.');
    expect(screen.queryByText(/We could not confirm/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a failure only the socket announced (the stuck-send repair, a late channel answer)', () => {
  const socketEvent = async (name: string, payload: unknown) => {
    const { subscribeToEvent } = await import('@/lib/socketManager');
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([subscribed]) => subscribed === name)
      .map(([, handler]) => handler);
    for (const handler of handlers) handler(payload);
  };
  const withReplyBy = (authorId: number) =>
    withThread(
      event({ id: 900 }),
      event({
        id: 942,
        type: 'agent_reply',
        content: 'Your parcel ships today.',
        authorId,
        metadata: { delivered: false, sendUncertain: true },
      })
    );

  it('shows no bar to a colleague: the reply is not theirs, the bubble tells them', async () => {
    withReplyBy(8);
    renderDetail();
    await screen.findByText('May not have been delivered');
    await act(() =>
      socketEvent('send-failed', {
        messageId: 101,
        channel: 'email',
        outgoingMessageId: 942,
        uncertain: true,
      })
    );
    await waitFor(() => expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText('Send failed')).toBeNull();
  });

  it('CONTROL: the agent who sent it gets the bar', async () => {
    withReplyBy(7);
    renderDetail();
    await screen.findByText('May not have been delivered');
    await act(() =>
      socketEvent('send-failed', {
        messageId: 101,
        channel: 'email',
        outgoingMessageId: 942,
        uncertain: true,
      })
    );
    await screen.findByText('Send failed');
  });
});
