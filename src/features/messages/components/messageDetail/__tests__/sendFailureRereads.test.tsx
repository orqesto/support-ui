/**
 * One failed send = one re-read. The backend emits `send-failed` BEFORE it answers the request,
 * and both the event and the request's own failure used to re-read the thread, every side panel
 * and the page — twice over. Counted here, through MessageDetail as the app calls the services:
 * `full` = whole-thread reads, `newest` = incremental reads, `page` = the page's own re-read.
 * A tab that only hears the event (a colleague's, or its own async failure) reads the newest
 * events alone. Invented data.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { subscribeToEvent } from '@/lib/socketManager';

const sendFailed = (data: Record<string, unknown>) => {
  const handlers = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([name]) => name === 'send-failed')
    .map(([, handler]) => handler as (data: unknown) => void);
  act(() => handlers.at(-1)?.({ messageId: baseMessage.id, channel: 'email', ...data }));
};
const notDelivered = () =>
  Object.assign(new Error('A server error occurred. Please try again later.'), {
    status: 502,
    data: { success: false, error: '', eventId: 955, uncertain: false },
  });
const reply = (id: number, authorId: number, metadata: Record<string, unknown>) =>
  event({ id, type: 'agent_reply', content: 'On its way.', authorId, metadata });
const incremental = (...events: ReturnType<typeof event>[]) => ({
  data: events,
  page: { total: events.length, hasEarlier: false },
  newEvents: { incremental: true, hasMore: false },
});

const onRefresh = vi.fn();
let loads = 0;
const counts = () => ({
  full: svc.message.getThreadMessages.mock.calls.length - loads,
  newest: svc.message.getThreadMessagesAfter.mock.calls.length,
  page: onRefresh.mock.calls.length,
});
const open = async (...events: ReturnType<typeof event>[]) => {
  svc.message.getThreadMessages = vi
    .fn()
    .mockResolvedValue({ data: [event({ id: 900 }), ...events] });
  svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
  renderDetail({}, { onRefresh });
  await screen.findAllByText('Hi there');
  loads = svc.message.getThreadMessages.mock.calls.length;
};
const send = () => {
  fireEvent.change(screen.getByTestId('rich-text-editor'), {
    target: { value: '<p>On its way.</p>' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^SEND$/ }));
};

beforeEach(() => {
  window.localStorage.clear();
  onRefresh.mockClear();
});

describe('a failed send re-reads once', () => {
  it('the 502 answer, then the event for the same reply: {full 1, newest 0, page 1}', async () => {
    await open();
    svc.message.reply = vi.fn().mockRejectedValueOnce(notDelivered());
    send();
    await screen.findByText('Send failed');
    sendFailed({ outgoingMessageId: 955, uncertain: false, revertedStatus: 'open' });
    await waitFor(() => expect(counts().full).toBe(1));
    expect(counts()).toEqual({ full: 1, newest: 0, page: 1 });
  });

  it('the event first (the backend emits it before it answers), then the 502: {full 1, newest 0, page 1}', async () => {
    await open();
    svc.message.reply = vi.fn().mockImplementationOnce(() => {
      sendFailed({ outgoingMessageId: 955, uncertain: false, revertedStatus: 'open' });
      return Promise.reject(notDelivered());
    });
    send();
    await screen.findByText('Send failed');
    await waitFor(() => expect(counts().full).toBe(1));
    expect(counts()).toEqual({ full: 1, newest: 0, page: 1 });
  });
});

describe('a tab that only hears the event reads the newest events, nothing else', () => {
  it("its own reply (an async failure): {full 0, newest 1, page 0}, and the bar shows once it is read as the agent's", async () => {
    await open(reply(950, 7, {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(reply(950, 7, { delivered: false })));
    sendFailed({ outgoingMessageId: 950, uncertain: false });
    await screen.findByText('Send failed');
    expect(counts()).toEqual({ full: 0, newest: 1, page: 0 });
  });

  it("a colleague's reply: {full 0, newest 1, page 0}, the bubble says it, and no bar", async () => {
    await open(reply(950, 8, {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(reply(950, 8, { delivered: false })));
    sendFailed({ outgoingMessageId: 950, uncertain: false });
    await screen.findByText('Not delivered');
    expect(screen.queryByText('Send failed')).toBeNull();
    expect(counts()).toEqual({ full: 0, newest: 1, page: 0 });
  });
});
