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

/*
  The newer backend (release audit, round 2): the AUTHOR's own room gets the full event with
  `authorId`; everyone else a LIGHT one — `{ messageId, outgoingMessageId }` alone. `header`
  counts the header's own re-reads (onStatusChanged), apart from the page's.
*/
describe('send-failed from a newer backend: who reads what', () => {
  const onStatusChanged = vi.fn();
  const openWithHeader = async (...events: ReturnType<typeof event>[]) => {
    svc.message.getThreadMessages = vi
      .fn()
      .mockResolvedValue({ data: [event({ id: 900 }), ...events] });
    svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue(incremental());
    renderDetail({}, { onRefresh, onStatusChanged });
    await screen.findAllByText('Hi there');
    loads = svc.message.getThreadMessages.mock.calls.length;
    onStatusChanged.mockClear();
  };
  const withHeader = () => ({ ...counts(), header: onStatusChanged.mock.calls.length });
  /** What the author's own room receives. */
  const full = {
    outgoingMessageId: 955,
    authorId: 7,
    publicId: null,
    threadId: null,
    revertedStatus: 'open',
    uncertain: false,
    supersededEventId: null,
  };
  /** What everyone else receives — and nothing more (no channel either). */
  const light = (data: Record<string, unknown>) => {
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'send-failed')
      .map(([, handler]) => handler as (data: unknown) => void);
    act(() => handlers.at(-1)?.({ messageId: baseMessage.id, ...data }));
  };

  it('author tab, the 502 then the full event: {full 1, newest 0, page 1, header 0}', async () => {
    await openWithHeader();
    svc.message.reply = vi.fn().mockRejectedValueOnce(notDelivered());
    send();
    await screen.findByText('Send failed');
    sendFailed(full);
    await waitFor(() => expect(counts().full).toBe(1));
    expect(withHeader()).toEqual({ full: 1, newest: 0, page: 1, header: 0 });
  });

  it('author tab, the full event then the 502: {full 1, newest 0, page 1, header 0}', async () => {
    await openWithHeader();
    svc.message.reply = vi.fn().mockImplementationOnce(() => {
      sendFailed(full);
      return Promise.reject(notDelivered());
    });
    send();
    await screen.findByText('Send failed');
    await waitFor(() => expect(counts().full).toBe(1));
    expect(withHeader()).toEqual({ full: 1, newest: 0, page: 1, header: 0 });
  });

  it("a colleague's tab, the light event: one read of the newest events, one of the header, no bar", async () => {
    await openWithHeader(reply(950, 8, {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(reply(950, 8, { delivered: false })));
    light({ outgoingMessageId: 950 });
    await screen.findByText('Not delivered');
    expect(screen.queryByText('Send failed')).toBeNull();
    expect(withHeader()).toEqual({ full: 0, newest: 1, page: 0, header: 1 });
  });

  it('CONTROL — the light event naming THIS agent’s reply still makes no bar (the author gets the full one)', async () => {
    await openWithHeader(reply(950, 7, {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(reply(950, 7, { delivered: false })));
    light({ outgoingMessageId: 950 });
    await screen.findByText('Not delivered');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText('Send failed')).toBeNull();
    expect(withHeader()).toEqual({ full: 0, newest: 1, page: 0, header: 1 });
  });

  it("an older backend's payload, this agent's reply: {full 0, newest 1, page 0, header 1 (revertedStatus)}, the bar once read", async () => {
    await openWithHeader(reply(950, 7, {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(reply(950, 7, { delivered: false })));
    sendFailed({ outgoingMessageId: 950, uncertain: false, revertedStatus: 'open' });
    await screen.findByText('Send failed');
    expect(withHeader()).toEqual({ full: 0, newest: 1, page: 0, header: 1 });
  });
});

/*
  A RESEND that failed again, heard by a colleague's tab: the backend's light event now carries
  `channel` and — when the failed reply replaced an earlier one — `supersededEventId`. The one
  read of the newest events brings the new reply, which names the one it replaced
  (`metadata.resendOf`): the thread shows one bubble, and offers Resend on the new one only.
*/
describe('a resend that failed again, in a colleague’s tab', () => {
  const said = (id: number, text: string, metadata: Record<string, unknown>) =>
    event({ id, type: 'agent_reply', content: text, authorId: 8, metadata });
  const light = (data: Record<string, unknown>) => {
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'send-failed')
      .map(([, handler]) => handler as (data: unknown) => void);
    // The light shape: no author, no `uncertain`, no `revertedStatus`.
    act(() => handlers.at(-1)?.({ messageId: baseMessage.id, ...data }));
  };
  const resendButtons = () => screen.queryAllByRole('button', { name: /^Resend the reply/ });

  it('supersededEventId: one read of the newest events, and the replaced bubble is gone', async () => {
    await open(said(950, 'First try.', { delivered: false }));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(
        incremental(said(960, 'Second try.', { delivered: false, resendOf: 950 }))
      );
    light({ outgoingMessageId: 960, channel: 'email', supersededEventId: 950 });
    await screen.findByText('Second try.');
    expect(screen.queryByText('First try.')).toBeNull();
    expect(resendButtons()).toHaveLength(1);
    // (`page` here = the header's re-read: this harness has no onStatusChanged.)
    expect(counts()).toEqual({ full: 0, newest: 1, page: 1 });
  });

  it('CONTROL — no supersededEventId (a new reply failed): both bubbles stay', async () => {
    await open(said(950, 'First try.', {}));
    svc.message.getThreadMessagesAfter = vi
      .fn()
      .mockResolvedValue(incremental(said(960, 'Second try.', { delivered: false })));
    light({ outgoingMessageId: 960, channel: 'email' });
    await screen.findByText('Second try.');
    expect(screen.getByText('First try.')).toBeTruthy();
    expect(counts()).toEqual({ full: 0, newest: 1, page: 1 });
  });

  it('a thread read holding both the replaced reply and its resend: one bubble, one Resend', async () => {
    await open(
      said(950, 'First try.', { delivered: false }),
      said(960, 'Second try.', { delivered: false, resendOf: 950 })
    );
    expect(screen.getByText('Second try.')).toBeTruthy();
    expect(screen.queryByText('First try.')).toBeNull();
    expect(resendButtons()).toHaveLength(1);
  });
});

/*
  Delivered LATER (a late answer, or a background job completing the delivery mark): the backend
  emits `message:replied` with `late: true`. A tab that is not the author's shows the bubble as
  sent: one full read (the reply may be older than an incremental read reaches).
*/
describe('a late delivery, in a colleague’s tab', () => {
  const replied = (data: Record<string, unknown>) => {
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'message:replied')
      .map(([, handler]) => handler as (data: unknown) => void);
    act(() => handlers.at(-1)?.({ messageId: baseMessage.id, ...data }));
  };

  it('"Not delivered" turns "✓ Sent" with one full read', async () => {
    await open(reply(950, 8, { delivered: false }));
    await screen.findByText('Not delivered');
    svc.message.getThreadMessages = vi
      .fn()
      .mockResolvedValue({ data: [event({ id: 900 }), reply(950, 8, {})] });
    loads = 0;
    replied({ late: true, outgoingMessageId: 950 });
    await screen.findByText('✓ Sent');
    expect(screen.queryByText('Not delivered')).toBeNull();
    expect(counts()).toMatchObject({ full: 1, newest: 0 });
  });
});
