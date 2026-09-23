/**
 * L2 P4 — what a record says when it reaches the AI draft.
 *
 * The note lands inside `<agent_instructions>`, which the backend prompt tells the model to
 * "treat as fact and build the reply around". Everything wrong here reaches a customer in a
 * sentence that sounds authoritative, so the tests are about honesty first: the admin's words,
 * the vendor's values, nothing invented, nothing silently cut.
 */
import { describe, it, expect } from 'vitest';
import {
  appendNote,
  buildRecordNote,
  defaultSelection,
  offerableFields,
} from '../customApiRecordNote';
import type { LookupField } from '@/services/customApiLookup.service';

const field = (over: { path: string; label: string; role?: string; kind?: 'plain' | 'money'; currency?: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;

const FIELDS = [
  field({ path: 'order_id', label: 'Order', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
  field({ path: 'placed', label: 'Placed', role: 'date' }),
  field({ path: 'total', label: 'Total', kind: 'money', currency: 'EUR', role: 'total' }),
  field({ path: 'email', label: 'Email', role: 'customer_email' }),
  field({ path: 'note', label: 'Note' }),
];

const ROW = {
  order_id: '137416',
  status: 'in_transit',
  status__label: 'On its way',
  placed: '2026-09-01',
  total: 348.5,
  email: 'sergio@deuspower.org',
  note: 'Leave with the neighbour',
};

describe('what the agent is offered', () => {
  it('offers only the roles a reply can use, in sentence order', () => {
    expect(offerableFields(ROW, FIELDS).map((one) => one.path)).toEqual([
      'order_id',
      'status',
      'placed',
      'total',
      'email',
    ]);
  });

  it('⛔ never offers a field the vendor left empty on THIS row', () => {
    // A ticked box for a value that does not exist would promise the agent something we cannot
    // put in the reply.
    const offered = offerableFields({ ...ROW, placed: null }, FIELDS).map((one) => one.path);
    expect(offered).not.toContain('placed');
  });

  it('🔴 defaults to reference, status and date — and NOT the total or the email', () => {
    // Money in a reply is a commitment: an agent should have to choose it, not un-choose it.
    expect(defaultSelection(ROW, FIELDS)).toEqual(['order_id', 'status', 'placed']);
  });
});

describe('the note itself', () => {
  const note = (selectedPaths: string[], over: Record<string, unknown> = {}) =>
    buildRecordNote({
      row: { ...ROW, ...over },
      fields: FIELDS,
      category: 'order',
      selectedPaths,
      lookupLabel: 'Their records',
    });

  it('🔴 reads as a fact an agent could have typed', () => {
    expect(note(['order_id', 'status', 'placed'])).toBe(
      'Order 137416 — Status: On its way. Placed: 2026-09-01.'
    );
  });

  it("🔴 carries the ADMIN'S word for the status, never the vendor's raw value", () => {
    // The model is told to treat this as fact. `in_transit` reaching a customer as a state name
    // is the exact failure P2 exists to prevent, and it would be worse here than on the panel.
    const text = note(['status']);
    expect(text).toContain('On its way');
    expect(text).not.toContain('in_transit');
  });

  it('keeps the vendor’s own value when nobody mapped it — it does not invent a word', () => {
    const text = note(['status'], { status: 'AWAITING_FULFILMENT', status__label: undefined });
    expect(text).toBe('Order — Status: AWAITING_FULFILMENT.');
  });

  it('keeps the currency with the total', () => {
    expect(note(['total'])).toBe('Order — Total: 348.5 EUR.');
  });

  it('names the CATEGORY, so a reference cannot be read as the wrong kind of number', () => {
    expect(note(['order_id'])).toBe('Order 137416.');
  });

  it("falls back to the admin's own label for the lookup when there is no category", () => {
    const text = buildRecordNote({
      row: ROW,
      fields: FIELDS,
      category: null,
      selectedPaths: ['order_id'],
      lookupLabel: 'Their records',
    });
    expect(text).toBe('Their records 137416.');
  });

  it('⛔ returns null for an empty selection — there is no such thing as an empty fact', () => {
    expect(note([])).toBeNull();
  });

  it('CONTROL: a path that is not offerable cannot be smuggled in', () => {
    // `note` has no role, so it is not offered — selecting it anyway must not put the customer's
    // delivery instruction into a reply.
    expect(note(['note'])).toBeNull();
  });
});

describe('adding it to what the agent already wrote', () => {
  const LIMIT = 2000;

  it('appends, never replaces', () => {
    const result = appendNote('We are looking into it.', 'Order 137416.', LIMIT);
    expect(result).toEqual({ text: 'We are looking into it. Order 137416.', added: true });
    expect(result.reason).toBeUndefined();
  });

  it('starts the note cleanly when the agent has written nothing', () => {
    expect(appendNote('', 'Order 137416.', LIMIT).text).toBe('Order 137416.');
  });

  it('🔴 REFUSES when it will not fit, rather than truncating', () => {
    // The backend caps agentInstructions with a plain `.slice(0, 2000)`. A note cut mid-fact
    // ("Total: 348" for 348.50) would reach a customer as a smaller number, and nothing anywhere
    // would say it had been cut.
    const nearlyFull = 'x'.repeat(LIMIT - 5);
    const result = appendNote(nearlyFull, 'Order 137416.', LIMIT);
    expect(result).toEqual({ text: nearlyFull, added: false, reason: 'too_long' });
  });

  it('⛔ does not say the same record twice', () => {
    const once = appendNote('', 'Order 137416.', LIMIT).text;
    // ⛔ AND IT SAYS WHY. "You already added this" and "your note is full" ask the agent for two
    // different things; one shared `added: false` would tell them to shorten a note that is fine.
    expect(appendNote(once, 'Order 137416.', LIMIT)).toEqual({
      text: once,
      added: false,
      reason: 'duplicate',
    });
  });
});
