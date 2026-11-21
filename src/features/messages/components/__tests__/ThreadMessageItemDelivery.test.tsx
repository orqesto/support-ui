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
import {
  deliveryStateOf,
  failedBarState,
  isLatestUndelivered,
  mergeFailedSend,
  reconcileResendTarget,
} from '../deliveryState';
import { replyToComposerHtml } from '../messageDetail/useResendReply';
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
    expect(screen.queryByRole('button', { name: /^Resend the reply/ })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
    expect(onResend).toHaveBeenCalledWith(msg);
  });

  it('shows "May not have been delivered" for an uncertain send, and warns before resending', () => {
    const msg = reply({ delivered: false, sendUncertain: true });
    const onResend = vi.fn();
    render(<ThreadMessageItem msg={msg} onResend={onResend} />);
    expect(screen.getByText('May not have been delivered')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Resend the reply/ }));
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

  it('the Resend is disabled while its resend is being sent, and names its reply', () => {
    render(<ThreadMessageItem msg={reply({ delivered: false })} onResend={vi.fn()} resending />);
    const button = screen.getByRole('button', {
      name: 'Resend the reply “Your replacement ships tomorrow.”',
    });
    // (A design-system Button out of use is aria-disabled, never natively disabled.)
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toBe('Resending…');
  });

  it('shows the state but no Resend while no resend is wired', () => {
    render(<ThreadMessageItem msg={reply({ delivered: false })} />);
    expect(screen.getByText('Not delivered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Resend the reply/ })).toBeNull();
  });

  it("the bot's reply that was cut off reads as an agent's does, without a Resend (the backend resends agent replies only)", () => {
    const onResend = vi.fn();
    const bot = { type: 'bot_reply', authorId: null, authorName: null } as Partial<MessageEvent>;
    const { unmount } = render(
      <ThreadMessageItem
        msg={reply(
          { delivered: false, sendUncertain: true, sendFailedAt: '2026-11-21T10:00:05Z' },
          bot
        )}
        onResend={onResend}
      />
    );
    expect(screen.getByText('May not have been delivered')).toBeTruthy();
    expect(screen.queryByText('✓ Sent')).toBeNull();
    expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull();
    unmount();
    render(<ThreadMessageItem msg={reply({ delivered: false }, bot)} onResend={onResend} />);
    expect(screen.getByText('Not delivered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull();
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

describe('the composer bar never contradicts the bubble (failedBarState)', () => {
  it('hidden once the named reply shows as delivered, or a resend replaced it', () => {
    expect(failedBarState(41, [reply(null, { id: 41 })])).toBe('hidden');
    expect(failedBarState(41, [reply({ delivered: false, resendOf: 41 }, { id: 45 })])).toBe(
      'hidden'
    );
  });
  it('kept as told while the named reply is merely not read yet', () => {
    expect(failedBarState(41, [reply(null, { id: 40 })])).toBe('as_told');
  });
  it('worded as uncertain when the named reply may have reached the customer', () => {
    expect(failedBarState(41, [reply({ delivered: false, sendUncertain: true }, { id: 41 })])).toBe(
      'uncertain'
    );
  });
  it('CONTROL: still undelivered or sending, or no reply named → as the send was told', () => {
    expect(failedBarState(41, [reply({ delivered: false }, { id: 41 })])).toBe('as_told');
    expect(failedBarState(41, [reply({ sendState: 'sending' }, { id: 41 })])).toBe('as_told');
    expect(failedBarState(null, [reply(null, { id: 41 })])).toBe('as_told');
  });
});

describe('a resend target follows the backend link `resendOf` (reconcileResendTarget)', () => {
  const target = { eventId: 41, uncertain: false };
  it('kept while the named reply is undelivered (same object), its mark followed', () => {
    expect(reconcileResendTarget(target, [reply({ delivered: false }, { id: 41 })])).toBe(target);
    expect(
      reconcileResendTarget(target, [reply({ delivered: false, sendUncertain: true }, { id: 41 })])
    ).toEqual({ eventId: 41, uncertain: true });
  });
  it('follows the attempt that names it — along the chain', () => {
    expect(
      reconcileResendTarget(target, [
        reply({ delivered: false, resendOf: 41 }, { id: 45 }),
        reply({ delivered: false }, { id: 46 }),
      ])
    ).toEqual({ eventId: 45, uncertain: false });
    // 41 → 45 (gone, resent again) → 47.
    expect(
      reconcileResendTarget(target, [
        reply({ delivered: false, sendUncertain: true, resendOf: 45 }, { id: 47 }),
      ])
    ).toBeNull();
    expect(
      reconcileResendTarget({ eventId: 45, uncertain: false }, [
        reply({ delivered: false, sendUncertain: true, resendOf: 45 }, { id: 47 }),
      ])
    ).toEqual({ eventId: 47, uncertain: true });
  });
  it('follows a chain of resends: 41 → 45 → 47', () => {
    // 45 is gone too (it was resent), so its own successor is followed.
    const thread = [
      reply({ delivered: false, resendOf: 45 }, { id: 47 }),
      reply({ delivered: false }, { id: 50 }),
    ];
    expect(reconcileResendTarget({ eventId: 45, uncertain: false }, thread)).toEqual({
      eventId: 47,
      uncertain: false,
    });
  });
  it("never moves to someone else's failed reply: no successor → the target ends", () => {
    expect(
      reconcileResendTarget(target, [
        reply({ delivered: false }, { id: 105 }),
        reply({ delivered: false, resendOf: 100 }, { id: 110 }),
      ])
    ).toBeNull();
  });
  it('a new attempt still in flight is the target in waiting (a read mid-resend)', () => {
    expect(
      reconcileResendTarget(target, [reply({ sendState: 'sending', resendOf: 41 }, { id: 45 })])
    ).toEqual({ eventId: 45, uncertain: false });
  });
  it('ends when the named reply was delivered after all', () => {
    expect(reconcileResendTarget(target, [reply(null, { id: 41 })])).toBeNull();
    expect(reconcileResendTarget(target, [reply({ resendOf: 41 }, { id: 45 })])).toBeNull();
  });
});

describe('a stored reply goes back into the composer as it was (H1)', () => {
  it('a reply that opens with a horizontal rule is HTML too', () => {
    expect(replyToComposerHtml('<hr><p>after a rule</p>')).toBe('<hr><p>after a rule</p>');
  });
  it('the editor HTML comes back unescaped — a link, a list and an entity included', () => {
    const html =
      '<p>Hello <strong>Ann</strong>, see <a href="https://shop.example/t?a=1&amp;b=2">tracking</a> &amp; more:</p><ul><li><p>one</p></li><li><p>two</p></li></ul>';
    expect(replyToComposerHtml(html)).toBe(html);
  });
  it('plain text (a bot or chat reply) becomes paragraphs, its "<" escaped', () => {
    expect(replyToComposerHtml('Line one\n\n3 < 5 & done')).toBe(
      '<p>Line one</p><p>3 &lt; 5 &amp; done</p>'
    );
  });
});

describe('a failed send as the 502 answer and the socket event report it', () => {
  const told = { threadId: 10, eventId: 41, uncertain: false, text: null };

  it('the same reply: one report — uncertain once said stays, the text is kept', () => {
    const known = { ...told, uncertain: true, text: '<p>Hello</p>' };
    expect(mergeFailedSend(known, told)).toEqual(known);
    expect(mergeFailedSend(told, known)).toEqual(known);
  });

  it('CONTROL: another reply, or another thread, replaces what was known', () => {
    const known = { ...told, uncertain: true, text: '<p>Hello</p>' };
    expect(mergeFailedSend(known, { ...told, eventId: 45 })).toEqual({ ...told, eventId: 45 });
    expect(mergeFailedSend(known, { ...told, threadId: 11 })).toEqual({ ...told, threadId: 11 });
    expect(mergeFailedSend(null, told)).toEqual(told);
  });

  it('still the latest undelivered reply: not read yet, or read as undelivered', () => {
    expect(isLatestUndelivered(41, [])).toBe(true);
    expect(isLatestUndelivered(41, [reply({ delivered: false, sendUncertain: true })])).toBe(true);
  });

  it('no longer: delivered after all, replaced by a resend, or a newer reply went undelivered', () => {
    expect(isLatestUndelivered(41, [reply({})])).toBe(false);
    expect(isLatestUndelivered(41, [reply({ resendOf: 41 }, { id: 45 })])).toBe(false);
    expect(
      isLatestUndelivered(41, [
        reply({ delivered: false, sendUncertain: true }),
        reply({ delivered: false }, { id: 46 }),
      ])
    ).toBe(false);
  });
});
