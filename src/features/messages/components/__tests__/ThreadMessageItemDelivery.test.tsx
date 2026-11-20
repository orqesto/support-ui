/**
 * An outgoing bubble says what became of the send (owner 2026-11-20): "✓ Sent" was printed under
 * every reply, so a reply the channel never delivered looked delivered to every agent, and the
 * only failure notice was the composer's bar — gone on a reload, never shown to a colleague.
 *
 * The state is read from the event's own metadata (deliveryState.ts), so it is the same after a
 * reload and for every agent. These render the REAL bubble.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';
import { deliveryStateOf, failedReplyDelivered } from '../deliveryState';
import { withDeliveryUpdates } from '../threadNewEvents';

vi.mock('@/features/messages/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const reply = (metadata: Record<string, unknown> | null, over: Partial<MessageEvent> = {}) =>
  ({
    id: 41,
    conversationId: 10,
    type: 'agent_reply',
    content: 'Your replacement ships tomorrow.',
    authorId: 7,
    authorEmail: 'support@shop.example',
    authorName: 'Ana Agent',
    channel: 'email',
    sentAt: '2026-11-20T10:00:00Z',
    createdAt: '2026-11-20T10:00:00Z',
    metadata,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

describe('ThreadMessageItem — delivery state under an outgoing bubble', () => {
  it('CONTROL: an ordinary sent reply still shows "✓ Sent" and offers no resend', () => {
    const onResend = vi.fn();
    render(<ThreadMessageItem msg={reply({ isSystemReply: true })} onResend={onResend} />);
    expect(screen.getByText('✓ Sent')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
  });

  it('a reply from before the marks existed (no metadata) reads as sent', () => {
    render(<ThreadMessageItem msg={reply(null)} />);
    expect(screen.getByText('✓ Sent')).toBeTruthy();
  });

  it('shows "Sending…" while the channel has not answered', () => {
    render(<ThreadMessageItem msg={reply({ sendState: 'sending' })} />);
    expect(screen.getByText('Sending…')).toBeTruthy();
    expect(screen.queryByText('✓ Sent')).toBeNull();
  });

  it('shows "Not delivered" for a failed send, and Resend sends it again at once', () => {
    const msg = reply({ delivered: false, sendFailedAt: '2026-11-20T10:00:05Z' });
    const onResend = vi.fn();
    render(<ThreadMessageItem msg={msg} onResend={onResend} />);
    expect(screen.getByText('Not delivered')).toBeTruthy();
    expect(screen.queryByText('✓ Sent')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(onResend).toHaveBeenCalledWith(msg);
  });

  it('shows "May not have been delivered" for an uncertain send, and warns before resending', () => {
    const msg = reply({ delivered: false, sendUncertain: true });
    const onResend = vi.fn();
    render(<ThreadMessageItem msg={msg} onResend={onResend} />);
    expect(screen.getByText('May not have been delivered')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    // Not sent yet: the customer may already have it.
    expect(onResend).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'We could not confirm that this reply reached the customer. If you resend it, they may get it twice.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resend anyway' }));
    expect(onResend).toHaveBeenCalledWith(msg);
  });

  it('shows the state but no Resend while no resend is wired', () => {
    render(<ThreadMessageItem msg={reply({ delivered: false })} />);
    expect(screen.getByText('Not delivered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
  });

  it('an incoming message carries no delivery line', () => {
    render(
      <ThreadMessageItem
        msg={reply({ delivered: false }, { type: 'inbound', authorEmail: 'customer@mail.example' })}
      />
    );
    expect(screen.queryByText('Not delivered')).toBeNull();
    expect(screen.queryByText('✓ Sent')).toBeNull();
  });
});

describe('deliveryStateOf', () => {
  it.each([
    [null, 'sent'],
    [{}, 'sent'],
    [{ delivered: true }, 'sent'],
    [{ sendState: 'sending' }, 'sending'],
    [{ delivered: false }, 'failed'],
    [{ delivered: false, sendUncertain: true }, 'uncertain'],
    // A failure wins over a stale in-flight mark.
    [{ delivered: false, sendState: 'sending' }, 'failed'],
    // Only the boolean false counts: a malformed value is not a failure.
    [{ delivered: 'false' }, 'sent'],
  ])('%j → %s', (metadata, state) => {
    expect(deliveryStateOf({ metadata })).toBe(state);
  });
});

describe('live reads refresh the delivery state of bubbles already on screen', () => {
  it('a "Sending…" reply turns into a sent one from the next incremental read', () => {
    const current = [reply({ sendState: 'sending' }, { id: 41 }), reply(null, { id: 40 })];
    const updated = withDeliveryUpdates(current, [reply({ isSystemReply: true }, { id: 41 })]);
    expect(updated?.map((event) => deliveryStateOf(event))).toEqual(['sent', 'sent']);
  });

  it('a reply given up as undelivered shows it', () => {
    const updated = withDeliveryUpdates(
      [reply({ sendState: 'sending' })],
      [reply({ delivered: false })]
    );
    expect(updated && deliveryStateOf(updated[0])).toBe('failed');
  });

  it('CONTROL: nothing changed → null (no re-render)', () => {
    const current = [reply(null, { id: 41 })];
    expect(withDeliveryUpdates(current, [reply({ isSystemReply: true }, { id: 41 })])).toBeNull();
    expect(withDeliveryUpdates(current, [reply({ delivered: false }, { id: 99 })])).toBeNull();
  });
});

describe('the composer bar never contradicts the bubble', () => {
  it('a failure whose reply is shown as delivered after all hides the bar', () => {
    expect(failedReplyDelivered(41, [reply(null, { id: 41 })])).toBe(true);
  });

  it('CONTROL: still undelivered, not on screen, or no event named → the bar stays', () => {
    expect(failedReplyDelivered(41, [reply({ delivered: false }, { id: 41 })])).toBe(false);
    expect(failedReplyDelivered(41, [reply({ sendState: 'sending' }, { id: 41 })])).toBe(false);
    expect(failedReplyDelivered(41, [reply(null, { id: 40 })])).toBe(false);
    expect(failedReplyDelivered(null, [reply(null, { id: 41 })])).toBe(false);
  });
});
