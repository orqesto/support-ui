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

// The detail read states the latest customer email and the draft's age (the backend's rule), so
// the loaded page or a cached thread no longer decides (review round 6, 2026-11-16).
describe('storedDraftFreshness — with the detail read', () => {
  const backend = (eventId: number, extra: Partial<BackendDraftState> = {}): BackendDraftState => ({
    latestInbound: { eventId, at: `2026-10-01T1${eventId % 10}:00:00.000Z` },
    storedDraftAge: null,
    ...extra,
  });
  const withRead = (
    metadata: Record<string, unknown>,
    state: BackendDraftState,
    events: MessageEvent[] = [],
    eventsState: ThreadEventsState = 'loaded'
  ) => storedDraftFreshness(metadata, events, eventsState, state);

  it('a cached or partial page cannot hide the newest email: the read says 13, the draft answers 8', () => {
    const cached = [
      event(1, 'inbound'),
      event(8, 'inbound', { createdAt: '2026-10-01T18:00:00Z' }),
    ];
    const read: BackendDraftState = {
      latestInbound: { eventId: 13, at: '2026-10-01T23:00:00.000Z' },
      storedDraftAge: null,
    };
    expect(withRead(draft({ answersEventId: 8 }), read, cached).draftHidden).toBe(true);
  });

  it('a page with no customer email at all still decides', () => {
    expect(withRead(draft({ answersEventId: 3 }), backend(7), [event(9, 'note')]).draftHidden).toBe(
      true
    );
  });

  it('CONTROL: the draft answers the email the read names: offered, before any event loads', () => {
    expect(withRead(draft({ answersEventId: 7 }), backend(7), [], 'pending')).toEqual({
      draftHidden: false,
      pending: false,
    });
  });

  it('an email pulled live after the read, stored later, is the latest now', () => {
    const pulled = [event(9, 'inbound', { createdAt: '2026-10-01T23:00:00Z' })];
    expect(withRead(draft({ answersEventId: 7 }), backend(7), pulled).draftHidden).toBe(true);
    expect(withRead(draft({ answersEventId: 9 }), backend(7), pulled).draftHidden).toBe(false);
  });

  it('a pulled email in the same millisecond as the read latest never hides its draft', () => {
    const tie = [event(9, 'inbound', { createdAt: '2026-10-01T17:00:00.000Z' })];
    expect(withRead(draft({ answersEventId: 7 }), backend(7), tie).draftHidden).toBe(false);
  });

  it('a draft for an email inserted after the read and not pulled yet is current', () => {
    expect(withRead(draft({ answersEventId: 12 }), backend(7)).draftHidden).toBe(false);
  });

  it("a draft that names no email: the backend's age, while it is the draft it judged", () => {
    const old = { foundAt: '2026-10-01T10:00:00.000Z' };
    const judged = (age: 'older' | 'current') =>
      backend(7, { storedDraftAge: { age, answersEventId: null, foundAt: old.foundAt } });
    expect(withRead(draft(old), judged('older')).draftHidden).toBe(true);
    expect(withRead(draft(old), judged('current')).draftHidden).toBe(false);
    // A newer draft replaced it since the read: the old verdict does not apply.
    expect(
      withRead(draft({ foundAt: '2026-10-02T10:00:00.000Z' }), judged('older')).draftHidden
    ).toBe(false);
  });

  it('no customer email at all: offered', () => {
    expect(
      storedDraftFreshness(draft({ answersEventId: 3 }), [], 'loaded', {
        latestInbound: null,
        storedDraftAge: null,
      }).draftHidden
    ).toBe(false);
  });

  it('the read saw no customer email; emails pulled since decide', () => {
    const pulled = [
      event(9, 'inbound', { createdAt: '2026-10-01T20:00:00Z' }),
      event(11, 'inbound', { createdAt: '2026-10-01T21:00:00Z' }),
    ];
    const none: BackendDraftState = { latestInbound: null, storedDraftAge: null };
    expect(
      storedDraftFreshness(draft({ answersEventId: 9 }), pulled, 'loaded', none).draftHidden
    ).toBe(true);
    expect(
      storedDraftFreshness(draft({ answersEventId: 11 }), pulled, 'loaded', none).draftHidden
    ).toBe(false);
  });

  it('an email already loaded is never "newer than the read" by its id (an import stored earlier)', () => {
    const imported = [event(9, 'inbound', { createdAt: '2026-10-01T05:00:00Z' })];
    expect(withRead(draft({ answersEventId: 9 }), backend(7), imported).draftHidden).toBe(true);
  });
});
