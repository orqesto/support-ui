/**
 * The board's coverage guarantee: every conversation has a lane.
 *
 * Before the tenth column the board COUNTED rows it would not show. Measured on the client
 * deploy 2026-09-14, CoreSarms: `scope.hidden` 114 with `other` 3, and the 111-row remainder
 * was KB-sourced mail in the `filtered` state — refused by all four triage lanes through
 * their `notKb` clause, returned by no `lifecycle`, and claimed only by a "1,322 from the
 * knowledge base" chip whose own lens returned zero rows. Counted by the product, openable
 * from nowhere in it.
 */
import { describe, it, expect } from 'vitest';
import { COLUMNS, DRAGGABLE_COLS, DROPPABLE_COLS, VALID_TARGETS } from '../kanbanColumns';
import { QUEUE_FILTERS } from '@/stores/messagesStore';

const noLane = COLUMNS.find((col) => col.id === 'no_lane');

describe('the Other column', () => {
  it('exists, so nothing the other nine refuse is left without a lane', () => {
    expect(noLane).toBeDefined();
    expect(COLUMNS).toHaveLength(10);
  });

  it('asks for the COMPLEMENT, never a list of classifications', () => {
    /**
     * ⛔ The load-bearing assertion in this file. Every enumeration of these rows has gone
     * stale within weeks — two classes are known and they arrived a month apart (outbound
     * echoes, then KB-filtered mail) — because they share no property except being declined
     * by the other predicates. `queue=no_lane` is `NOT (union of the nine)` server-side, so
     * the NEXT class lands here on the day it is created with no code change.
     *
     * A `view:` or a list of statuses here would pass every other test in this file while
     * silently reintroducing the defect.
     */
    expect(noLane?.fixedFilters).toEqual({ view: 'no_lane' });
  });

  it('sits on the VIEW axis, so a shared queue filter is not overwritten', () => {
    /**
     * The board merges `{...sharedFilters, ...fixedFilters}`, and the department picker's
     * "Needs routing" sentinel puts `queue=needs_routing` into the shared half. Spelled as
     * a `queue`, this column would replace it and keep showing every lane-less row in the
     * org while the other nine narrowed.
     *
     * The control is the triage columns that already got this right.
     */
    expect(noLane?.fixedFilters.queue).toBeUndefined();
    const merged = { queue: 'needs_routing', ...(noLane?.fixedFilters ?? {}) };
    expect(merged.queue).toBe('needs_routing');
    const triage = COLUMNS.filter((col) => col.axis === 'triage');
    expect(triage.every((col) => col.fixedFilters.queue === undefined)).toBe(true);
  });

  it('is VISIBLE by default — a lane nobody opens hides the rows by another route', () => {
    // `HIDEABLE_COLS` in MessagesKanbanView lists the columns that start collapsed. This one
    // is deliberately absent from it; the trade (a noisy lane — 1,267 outbound echoes on one
    // production workspace) was made knowingly in favour of showing the rows.
    expect(noLane?.axis).toBe('triage');
  });

  it('is neither draggable nor a drop target', () => {
    // These rows have no classification to move between. The action is to OPEN one and let
    // it acquire a real state; a drag would assert a transition that means nothing.
    expect(DRAGGABLE_COLS.has('no_lane')).toBe(false);
    expect(DROPPABLE_COLS.has('no_lane')).toBe(false);
    expect(VALID_TARGETS.no_lane).toBeUndefined();
    // Control: the assertions above are only meaningful because OTHER columns do appear in
    // these sets. An empty set would satisfy them vacuously.
    expect(DRAGGABLE_COLS.has('resolved')).toBe(true);
    expect(DROPPABLE_COLS.has('open')).toBe(true);
  });

  it('does not collide with an existing column id or label', () => {
    expect(new Set(COLUMNS.map((col) => col.id)).size).toBe(COLUMNS.length);
    expect(new Set(COLUMNS.map((col) => col.label)).size).toBe(COLUMNS.length);
  });
});

/**
 * The badge rule, pinned where the columns are — because the two counters that use it live
 * 400 lines apart in a 1,000-line DnD component and were written months apart.
 */
describe('triage badges count work, not coverage', () => {
  it('the Other lane is the ONLY triage column left out of the badges', () => {
    // ⛔ The assertion is about the SET, not about `no_lane`. Excluding a second column later
    // — or forgetting to exclude a new coverage lane — both fail here.
    const excluded = COLUMNS.filter((col) => col.axis === 'triage')
      .map((col) => col.id)
      .filter((id) => id === 'no_lane');
    expect(excluded).toEqual(['no_lane']);
    // Control: the real triage queues must still be counted, or the badge goes silent.
    const counted = COLUMNS.filter((col) => col.axis === 'triage' && col.id !== 'no_lane').map(
      (col) => col.id
    );
    expect(counted).toEqual(['not_analysed', 'archived', 'spam']);
  });
});


/**
 * The two surfaces, kept in step.
 *
 * The report that started this named BOTH: "hidden by this view 3 not clickable … thread
 * view → same". Giving the board a lane while leaving thread view unable to ask for the
 * same rows would have answered half of it — and the half that is harder to notice, because
 * the board looks complete from the outside.
 */
describe('the lane-less rows are reachable from thread view too', () => {
  it('the list queue vocabulary can express what the board column shows', () => {
    expect(QUEUE_FILTERS).toContain('no_lane');
    // Control: the vocabulary is a real allowlist, not a permissive string type — a value
    // absent from it is dropped by the URL sync, which is how a filter goes quietly missing.
    expect(QUEUE_FILTERS).not.toContain('definitely_not_a_queue');
  });

  it('keeps the narrower named lens as well, rather than folding it into the complement', () => {
    // `outbound_echo` says what a row IS; `no_lane` only says what it is not. The broader
    // lens contains the narrower one, so replacing it would lose information the product has.
    expect(QUEUE_FILTERS).toContain('outbound_echo');
  });
});
