/**
 * Is the stored AI draft one written for an earlier customer email? (storedDraftFreshness.ts)
 */
import { describe, it, expect } from 'vitest';
import type { MessageEvent } from '@/types';
import {
  storedDraftFreshness,
  type BackendDraftState,
  type ThreadEventsState,
} from '../storedDraftFreshness';
import { insertSourceOf, toGhostOption } from '../../messageDetailConstants';

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
const draft = (extra: Record<string, unknown>) => ({
  suggestedAnswer: { answer: 'Here is how to do it.', ...extra },
});
const hidden = (
  metadata: Record<string, unknown>,
  events: MessageEvent[] = thread,
  state: ThreadEventsState = 'loaded'
) => storedDraftFreshness(metadata, events, state).draftHidden;

describe('storedDraftFreshness — a draft that names the email it answers', () => {
  it('for an earlier customer email: not offered', () => {
    expect(hidden(draft({ answersEventId: 1 }))).toBe(true);
  });

  it('CONTROL: for the latest customer email: offered', () => {
    expect(hidden(draft({ answersEventId: 3 }))).toBe(false);
  });

  it('a note or our reply after the customer email does not count as one', () => {
    expect(
      hidden(draft({ answersEventId: 3 }), [...thread, event(4, 'note'), event(5, 'agent_reply')])
    ).toBe(false);
  });

  it("latest is the backend's: by when it was stored, not by its sent date", () => {
    // Email 4 was SENT before email 3 but stored after it (a late arrival): the backend drafts for 4.
    const late = [
      event(1, 'inbound'),
      event(4, 'inbound', { sentAt: '2026-10-01T09:00:00Z' }),
      event(3, 'inbound'),
    ];
    expect(hidden(draft({ answersEventId: 4 }), late)).toBe(false);
    expect(hidden(draft({ answersEventId: 3 }), late)).toBe(true);
  });

  it('two customer emails stored in the same millisecond: neither draft is hidden', () => {
    const tie = [
      event(1, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
      event(2, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
    ];
    expect(hidden(draft({ answersEventId: 1 }), tie)).toBe(false);
    expect(hidden(draft({ answersEventId: 2 }), tie)).toBe(false);
  });

  it('an email newer than every loaded one (not pulled yet, or the page holds none) is the latest', () => {
    expect(hidden(draft({ answersEventId: 9 }))).toBe(false);
    expect(hidden(draft({ answersEventId: 9 }), [event(2, 'agent_reply')])).toBe(false);
  });

  it('an email older than the loaded page is not the latest', () => {
    expect(hidden(draft({ answersEventId: 0 }), [event(3, 'inbound')])).toBe(true);
  });
});

describe('storedDraftFreshness — a draft that names no email', () => {
  it('is offered as before, whenever it was written (never judged by a guess)', () => {
    expect(hidden(draft({ foundAt: '2026-10-01T12:00:00.000Z' }))).toBe(false);
    expect(hidden(draft({}))).toBe(false);
  });
});

describe('storedDraftFreshness — before the events are read', () => {
  it('pending: a draft that names an email is held back, and the count waits', () => {
    expect(storedDraftFreshness(draft({ answersEventId: 3 }), [], 'pending')).toEqual({
      draftHidden: true,
      pending: true,
    });
  });

  it('CONTROL: no draft, or one that names no email, waits for nothing', () => {
    expect(storedDraftFreshness({}, [], 'pending')).toEqual({ draftHidden: false, pending: false });
    expect(storedDraftFreshness(draft({}), [], 'pending').pending).toBe(false);
  });

  it('the read FAILED: offered as before, never hidden for good (live pulls included)', () => {
    expect(hidden(draft({ answersEventId: 1 }), thread, 'failed')).toBe(false);
    expect(hidden(draft({ answersEventId: 3 }), [], 'failed')).toBe(false);
  });

  it('a stored time that does not parse hides nothing', () => {
    expect(
      hidden(draft({ answersEventId: 1 }), [...thread, event(4, 'inbound', { createdAt: 'x' })])
    ).toBe(false);
  });
});

describe('toGhostOption — what the draft was written from', () => {
  it('knowledge-base entries: labelled KB, inserted as knowledge_base', () => {
    expect(toGhostOption({ answer: 'x', source: 'knowledge_base' })).toMatchObject({
      label: 'KB',
      type: 'documentation',
      insertSource: 'knowledge_base',
    });
  });
  it('CONTROL: documentation stays DOCS, anything else AI', () => {
    const docs = toGhostOption({ answer: 'x', source: 'documentation' });
    expect(docs?.label).toBe('DOCS');
    expect(insertSourceOf(docs!)).toBe('documentation');
    expect(toGhostOption({ answer: 'x', source: 'message' })?.label).toBe('AI');
  });
});

// The thread read states the stored draft's age by the backend's rule, with the draft it judged
// (review rounds 6-8, 2026-11-16): the loaded page no longer decides.
describe('storedDraftFreshness — with the thread read', () => {
  const read = (
    age: 'current' | 'older' | 'unknown',
    judged: { answersEventId?: number; foundAt?: string }
  ): BackendDraftState => ({
    latestInbound: { eventId: 7, at: '2026-10-01T17:00:00.000Z' },
    storedDraftAge: {
      age,
      answersEventId: judged.answersEventId ?? null,
      foundAt: judged.foundAt ?? null,
    },
  });
  const check = (metadata: Record<string, unknown>, state: BackendDraftState, events = thread) =>
    storedDraftFreshness(metadata, events, 'loaded', state).draftHidden;

  it("the backend's verdict on that very draft decides, whatever the page holds", () => {
    expect(check(draft({ answersEventId: 3 }), read('older', { answersEventId: 3 }))).toBe(true);
    // The page says 3 is the latest; the backend knows a newer email.
    expect(check(draft({ answersEventId: 3 }), read('older', { answersEventId: 3 }), thread)).toBe(
      true
    );
    expect(check(draft({ answersEventId: 1 }), read('current', { answersEventId: 1 }))).toBe(false);
  });

  it('a timestamp-only draft: the verdict applies to the same time, however it is written', () => {
    const judged = read('older', { foundAt: '2026-10-01T10:00:00.000Z' });
    expect(check(draft({ foundAt: '2026-10-01T10:00:00Z' }), judged)).toBe(true);
    expect(check(draft({ foundAt: '2026-10-02T10:00:00.000Z' }), judged)).toBe(false);
  });

  it('a draft written since the read: offered unless a later customer email follows its email', () => {
    const before = read('older', { answersEventId: 1 });
    expect(check(draft({ answersEventId: 3 }), before)).toBe(false);
    expect(check(draft({ answersEventId: 1 }), read('current', { answersEventId: 9 }))).toBe(true);
    // A tie never hides it.
    const tie = [
      event(1, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
      event(2, 'inbound', { createdAt: '2026-10-01T12:00:00.000Z' }),
    ];
    expect(check(draft({ answersEventId: 1 }), read('current', { answersEventId: 9 }), tie)).toBe(
      false
    );
  });

  it('no stored draft judged (null): a draft that names no email is offered', () => {
    expect(
      storedDraftFreshness(draft({}), thread, 'loaded', {
        latestInbound: null,
        storedDraftAge: null,
      }).draftHidden
    ).toBe(false);
  });
});
