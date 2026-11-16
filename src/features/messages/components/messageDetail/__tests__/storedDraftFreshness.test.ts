/**
 * Does the stored AI draft answer the customer's LATEST email? (storedDraftFreshness.ts)
 */
import { describe, it, expect } from 'vitest';
import type { MessageEvent } from '@/types';
import { storedDraftFreshness } from '../storedDraftFreshness';
import { toGhostOption } from '../../messageDetailConstants';

const event = (id: number, type: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type,
    authorEmail: 'cust@example.com',
    metadata: {},
    createdAt: `2026-10-01T1${id}:00:00Z`,
    ...extra,
  }) as unknown as MessageEvent;
const thread = [event(1, 'inbound'), event(2, 'agent_reply'), event(3, 'inbound')];

describe('storedDraftFreshness', () => {
  it('a draft for an earlier customer email is stale', () => {
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 1 } }, thread)).toEqual({
      stale: true,
      noReplyWanted: false,
    });
  });

  it('CONTROL: a draft for the latest customer email is not', () => {
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 3 } }, thread).stale).toBe(
      false
    );
  });

  it('a note or our reply after it does not count as the customer email', () => {
    const later = [...thread, event(4, 'note'), event(5, 'agent_reply')];
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 3 } }, later).stale).toBe(
      false
    );
  });

  it("latest is the backend's: by when it was stored, not by its sent date", () => {
    // Email 4 was SENT before email 3 but stored after it (a late arrival): the backend drafts for 4.
    const late = [
      event(1, 'inbound'),
      event(4, 'inbound', { sentAt: '2026-10-01T09:00:00Z' }),
      event(3, 'inbound'),
    ];
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 4 } }, late).stale).toBe(
      false
    );
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 3 } }, late).stale).toBe(true);
  });

  it('a draft that names no email is shown as before', () => {
    expect(storedDraftFreshness({ suggestedAnswer: { answer: 'x' } }, thread).stale).toBe(false);
    expect(storedDraftFreshness({ suggestedAnswer: { answer: 'x' } }, [])).toEqual({
      stale: false,
      noReplyWanted: false,
    });
  });

  it('before the events load, a draft or a mark that names an email is held back', () => {
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 3 } }, []).stale).toBe(true);
    expect(storedDraftFreshness({ noReplyForEventId: 3 }, []).noReplyWanted).toBe(true);
  });

  it('two customer emails stored in the same millisecond: the draft is not hidden', () => {
    const tie = [
      event(1, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
      event(2, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
    ];
    expect(storedDraftFreshness({ suggestedAnswer: { answersEventId: 1 } }, tie).stale).toBe(false);
  });

  it("an agent's saved answer for the no-reply email is shown (the backend keeps it)", () => {
    expect(
      storedDraftFreshness({ noReplyForEventId: 3, suggestedAnswer: { answersEventId: 3 } }, thread)
    ).toEqual({ stale: false, noReplyWanted: false });
  });

  it('the backend marked the latest email as needing no reply', () => {
    expect(storedDraftFreshness({ noReplyForEventId: 3 }, thread).noReplyWanted).toBe(true);
    // CONTROL: a mark for an earlier email no longer applies once the customer wrote again.
    expect(storedDraftFreshness({ noReplyForEventId: 1 }, thread).noReplyWanted).toBe(false);
  });
});

describe('toGhostOption — the chip names what the draft was written from', () => {
  it('a draft from knowledge-base entries is labelled KB, inserted as a documentation answer', () => {
    expect(toGhostOption({ answer: 'x', source: 'knowledge_base' })).toMatchObject({
      label: 'KB',
      type: 'documentation',
    });
  });
  it('CONTROL: documentation stays DOCS, anything else AI', () => {
    expect(toGhostOption({ answer: 'x', source: 'documentation' })?.label).toBe('DOCS');
    expect(toGhostOption({ answer: 'x', source: 'message' })?.label).toBe('AI');
  });
});
