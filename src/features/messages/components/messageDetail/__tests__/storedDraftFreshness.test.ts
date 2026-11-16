/**
 * Is the stored AI draft one written for an earlier customer email? (storedDraftFreshness.ts)
 */
import { describe, it, expect } from 'vitest';
import type { MessageEvent } from '@/types';
import { storedDraftFreshness, type ThreadEventsState } from '../storedDraftFreshness';
import { insertSourceOf, toGhostOption } from '../../messageDetailConstants';

const event = (id: number, type: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type,
    authorEmail: 'cust@example.com',
    // A judged customer email (ingestion stamps the verdict on the event).
    metadata: { spamCheck: { category: 'legitimate' } },
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

// 2026-11-17: machine mail after the customer's question is not them writing — it never hides
// the draft for the question (the backend judges the same way).
describe('storedDraftFreshness — mail that is not the customer writing', () => {
  // Review 2026-11-17 round 13: the backend's per-event answer decides, not the app's copy of its
  // markers (the copy is only for a backend that does not send it).
  it("the backend's customerWriting flag decides over the markers, both ways", () => {
    const flagged = (id: number, customerWriting: boolean, metadata: Record<string, unknown>) =>
      event(id, 'inbound', { customerWriting, metadata });
    // Markers say "writing", the backend says no: email 3 does not make the draft for 1 older.
    expect(
      hidden(draft({ answersEventId: 1 }), [
        event(1, 'inbound'),
        flagged(3, false, { spamCheck: { category: 'legitimate' } }),
      ])
    ).toBe(false);
    // Markers say "not judged", the backend says writing: it does.
    expect(
      hidden(draft({ answersEventId: 1 }), [event(1, 'inbound'), flagged(3, true, {})])
    ).toBe(true);
  });

  it("the draft's own email with a time that does not parse: offered (unknown age)", () => {
    const ooo = event(2, 'inbound', {
      metadata: { customerAutoReply: true },
      createdAt: 'not a time',
    });
    expect(hidden(draft({ answersEventId: 2 }), [event(1, 'inbound'), ooo])).toBe(false);
  });

  it.each([
    ['their out-of-office', { customerAutoReply: true }],
    ['a bounce', { deliveryFailure: true }],
    ['a historical import', { historicalImport: true }],
    ['a copy our mailbox forwarded', { relayedFrom: { forwarded: true } }],
    ['junk', { spamCheck: { category: 'spam' } }],
    ['a receipt (transactional)', { spamCheck: { category: 'transactional' } }],
    ['promotional', { spamCheck: { category: 'promotional' } }],
    ['an out-of-office verdict after the save', { spamCheck: { category: 'out_of_office' } }],
    ['a Zendesk import', { zendesk: { ticketId: 1 } }],
    ['an automatic reply paused by its verdict', { spamCheck: { handling: 'pause_thread' } }],
    ['a message pulled before its verdict', {}],
  ])('%s after the email: the draft for it is still offered', (_label, metadata) => {
    expect(
      hidden(draft({ answersEventId: 3 }), [...thread, event(4, 'inbound', { metadata })])
    ).toBe(false);
  });

  it('a loaded page with only such mail, holding the draft\'s email: offered (an earlier page may hold the backend\'s pick)', () => {
    const forwarded = (id: number) =>
      event(id, 'inbound', { metadata: { relayedFrom: { forwarded: true } } });
    expect(hidden(draft({ answersEventId: 1 }), [forwarded(1), forwarded(3)])).toBe(false);
    expect(hidden(draft({ answersEventId: 3 }), [forwarded(1), forwarded(3)])).toBe(false);
  });

  it('CONTROL: one customer email on the page still decides (a draft for a forwarded copy before it is hidden)', () => {
    const forwarded = event(1, 'inbound', { metadata: { relayedFrom: { forwarded: true } } });
    expect(hidden(draft({ answersEventId: 1 }), [forwarded, event(3, 'inbound')])).toBe(true);
  });

  it("a loaded page with only such mail and without the draft's email: nothing is known, offered", () => {
    const ooo = (id: number) => event(id, 'inbound', { metadata: { customerAutoReply: true } });
    expect(hidden(draft({ answersEventId: 2 }), [ooo(5), ooo(6)])).toBe(false);
  });

  it('a Zendesk import a live mailbox adopted counts as the customer writing', () => {
    const adopted = {
      zendesk: { ticketId: 1 },
      adoptedAt: 'x',
      spamCheck: { category: 'legitimate' },
    };
    expect(
      hidden(draft({ answersEventId: 3 }), [...thread, event(4, 'inbound', { metadata: adopted })])
    ).toBe(true);
  });

  it('a draft for a later email that is not the customer writing (judged junk afterwards): kept', () => {
    const junkLater = event(4, 'inbound', { metadata: { spamCheck: { category: 'spam' } } });
    expect(hidden(draft({ answersEventId: 4 }), [...thread, junkLater])).toBe(false);
  });

  it('an import a live mailbox adopted counts even without a verdict', () => {
    const adopted = event(4, 'inbound', { metadata: { zendesk: {}, adoptedAt: 'x' } });
    expect(hidden(draft({ answersEventId: 3 }), [...thread, adopted])).toBe(true);
  });

  it('CONTROL: the customer writing again hides it', () => {
    expect(hidden(draft({ answersEventId: 3 }), [...thread, event(4, 'inbound')])).toBe(true);
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
