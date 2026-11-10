/**
 * Thread presence send guard (spec §5.4): the reply says which event the agent had loaded last;
 * the server answers 409 REPLY_NEWER_EXISTS / REPLY_OTHER_WRITING when someone got there first,
 * and the agent decides in a confirm dialog. Through MessageDetail, as the app calls the services.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetail } from '../../MessageDetail';

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('rich-text-editor'), { target: { value: text } });
const pressSend = () => fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));

/** What the api-client interceptor throws for a refused request (status + body on the Error). */
const refused = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { status, data: { error: message, code } });

const NEWER = 'The bot replied 20 s ago — send anyway?';

type Call = unknown[];
const keyOf = (call: Call | undefined) => call?.[5];
const collisionOf = (call: Call | undefined) => call?.[10];

beforeEach(() => {
  window.localStorage.clear();
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({
    data: [event({ id: 900 }), event({ id: 942, type: 'outbound' }), event({ id: 917 })],
  });
});

const ready = async () => {
  await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
  // The thread rows are on screen once the events landed.
  await screen.findAllByText('Hi there');
};

describe('the reply carries the newest event the agent had loaded', () => {
  it('sends seenLastEventId = the max event id of the loaded thread', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await ready();
    type('<p>On its way.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(collisionOf(svc.message.reply.mock.calls[0])).toEqual({ seenLastEventId: 942 });
  });

  it('an empty thread sends no seenLastEventId (the old-client path)', async () => {
    svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [] });
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    type('<p>On its way.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    expect(collisionOf(svc.message.reply.mock.calls[0])).toBeUndefined();
  });

  it('the attachment path carries it too', async () => {
    svc.message.replyWithAttachments = vi.fn().mockResolvedValue({ success: true });
    renderDetail();
    await ready();
    type('<p>See attached.</p>');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'label.pdf', { type: 'application/pdf' })] },
    });
    pressSend();
    await waitFor(() => expect(svc.message.replyWithAttachments).toHaveBeenCalledTimes(1));
    const call = svc.message.replyWithAttachments.mock.calls[0] as Call;
    expect(call[10]).toEqual({ seenLastEventId: 942 });
  });
});

describe('409 someone got there first', () => {
  it('opens the confirm with the server text verbatim, and no Send failed bar', async () => {
    svc.message.reply = vi.fn().mockRejectedValueOnce(refused(409, 'REPLY_NEWER_EXISTS', NEWER));
    renderDetail();
    await ready();
    type('<p>On its way.</p>');
    pressSend();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(NEWER)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Send anyway' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByText('Send failed')).toBeNull();
  });

  it('Send anyway resends with confirmOverride and the SAME idempotency key', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        refused(409, 'REPLY_OTHER_WRITING', 'Anna is writing a reply — send anyway?')
      )
      .mockResolvedValueOnce({ success: true });
    const onRefresh = vi.fn();
    renderDetail({}, { onRefresh });
    await ready();
    type('<p>On its way.</p>');
    pressSend();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send anyway' }));
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(2));
    const [first, second] = svc.message.reply.mock.calls as Call[];
    expect(keyOf(first)).toEqual(expect.any(String));
    expect(keyOf(second)).toBe(keyOf(first));
    expect(collisionOf(second)).toEqual({ seenLastEventId: 942, confirmOverride: true });
    expect(second.slice(0, 10)).toEqual(first.slice(0, 10));
    // Sent: the composer clears as after any reply.
    await waitFor(() => expect(screen.getByTestId('rich-text-editor')).toHaveValue(''));
    expect(screen.queryByText('Send failed')).toBeNull();
  });

  it('Cancel keeps the draft and refreshes so the newer reply shows', async () => {
    svc.message.reply = vi.fn().mockRejectedValueOnce(refused(409, 'REPLY_NEWER_EXISTS', NEWER));
    const onRefresh = vi.fn();
    renderDetail({}, { onRefresh });
    await ready();
    type('<p>On its way.</p>');
    pressSend();
    const dialog = await screen.findByRole('dialog');
    const readsBefore = svc.message.getThreadMessages.mock.calls.length;
    expect(onRefresh).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(svc.message.getThreadMessages.mock.calls.length).toBeGreaterThan(readsBefore)
    );
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('<p>On its way.</p>');
    expect(svc.message.reply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Send failed')).toBeNull();
  });

  it('another 409 (a send still in flight) behaves as before: the Send failed bar, no dialog', async () => {
    svc.message.reply = vi
      .fn()
      .mockRejectedValueOnce(
        refused(409, 'REPLY_IN_FLIGHT', 'This reply is already being sent — wait a moment.')
      );
    renderDetail();
    await ready();
    type('<p>On its way.</p>');
    pressSend();
    await screen.findByText('Send failed');
    expect(screen.getByText('This reply is already being sent — wait a moment.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a switch to another thread without a remount', () => {
  it('sends no seenLastEventId until the new thread’s events have loaded', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (message: Message) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MessageDetail message={message} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(view(baseMessage));
    await ready();
    // The next thread's events never arrive in this test: the old thread's (max 942) are on hand.
    svc.message.getThreadMessages = vi.fn(() => new Promise(() => {}));
    rerender(view({ ...baseMessage, id: 202, publicId: 'SUP-202' } as Message));
    await waitFor(() =>
      expect(svc.message.getThreadMessages).toHaveBeenCalledWith(202, expect.anything())
    );
    type('<p>On its way.</p>');
    pressSend();
    await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
    const call = svc.message.reply.mock.calls[0] as Call;
    expect(call[0]).toBe(202);
    expect(collisionOf(call)).toBeUndefined();
  });
});
