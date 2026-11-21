/**
 * A reply that was saved and NOT delivered answers 502 with the saved reply's event and whether it
 * may have gone out (`{ success: false, error, eventId, uncertain }`). The bar and its Retry act
 * on that answer exactly as on the `send-failed` socket event — which never arrives here (the
 * socket is down): uncertain → the "may get it twice" wording and a confirm before Retry; either
 * way Retry replaces the saved reply (`resendOfEventId`). The server's sentence is never shown.
 * Through MessageDetail, as the app calls the services. Invented data.
 */
import { renderDetail, svc, event } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('rich-text-editor'), { target: { value: text } });
const pressSend = () => fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));

const SERVER_SENTENCE = 'SMTP connection to mail.example.com timed out';
/** What the api-client interceptor throws for a 5xx: the masked message, status and the body. */
const failed = (data: Record<string, unknown>) =>
  Object.assign(new Error('A server error occurred. Please try again later.'), {
    status: 502,
    data: { success: false, error: SERVER_SENTENCE, ...data },
  });

const UNCERTAIN =
  'We could not confirm that the reply reached the customer. Check before you resend it — they may get it twice.';
const NOT_DELIVERED =
  'Reply could not be delivered. The message was saved but not sent — please try again.';

type Call = unknown[];
const keyOf = (call: Call | undefined) => call?.[5];
const guardOf = (call: Call | undefined) => call?.[10];

beforeEach(() => {
  window.localStorage.clear();
  // The thread as read BEFORE and after the failure: the saved reply is not in it yet (the
  // re-read has not landed), so only the 502 answer can say what happened.
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event({ id: 900 })] });
});

const sendAndFail = async (data: Record<string, unknown>) => {
  svc.message.reply = vi
    .fn()
    .mockRejectedValueOnce(failed(data))
    .mockResolvedValueOnce({ success: true });
  renderDetail();
  await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
  await screen.findAllByText('Hi there');
  type('<p>On its way.</p>');
  pressSend();
  return within(await screen.findByRole('alert'));
};

describe('502 "saved, not delivered" without the socket event', () => {
  it('uncertain: the "may get it twice" wording, a confirm before Retry, and Retry replaces the saved reply', async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: true });
    expect(bar.getByText(UNCERTAIN)).toBeTruthy();
    expect(screen.queryByText(SERVER_SENTENCE)).toBeNull();

    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    // Nothing is sent before the agent confirms.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Send this reply again?')).toBeTruthy();
    expect(svc.message.reply).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(guardOf(first)).toEqual({ seenLastEventId: 900 });
    expect(guardOf(second)).toEqual({ seenLastEventId: 900, resendOfEventId: 955 });
    // Its own key per resend (the contract).
    expect(keyOf(second)).not.toBe(keyOf(first));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('uncertain, Cancel in the confirm: nothing is sent again', async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: true });
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
  });

  it('not uncertain: the plain "not delivered" wording, Retry without a confirm, same resend target', async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: false });
    expect(bar.getByText(NOT_DELIVERED)).toBeTruthy();
    expect(screen.queryByText(SERVER_SENTENCE)).toBeNull();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[1])).toEqual({
      seenLastEventId: 900,
      resendOfEventId: 955,
    });
  });

  it('CONTROL — a 502 that names no reply (a proxy): the generic sentence, a plain Retry with the same key', async () => {
    const bar = await sendAndFail({});
    expect(bar.getByText('Failed to send. Please try again.')).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(guardOf(second)).toEqual({ seenLastEventId: 900 });
    expect(keyOf(second)).toBe(keyOf(first));
  });
});
