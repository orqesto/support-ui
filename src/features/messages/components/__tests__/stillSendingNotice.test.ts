/**
 * deliveryState.ts — when the "still being sent" notice is true, and the bar's sentences naming
 * the channel as the app shows it. Invented data.
 */
import { describe, expect, it } from 'vitest';
import {
  notDeliveredText,
  sameReplySendingId,
  stillSendingShown,
  uncertainFailureText,
  type StillSending,
} from '../deliveryState';

const reply = (id: number, metadata: Record<string, unknown>, authorId = 7, content = 'Hello') => ({
  id,
  type: 'agent_reply' as const,
  content,
  authorId,
  metadata,
});
const named: StillSending = { threadId: 1, text: '<p>Hello</p>', eventId: 950, afterId: null };
const unnamed: StillSending = { threadId: 1, text: '<p>Hello</p>', eventId: null, afterId: 900 };

describe('sameReplySendingId', () => {
  it('the newest of the agent’s own replies with this text that is still being sent', () => {
    const thread = [
      reply(940, { sendState: 'sending' }),
      reply(950, { sendState: 'sending' }),
      reply(960, {}),
      reply(970, { sendState: 'sending' }, 8),
      reply(980, { sendState: 'sending' }, 7, 'Something else'),
    ];
    expect(sameReplySendingId('<p>Hello</p>', thread, 7)).toBe(950);
    expect(sameReplySendingId('<p>Hello</p>', thread, null)).toBeNull();
    expect(sameReplySendingId('<p>Bye</p>', thread, 7)).toBeNull();
  });
});

describe('stillSendingShown', () => {
  it('shown while the named reply is being sent and the composer holds its text', () => {
    expect(
      stillSendingShown(named, 1, '<p>Hello</p>', [reply(950, { sendState: 'sending' })], 7)
    ).toBe(true);
  });
  it.each([
    ['sent', [reply(950, {})]],
    ['not delivered', [reply(950, { delivered: false })]],
    ['may not have been delivered', [reply(950, { delivered: false, sendUncertain: true })]],
    ['gone from the thread', []],
  ])('hidden once the named reply is %s', (_state, thread) => {
    expect(stillSendingShown(named, 1, '<p>Hello</p>', thread, 7)).toBe(false);
  });
  it('hidden when the composer holds another text, on another thread, and without a notice', () => {
    const thread = [reply(950, { sendState: 'sending' })];
    expect(stillSendingShown(named, 1, '<p>Hello there</p>', thread, 7)).toBe(false);
    expect(stillSendingShown(named, 2, '<p>Hello</p>', thread, 7)).toBe(false);
    expect(stillSendingShown(null, 1, '<p>Hello</p>', thread, 7)).toBe(false);
  });
  it('no reply named (the server said so): shown until the thread shows that reply as over', () => {
    expect(stillSendingShown(unnamed, 1, '<p>Hello</p>', [], 7)).toBe(true);
    expect(
      stillSendingShown(unnamed, 1, '<p>Hello</p>', [reply(950, { sendState: 'sending' })], 7)
    ).toBe(true);
    expect(stillSendingShown(unnamed, 1, '<p>Hello</p>', [reply(950, {})], 7)).toBe(false);
    // An older reply with the same words, or a colleague's, is not the one on its way.
    expect(stillSendingShown(unnamed, 1, '<p>Hello</p>', [reply(890, {})], 7)).toBe(true);
    expect(stillSendingShown(unnamed, 1, '<p>Hello</p>', [reply(950, {}, 8)], 7)).toBe(true);
  });
});

describe('the bar names the channel as the app shows it, never its code', () => {
  it.each([
    ['email', 'via email'],
    ['whatsapp', 'via WhatsApp'],
    ['telegram', 'via Telegram'],
    ['chat_widget', /via [a-z]+ [a-z]+/],
  ])('%s', (channel, shown) => {
    expect(notDeliveredText(channel)).toMatch(shown);
    expect(uncertainFailureText(channel)).toMatch(shown);
    expect(notDeliveredText(channel)).not.toContain('_');
  });
  it('no channel: no "via"; and no promise of a retry the bar may not offer', () => {
    expect(notDeliveredText(null)).toBe('Reply could not be delivered. It was saved but not sent.');
    expect(notDeliveredText('email')).not.toMatch(/try again/);
    expect(uncertainFailureText(undefined)).toBe(
      'We could not confirm that the reply reached the customer. Check before you send it again — they may get it twice.'
    );
  });
});
