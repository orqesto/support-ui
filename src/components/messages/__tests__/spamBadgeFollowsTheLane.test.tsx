/**
 * The card's spam mark follows the LANE, and says whether a person has agreed.
 *
 * Two separate defects live here. The mark itself was read from `metadata.spamCheck`, frozen at
 * thread creation, while the lane resolves the newest inbound event — so a thread that turned
 * spam mid-thread wore no mark and one that was cleared kept a red one. And a confirmed thread
 * looked identical to an unconfirmed one, which is how two agents end up opening the same thread
 * to decide the same thing.
 */
import { describe, it, expect } from 'vitest';
import { getRiskSignals, getSpine, isSpamThread } from '@/components/messages/inboxCardHelpers';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';

const msg = (over: Record<string, unknown> = {}): Message =>
  ({ id: 1, status: 'filtered', channel: 'email', ...over }) as unknown as Message;
const thread = { lastReplyFromClient: false } as unknown as MessageThread;
const spamSignal = (row: Message) => getRiskSignals(row).find((signal) => signal.key === 'spam');

describe('the spam mark on a card', () => {
  it('⛔ follows the lane when the frozen copy disagrees', () => {
    // RED with the frozen read: the thread turned spam mid-thread and wore no mark at all.
    const turned = msg({ isSpam: true, metadata: { spamCheck: { isSpam: false, category: 'legitimate' } } });

    expect(isSpamThread(turned)).toBe(true);
    expect(spamSignal(turned)).toBeDefined();
    expect(getSpine(turned, thread)).toBe('red');
  });

  it('⛔ drops the mark when the lane no longer says spam', () => {
    // The other direction, and the control: a stale frozen verdict must not keep a red mark on a
    // thread the server has stopped counting as junk.
    const cleared = msg({ isSpam: false, metadata: { spamCheck: { isSpam: true, category: 'spam' } } });

    expect(isSpamThread(cleared)).toBe(false);
    expect(spamSignal(cleared)).toBeUndefined();
  });

  it('⚠️ falls back to the frozen copy when the deployment sends no flag', () => {
    // RED: `message.isSpam === true` instead of `??` loses every spam mark in the product on a
    // backend older than support-service#799 — this frontend deploys on merge, the backend on a tag.
    const older = msg({ metadata: { spamCheck: { isSpam: true, category: 'spam' } } });

    expect(isSpamThread(older)).toBe(true);
    expect(spamSignal(older)).toBeDefined();
  });

  it('says whether a PERSON has confirmed it', () => {
    const unconfirmed = msg({ isSpam: true, spamConfirmedAt: null });
    const confirmed = msg({ isSpam: true, spamConfirmedAt: '2026-09-20T09:30:00.000Z' });

    expect(spamSignal(unconfirmed)?.label).toBe('Spam');
    expect(spamSignal(unconfirmed)?.tooltip).toMatch(/nobody has confirmed/i);
    expect(spamSignal(confirmed)?.label).toBe('Spam · confirmed');
    expect(spamSignal(confirmed)?.tooltip).toMatch(/Confirmed as spam by an agent on/);
  });

  it('⛔ never claims a confirmation the deployment did not report', () => {
    // The control for the label: an absent field is not a confirmation, and a card that said
    // "confirmed" on every spam row would pass the assertions above.
    const noField = msg({ isSpam: true });

    expect(spamSignal(noField)?.label).toBe('Spam');
  });
});
