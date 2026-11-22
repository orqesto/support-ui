/**
 * One send at a time, exactly as pressed (release audit, round 2):
 *  - the composer is read-only from the press of Send until the send settles — sent: cleared;
 *    failed: the text is kept and editable again. Nothing an agent types is lost;
 *  - while a send waits for its thread or is out, the button, Send ▾, the shortcut and the bar do
 *    nothing — and what happens after the reply is out (resolve…) is what was pressed;
 *  - "This reply is still being sent." is a notice, not a failure, and goes when that is over;
 *  - the reply's answer may say what did not finish after it was out (`kbCapture`, `warnings`);
 *  - a `send-failed` event that names its author is that author's bar, at once.
 * Through MessageDetail, as the app calls the services. Invented data.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { subscribeToEvent } from '@/lib/socketManager';
import { toast } from '@/lib/toast';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const STILL = 'This reply is still being sent.';
const editor = () => screen.getByTestId<HTMLTextAreaElement>('rich-text-editor');
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const sendButton = () =>
  screen.getByRole('button', { name: /^(SEND|SENDING…|SEND & RESOLVE|SEND & RESOLVE \+ KB)$/ });
const pressSend = () => fireEvent.click(sendButton());
const shortcut = () => fireEvent.click(screen.getByTestId('rte-submit'));
const posts = () => svc.message.reply.mock.calls as unknown[][];
const settle = (ms = 60) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const pick = async (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Choose what happens after sending' }));
  fireEvent.click(await screen.findByText(label));
};
const emit = (name: string, data: Record<string, unknown>) => {
  const handlers = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([subscribed]) => subscribed === name)
    .map(([, handler]) => handler as (data: unknown) => void);
  act(() => handlers.at(-1)?.({ messageId: baseMessage.id, channel: 'email', ...data }));
};
const ownReply = (id: number, metadata: Record<string, unknown>, authorId = 7) =>
  event({ id, type: 'agent_reply', content: 'On its way.', authorId, metadata });

/** A thread whose read the test lands by hand. */
const heldThread = () => {
  let land: (value: unknown) => void = () => undefined;
  svc.message.getThreadMessages = vi
    .fn()
    .mockImplementation(() => new Promise((resolve) => (land = resolve)));
  return () => act(() => Promise.resolve(land({ data: [event({ id: 900 })] })));
};
/** A POST the test answers by hand. */
const heldPost = () => {
  const out: { resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = [];
  svc.message.reply = vi
    .fn()
    .mockImplementation(() => new Promise((resolve, reject) => void out.push({ resolve, reject })));
  return {
    succeed: (body: unknown = { success: true }) =>
      act(() => Promise.resolve(out.at(-1)?.resolve(body))),
    fail: (error: unknown) => act(() => Promise.resolve(out.at(-1)?.reject(error))),
  };
};
const open = async (...events: ReturnType<typeof event>[]) => {
  svc.message.getThreadMessages = vi
    .fn()
    .mockResolvedValue({ data: [event({ id: 900 }), ...events] });
  const view = renderDetail();
  await screen.findAllByText('Hi there');
  await settle();
  return view;
};

beforeEach(() => {
  window.localStorage.clear();
  svc.message.reply = vi.fn().mockResolvedValue({ success: true });
  svc.message.close = vi.fn().mockResolvedValue({ success: true });
});

describe('the composer is read-only from the press until the send settles', () => {
  it('while the reply waits for its thread: editor, files and the shortcut are locked; sent → cleared', async () => {
    const land = heldThread();
    renderDetail();
    type('<p>First.</p>');
    expect(editor().dataset.locked).toBeUndefined();
    pressSend();
    expect(editor().dataset.locked).toBe('true');
    expect(screen.getByTestId('composer-attach').querySelector('input')).toBeInactive();
    // Typing reaches nothing.
    type('<p>First.</p><p>A second thought</p>');
    expect(editor()).toHaveValue('<p>First.</p>');
    await land();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][1]).toBe('<p>First.</p>');
    await waitFor(() => expect(editor()).toHaveValue(''));
    expect(editor().dataset.locked).toBeUndefined();
  });

  it('while the POST is out: locked; it fails → the text is kept and editable again', async () => {
    await open();
    const post = heldPost();
    type('<p>First.</p>');
    pressSend();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(editor().dataset.locked).toBe('true');
    type('<p>First.</p><p>More</p>');
    expect(editor()).toHaveValue('<p>First.</p>');
    await post.fail(Object.assign(new Error('Network Error'), {}));
    await screen.findByText('Send failed');
    expect(editor()).toHaveValue('<p>First.</p>');
    expect(editor().dataset.locked).toBeUndefined();
    type('<p>First, corrected.</p>');
    expect(editor()).toHaveValue('<p>First, corrected.</p>');
  });

  it('words that reach the composer another way while the POST is out are not wiped by the clear', async () => {
    await open();
    const post = heldPost();
    type('<p>First.</p>');
    pressSend();
    await waitFor(() => expect(posts()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('rte-command'));
    await post.succeed();
    await settle();
    expect(posts()[0][1]).toBe('<p>First.</p>');
    expect(editor()).toHaveValue('<p>First.</p><p>Put in by a command</p>');
  });
});

describe('one guard for every way of sending', () => {
  it('the shortcut three times while one POST is out: one POST', async () => {
    await open();
    const post = heldPost();
    type('<p>First.</p>');
    shortcut();
    await waitFor(() => expect(posts()).toHaveLength(1));
    shortcut();
    shortcut();
    pressSend();
    await settle();
    expect(posts()).toHaveLength(1);
    await post.succeed();
    await waitFor(() => expect(editor()).toHaveValue(''));
    expect(posts()).toHaveLength(1);
  });

  it('Send ▾ left open, the shortcut, then a menu item while that POST is out: one POST, a plain send', async () => {
    await open();
    const post = heldPost();
    type('<p>First.</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Choose what happens after sending' }));
    const item = await screen.findByText('Send and resolve');
    shortcut();
    await waitFor(() => expect(posts()).toHaveLength(1));
    fireEvent.click(item);
    await settle();
    expect(posts()).toHaveLength(1);
    await post.succeed();
    await waitFor(() => expect(editor()).toHaveValue(''));
    await settle();
    expect(posts()).toHaveLength(1);
    expect(svc.message.close).not.toHaveBeenCalled();
  });

  it('CONTROL: once it has settled, the shortcut sends the next reply', async () => {
    await open();
    type('<p>First.</p>');
    shortcut();
    await waitFor(() => expect(editor()).toHaveValue(''));
    type('<p>Second.</p>');
    shortcut();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][5]).not.toBe(posts()[0][5]);
  });

  it('"Send and resolve" pressed while the thread loads, then the shortcut during the wait: one reply, resolved', async () => {
    const land = heldThread();
    renderDetail();
    type('<p>Done.</p>');
    await pick('Send and resolve');
    expect(posts()).toHaveLength(0);
    shortcut();
    shortcut();
    await land();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(svc.message.close).toHaveBeenCalledTimes(1));
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it('a plain Send waiting for the thread, then a Send ▾ item left open: the held reply does what was pressed', async () => {
    const land = heldThread();
    renderDetail();
    type('<p>Done.</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Choose what happens after sending' }));
    const item = await screen.findByText('Send, resolve & save to KB');
    shortcut();
    fireEvent.click(item);
    await land();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await settle();
    expect(posts()).toHaveLength(1);
    // Not "resolve & save to KB", which rides on the reply itself (its 3rd and last arguments).
    expect(posts()[0][2]).toBe(false);
    expect(posts()[0].at(-1)).toBe(false);
    expect(svc.message.close).not.toHaveBeenCalled();
  });

  it('CONTROL: a plain Send that waited resolves nothing', async () => {
    const land = heldThread();
    renderDetail();
    type('<p>Done.</p>');
    pressSend();
    await land();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await settle();
    expect(svc.message.close).not.toHaveBeenCalled();
  });
});

describe('"This reply is still being sent." is a notice, not a failure', () => {
  it('the thread shows the same reply as Sending…: a notice, nothing sent; it goes once the reply is sent', async () => {
    await open(ownReply(950, { sendState: 'sending' }));
    type('<p>On its way.</p>');
    pressSend();
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(STILL);
    expect(screen.queryByText('Send failed')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posts()).toHaveLength(0);
    // The reply went out: the thread, read again, shows it as sent.
    svc.message.getThreadMessages = vi
      .fn()
      .mockResolvedValue({ data: [event({ id: 900 }), ownReply(950, {})] });
    emit('message:replied', { late: true });
    await waitFor(() => expect(screen.queryByText(STILL)).toBeNull());
    expect(editor()).toHaveValue('<p>On its way.</p>');
  });

  it('…and once it turns out not delivered', async () => {
    await open(ownReply(950, { sendState: 'sending' }));
    type('<p>On its way.</p>');
    pressSend();
    await screen.findByText(STILL);
    svc.message.getThreadMessages = vi
      .fn()
      .mockResolvedValue({ data: [event({ id: 900 }), ownReply(950, { delivered: false })] });
    emit('message:replied', { late: true });
    await waitFor(() => expect(screen.queryByText(STILL)).toBeNull());
  });

  it('…and when the composer text changes; typed back, it does not return', async () => {
    await open(ownReply(950, { sendState: 'sending' }));
    type('<p>On its way.</p>');
    pressSend();
    await screen.findByText(STILL);
    type('<p>On its way. Also:</p>');
    await waitFor(() => expect(screen.queryByText(STILL)).toBeNull());
    type('<p>On its way.</p>');
    await settle();
    expect(screen.queryByText(STILL)).toBeNull();
  });

  it('the server says so (409 REPLY_SEND_IN_FLIGHT): the same notice, no "Send failed", the text kept', async () => {
    await open();
    svc.message.reply = vi.fn().mockRejectedValue(
      Object.assign(new Error('This reply is still being sent'), {
        status: 409,
        data: { success: false, error: 'Still being sent', code: 'REPLY_SEND_IN_FLIGHT' },
      })
    );
    type('<p>On its way.</p>');
    pressSend();
    expect((await screen.findByRole('status')).textContent).toContain(STILL);
    expect(screen.queryByText('Send failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
    expect(editor()).toHaveValue('<p>On its way.</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(STILL)).toBeNull();
  });
});

describe('what the reply’s answer says did not finish', () => {
  const SAVING = 'Sent and resolved. Saving this thread to the knowledge base for review.';
  const KB_FAILED =
    'Reply sent and resolved, but the knowledge-base save did not start. Use Promote to KB on the thread to save it.';
  const sendWithKb = async (body: unknown) => {
    const onResolve = vi.fn();
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event({ id: 900 })] });
    svc.message.reply = vi.fn().mockResolvedValue(body);
    renderDetail({}, { onResolve });
    await screen.findAllByText('Hi there');
    await settle();
    type('<p>Done.</p>');
    await pick('Send, resolve & save to KB');
    await waitFor(() => expect(posts()).toHaveLength(1));
    await settle();
    return onResolve;
  };

  it('kbCapture "failed": sent and resolved, the save did not start — and how to save it', async () => {
    const onResolve = await sendWithKb({ success: true, data: { kbCapture: 'failed' } });
    expect(toast.warning).toHaveBeenCalledWith(KB_FAILED);
    expect(toast.success).not.toHaveBeenCalledWith(SAVING);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it.each(['queued', 'background'])(
    'CONTROL — kbCapture "%s": the save is under way',
    async (how) => {
      await sendWithKb({ success: true, data: { kbCapture: how } });
      expect(toast.success).toHaveBeenCalledWith(SAVING);
      expect(toast.warning).not.toHaveBeenCalled();
    }
  );

  it('CONTROL — an older backend names nothing: as before', async () => {
    await sendWithKb({ success: true });
    expect(toast.success).toHaveBeenCalledWith(SAVING);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('warnings on a plain send: one sentence per code, a generic one for codes this app does not know', async () => {
    await open();
    svc.message.reply = vi.fn().mockResolvedValue({
      success: true,
      data: {
        outgoingMessageId: 951,
        warnings: [
          'files_not_stored',
          'delivery_not_recorded',
          'resolve_not_applied',
          'something_new',
          'something_else_new',
        ],
      },
    });
    type('<p>Done.</p>');
    pressSend();
    await waitFor(() => expect(editor()).toHaveValue(''));
    expect(vi.mocked(toast.warning).mock.calls.map(([sentence]) => sentence)).toEqual([
      'Reply sent, but the thread could not be resolved. Resolve it again.',
      'Reply sent, but its attachments could not be saved to the thread.',
      'Reply sent. The thread may show it as still sending for a moment.',
      'Reply sent, but a later step did not finish. Check the thread.',
    ]);
  });

  it('resolve_not_applied on "Send, resolve & save to KB": no success toast, the thread is not taken as resolved', async () => {
    const onResolve = await sendWithKb({
      success: true,
      data: { outgoingMessageId: 951, kbCapture: 'failed', warnings: ['resolve_not_applied'] },
    });
    expect(vi.mocked(toast.warning).mock.calls.map(([sentence]) => sentence)).toEqual([
      'Reply sent, but the thread could not be resolved. Resolve it again.',
    ]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
  });
});

describe('a send-failed event that names its author', () => {
  const NOT_DELIVERED = 'Reply could not be delivered via email. It was saved but not sent.';

  it.each(['authorId', 'authorUserId'])(
    '%s = this agent: the bar is theirs at once, before the thread shows the reply',
    async (field) => {
      await open();
      // The read the event asks for never lands: nothing in the thread says whose reply it is.
      svc.message.getThreadMessagesAfter = vi.fn().mockImplementation(() => new Promise(() => {}));
      emit('send-failed', { outgoingMessageId: 950, [field]: 7 });
      expect(await screen.findByText(NOT_DELIVERED)).toBeTruthy();
    }
  );

  it('the author is a colleague: no bar here, the thread is read for the bubble', async () => {
    await open();
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue({
      data: [ownReply(950, { delivered: false }, 8)],
      page: { total: 1, hasEarlier: false },
      newEvents: { incremental: true, hasMore: false },
    });
    emit('send-failed', { outgoingMessageId: 950, authorId: 8 });
    expect(await screen.findByText('Not delivered')).toBeTruthy();
    expect(screen.queryByText('Send failed')).toBeNull();
  });

  it('CONTROL — the old payload (no author): no bar until the thread shows the reply is this agent’s', async () => {
    await open();
    svc.message.getThreadMessagesAfter = vi.fn().mockImplementation(() => new Promise(() => {}));
    // An older backend's payload: no author, but `uncertain` and `revertedStatus` always.
    emit('send-failed', { outgoingMessageId: 950, uncertain: false, revertedStatus: null });
    await settle();
    expect(screen.queryByText('Send failed')).toBeNull();
  });
});
