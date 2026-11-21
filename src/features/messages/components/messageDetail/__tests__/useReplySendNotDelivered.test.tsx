/**
 * A reply that was saved and NOT delivered answers 502 with the saved reply's event and whether it
 * may have gone out (`{ success: false, error, eventId, uncertain }`). The bar and its Retry act
 * on that answer exactly as on the `send-failed` socket event — which never arrives here (the
 * socket is down): uncertain → the "may get it twice" wording and a confirm before Retry; either
 * way Retry replaces the saved reply (`resendOfEventId`). The server's sentence is never shown.
 * Through MessageDetail, as the app calls the services. Invented data.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { subscribeToEvent } from '@/lib/socketManager';

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
  'We could not confirm that the reply reached the customer via email. Check before you resend it — they may get it twice.';
const NOT_DELIVERED =
  'Reply could not be delivered via email. The message was saved but not sent — please try again.';

type Call = unknown[];
const keyOf = (call: Call | undefined) => call?.[5];
const guardOf = (call: Call | undefined) => call?.[10];

beforeEach(() => {
  window.localStorage.clear();
  // The thread as read BEFORE and after the failure: the saved reply is not in it yet (the
  // re-read has not landed), so only the 502 answer can say what happened.
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event({ id: 900 })] });
});

/** `later`: what the sends after the first answer with, in turn (an Error = that send fails). */
const sendAndFail = async (data: Record<string, unknown>, later: unknown[] = []) => {
  svc.message.reply = vi.fn().mockRejectedValueOnce(failed(data));
  for (const answer of later) {
    if (answer instanceof Error) svc.message.reply.mockRejectedValueOnce(answer);
    else svc.message.reply.mockResolvedValueOnce(answer);
  }
  svc.message.reply.mockResolvedValue({ success: true });
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

describe('Send pressed again (not Retry) after a send that may have reached the customer', () => {
  it('the same text: the same confirm first, then it goes as a resend of that reply', async () => {
    await sendAndFail({ eventId: 955, uncertain: true });
    pressSend();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Send this reply again?')).toBeTruthy();
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(guardOf((svc.message.reply.mock.calls as Call[])[1])).toEqual({
      seenLastEventId: 900,
      resendOfEventId: 955,
    });
  });

  it('the same text, Cancel: nothing is sent and the draft stays', async () => {
    await sendAndFail({ eventId: 955, uncertain: true });
    pressSend();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('<p>On its way.</p>');
  });

  it('CONTROL — a different text is a new reply: sent unasked, not as a resend', async () => {
    await sendAndFail({ eventId: 955, uncertain: true });
    type('<p>One more thing: the invoice is attached.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[1])).toEqual({ seenLastEventId: 900 });
  });

  it('CONTROL — a reply that certainly did not go out: Send again asks nothing', async () => {
    await sendAndFail({ eventId: 955, uncertain: false });
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Retry never replaces a reply the customer may have with a DIFFERENT one', () => {
  it('reply A may have gone out; reply B fails on the network; Retry sends B as its own reply', async () => {
    await sendAndFail({ eventId: 955, uncertain: true }, [new Error('Network Error')]);
    type('<p>One more thing: the invoice is attached.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const bar = within(await screen.findByRole('alert'));
    expect(await bar.findByText('Failed to send. Please try again.')).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('dialog')).toBeNull();
    const [, second, third] = svc.message.reply.mock.calls as Call[];
    expect(guardOf(third)).toEqual({ seenLastEventId: 900 });
    expect(keyOf(third)).toBe(keyOf(second));
  });

  it('a resend the server refuses (the reply is gone) ends the target: the same text is then a plain send', async () => {
    const gone = Object.assign(new Error('That reply was already resent.'), {
      status: 404,
      data: { error: 'That reply was already resent.', code: 'REPLY_RESEND_NOT_FOUND' },
    });
    await sendAndFail({ eventId: 955, uncertain: true }, [gone]);
    pressSend();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send again' })
    );
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    await screen.findByText('That reply was already resent.');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[2])).toEqual({ seenLastEventId: 900 });
  });
});

describe('the rule is read from the THREAD (after leaving and returning, or on a backend that names no reply)', () => {
  /** `authorId` 7 is the signed-in agent; 8 a colleague. */
  const open = async (content: string, metadata: Record<string, unknown>, authorId = 7) => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({
      data: [
        event({ id: 900 }),
        event({ id: 955, type: 'agent_reply', content, metadata, authorId }),
      ],
    });
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await screen.findAllByText('Hi there');
    await waitFor(() => expect(screen.getAllByText(/On its way\./).length).toBeGreaterThan(0));
  };
  const UNCERTAIN_MARK = { delivered: false, sendUncertain: true };

  it('the kept draft is the uncertain reply: Send asks first, then resends that reply', async () => {
    await open('<p>On its way.</p>', UNCERTAIN_MARK);
    type('<p>On its way.</p>');
    pressSend();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Send this reply again?')).toBeTruthy();
    expect(svc.message.reply).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(guardOf((svc.message.reply.mock.calls as Call[])[0])).toEqual({
      seenLastEventId: 955,
      resendOfEventId: 955,
    });
  });

  it('the same words in another markup (a reply stored as plain text) are the same reply', async () => {
    await open('On its  way.', UNCERTAIN_MARK);
    type('<p>On its way.</p>');
    pressSend();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(svc.message.reply).not.toHaveBeenCalled();
  });

  it('CONTROL — another text is a new reply: sent unasked, not as a resend', async () => {
    await open('<p>On its way.</p>', UNCERTAIN_MARK);
    type('<p>On its way. Tracking number to follow.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[0])).toEqual({ seenLastEventId: 955 });
  });

  it("CONTROL — a COLLEAGUE's uncertain reply with the same text: this agent's send is its own reply, unasked", async () => {
    await open('<p>On its way.</p>', UNCERTAIN_MARK, 8);
    type('<p>On its way.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[0])).toEqual({ seenLastEventId: 955 });
  });

  it('CONTROL — the reply certainly did not go out (not uncertain): the same text is sent unasked', async () => {
    await open('<p>On its way.</p>', { delivered: false });
    type('<p>On its way.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the `send-failed` socket event arrives AFTER the 502 answer was handled', () => {
  const sendFailed = (data: Record<string, unknown>) => {
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'send-failed')
      .map(([, handler]) => handler as (data: unknown) => void);
    act(() => handlers.at(-1)?.({ messageId: baseMessage.id, channel: 'email', ...data }));
  };

  it('the same reply: Retry stays, and "may have reached the customer" is not taken back', async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: true });
    sendFailed({ outgoingMessageId: 955, uncertain: false });
    expect(bar.getByText(UNCERTAIN)).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(guardOf((svc.message.reply.mock.calls as Call[])[1])).toMatchObject({
      resendOfEventId: 955,
    });
  });

  it('the same reply, and the event knows more (uncertain): the bar and Retry say so', async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: false });
    sendFailed({ outgoingMessageId: 955, uncertain: true });
    expect(bar.getByText(UNCERTAIN)).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
  });

  it("an event about ANOTHER reply (it may be a colleague's) leaves this tab's own bar and Retry as they are", async () => {
    const bar = await sendAndFail({ eventId: 955, uncertain: false });
    sendFailed({ outgoingMessageId: 956, uncertain: true });
    expect(bar.getByText(NOT_DELIVERED)).toBeTruthy();
    expect(screen.queryByText(/^We could not confirm/)).toBeNull();
    fireEvent.click(bar.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(guardOf((svc.message.reply.mock.calls as Call[])[1])).toMatchObject({
      resendOfEventId: 955,
    });
  });
});
