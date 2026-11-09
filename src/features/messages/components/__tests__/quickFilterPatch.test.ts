/**
 * Clicking All twice must change nothing; every other chip keeps its on/off toggle.
 *
 * The reported symptom: "Showing 56 of 72 — 16 hidden by the current view" appearing after a
 * SECOND click on a chip that already looked selected. The click re-patched `lifecycle` and
 * `queue` to `'all'`, and on the backend those are not neutral — `messageFilters` skips the
 * default terminal/passive exclusion while a specific lifecycle or queue is set and re-applies
 * it for `'all'`. So the second click re-imposed an exclusion a lens had lifted.
 */
import { describe, it, expect } from 'vitest';
import { COLUMNS } from '../kanbanColumns';
import { quickFilterWouldChange } from '../quickFilterPatch';

describe('the All chip', () => {
  it('does NOTHING on a second click — the whole bug', () => {
    const cleared = { columnId: 'all', lifecycle: 'all', queue: 'all' };
    expect(quickFilterWouldChange(cleared, 'all')).toBe(false);
  });

  it('treats an absent field as all, so a fresh page is also a no-op', () => {
    expect(quickFilterWouldChange({}, 'all')).toBe(false);
  });

  it('STILL clears when a dropdown is narrowing, even though the chip looks lit', () => {
    // `All` renders lit whenever no column is selected, including here. Guarding on "lit"
    // instead of on the resulting state would strand the user with no way to clear these.
    expect(quickFilterWouldChange({ lifecycle: 'awaiting' }, 'all')).toBe(true);
    expect(quickFilterWouldChange({ queue: 'needs_routing' }, 'all')).toBe(true);
  });
});

describe('every other chip keeps working as it did', () => {
  it('turns on', () => {
    expect(quickFilterWouldChange({ columnId: 'all' }, 'resolved')).toBe(true);
  });

  it('turns off — the chip passes all while its column is still selected', () => {
    expect(quickFilterWouldChange({ columnId: 'resolved' }, 'all')).toBe(true);
  });

  it('switches from one column to another', () => {
    expect(quickFilterWouldChange({ columnId: 'resolved' }, 'suspicious')).toBe(true);
  });

  it('CONTROL: re-clicking an already-selected column is also a no-op', () => {
    // Not the reported bug, but the same rule: nothing is written when nothing changes.
    expect(quickFilterWouldChange({ columnId: 'suspicious' }, 'suspicious')).toBe(false);
  });

  it('covers every chip the board offers, derived from COLUMNS rather than retyped', () => {
    // The component builds its chips FROM `COLUMNS` "never from a parallel list", so the test
    // does too. A hand-written list here was wrong on first writing — it invented `pending` and
    // `triage`; the real ids are `awaiting` (labelled "Pending") and there is no triage column
    // at all, `Triage` being the AXIS heading over Not Analysed / Archived / Spam.
    expect(COLUMNS.length).toBeGreaterThan(0);
    for (const col of COLUMNS) {
      expect(quickFilterWouldChange({ columnId: 'all' }, col.id)).toBe(true); // on
      expect(quickFilterWouldChange({ columnId: col.id }, 'all')).toBe(true); // off
      expect(quickFilterWouldChange({ columnId: col.id }, col.id)).toBe(false); // re-click
    }
  });
});
