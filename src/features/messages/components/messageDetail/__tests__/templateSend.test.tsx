/**
 * The WhatsApp approved-template send, through MessageDetail as the app calls the services: its
 * own `message:replied` echo reads nothing more (the send re-reads the thread itself), and a 502
 * that says `retryable: false` never says "please try again". Invented data.
 */
import { renderDetail, svc, event, baseMessage } from '../../__tests__/md4.mobile.utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { subscribeToEvent } from '@/lib/socketManager';

const onRefresh = vi.fn();
const template = {
  id: 31,
  name: 'order_update',
  language: 'en',
  category: 'UTILITY',
  bodyText: 'Your order has an update.',
  variableCount: 0,
  cost: 'Utility — low per-message rate',
};
const replied = (data: Record<string, unknown>) => {
  const handlers = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([name]) => name === 'message:replied')
    .map(([, handler]) => handler as (data: unknown) => void);
  act(() => {
    for (const handler of handlers) handler({ messageId: baseMessage.id, ...data });
  });
};
let loads = 0;
const counts = () => ({
  full: svc.message.getThreadMessages.mock.calls.length - loads,
  newest: svc.message.getThreadMessagesAfter.mock.calls.length,
  page: onRefresh.mock.calls.length,
});

const sendTemplate = async () => {
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [event({ id: 900 })] });
  svc.message.getThreadMessagesAfter = vi.fn().mockResolvedValue({
    data: [],
    page: { total: 0, hasEarlier: false },
    newEvents: { incremental: true, hasMore: false },
  });
  svc.message.listWhatsAppTemplates = vi.fn().mockResolvedValue([template]);
  renderDetail(
    {
      channel: 'whatsapp',
      whatsappWindow: { open: false, expiresAt: '2026-09-01T10:00:00Z', reason: 'expired' },
    },
    { onRefresh }
  );
  await screen.findAllByText('Hi there');
  fireEvent.click(await screen.findByRole('button', { name: /Use an approved template/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByText('order_update'));
  loads = svc.message.getThreadMessages.mock.calls.length;
  onRefresh.mockClear();
  fireEvent.click(within(dialog).getByRole('button', { name: /SEND TEMPLATE/ }));
  await waitFor(() => expect(svc.message.reply).toHaveBeenCalledTimes(1));
  return dialog;
};

beforeEach(() => {
  window.localStorage.clear();
  onRefresh.mockClear();
});

describe('a WhatsApp template send', () => {
  it('its own echo reads nothing more: {full 1, newest 0, page 1}', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    await sendTemplate();
    await waitFor(() => expect(counts().full).toBe(1));
    const key = (svc.message.reply.mock.calls[0] as unknown[])[5];
    expect(key).toEqual(expect.any(String));
    replied({ idempotencyKey: key });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(counts()).toEqual({ full: 1, newest: 0, page: 1 });
  });

  it('CONTROL — a colleague’s reply echo is still read', async () => {
    svc.message.reply = vi.fn().mockResolvedValue({ success: true });
    await sendTemplate();
    await waitFor(() => expect(counts().full).toBe(1));
    replied({ idempotencyKey: 'a-colleague-key' });
    await waitFor(() => expect(counts().newest).toBe(1));
  });

  it('a 502 with `retryable: false`: the backend’s sentence and why, never "please try again"', async () => {
    const said = 'Reply saved but not delivered: WhatsApp refused this template for this number.';
    svc.message.reply = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('A server error occurred. Please try again later.'), {
        status: 502,
        data: { success: false, error: said, eventId: 955, uncertain: false, retryable: false },
      })
    );
    const dialog = await sendTemplate();
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe(
      `${said} Sending this reply again cannot help, so it is not offered: write a new reply once the cause is dealt with.`
    );
    expect(alert.textContent).not.toMatch(/try again/i);
  });

  it('CONTROL — a 502 without `retryable`: the sentence alone', async () => {
    const said = 'Reply saved but not delivered: the WhatsApp service did not answer.';
    svc.message.reply = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('A server error occurred. Please try again later.'), {
        status: 502,
        data: { success: false, error: said, eventId: 955, uncertain: false },
      })
    );
    const dialog = await sendTemplate();
    expect((await within(dialog).findByRole('alert')).textContent).toBe(said);
  });
});
