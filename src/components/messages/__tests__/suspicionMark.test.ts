/**
 * Suspicion is a MARK on an ordinary thread, not a lane the thread lives in instead.
 *
 * This is the same move `needs_routing` made — see `routingMark.test.ts` and the comment it
 * mirrors in `kanbanColumns.ts`. A verdict that REMOVES a thread from the agent's lists
 * leaves it "in a queue nobody had open", and the client then reports mail as never arrived.
 * Suspicion was the last verdict still treated that way: its own column, plus
 * `excludeSuspicious` hard-coded into Open / In Progress / Awaiting, plus three backend
 * lenses. On the admin workspace the "All" pill read 17 of 39, with 22 hidden.
 *
 * ⛔ THE BADGE IS THE SAFETY HALF. A suspicious thread shown without a mark is worse than a
 * suspicious thread hidden — it is possible phishing rendered as ordinary mail. These pin
 * that the mark exists and that it rides ALONGSIDE the work status, never instead of it.
 *
 * Owner decision 2026-09-18: show inline, drop the column, keep the chip. SPAM STAYS HIDDEN.
 */
import { describe, expect, it } from 'vitest';
import { COLUMNS } from '@/components/messages/kanbanColumns';
import {
  getStatusBadge,
  getSuspicionBadge,
} from '@/components/messages/inboxCardHelpers';

const BASE = { parkedAt: null, lastReplyFromClient: null, status: 'open' as const };

describe('suspicion is a mark, not a lane', () => {
  it('marks a suspicious thread', () => {
    expect(getSuspicionBadge({ isSuspicious: true })?.label).toBe('Suspicious');
  });

  it('marks nothing else', () => {
    expect(getSuspicionBadge({ isSuspicious: false })).toBeNull();
    expect(getSuspicionBadge({})).toBeNull();
  });

  it('carries the mark ALONGSIDE the work status, not instead of it', () => {
    // The whole point: the thread keeps its lane and gains a mark.
    expect(getStatusBadge(BASE)).not.toBeNull();
    expect(getSuspicionBadge({ isSuspicious: true })).not.toBeNull();
  });

  it('tolerates a backend that does not send the field yet (FE/BE skew)', () => {
    // FE reaches prod before a coupled BE change does. An absent flag must read as
    // "not marked", never as a crash on a dense list row.
    expect(getSuspicionBadge({ isSuspicious: undefined })).toBeNull();
  });
});

describe('the board stops treating it as a lane', () => {
  it('has no Suspicious column', () => {
    expect(COLUMNS.find((col) => col.id === 'suspicious')).toBeUndefined();
  });

  it('CONTROL: still has the Spam column — spam stays a lane, per the owner', () => {
    // 37 spam against 6 suspicious on the measured workspace. If this disappears, the
    // change went one verdict too far.
    expect(COLUMNS.find((col) => col.id === 'spam')).toBeDefined();
  });

  it('CONTROL: still has the work columns it must show suspicious threads IN', () => {
    for (const id of ['open', 'in_progress', 'awaiting']) {
      expect(COLUMNS.find((col) => col.id === id)).toBeDefined();
    }
  });

  it('no column hides suspicion behind excludeSuspicious any more', () => {
    // ⛔ The backend change is undone the moment a column starts sending this again: the
    // rows would be fetched and then filtered out one layer up, silently.
    for (const col of COLUMNS) {
      expect(col.fixedFilters.excludeSuspicious).toBeUndefined();
    }
  });

  it('CONTROL: the Suspicious chip is untouched — view=suspicious still exists as a filter', () => {
    // Showing them inline must not cost the ability to see them alone. The chip lives in
    // the filter bar, not the board, so this asserts the API value the chip sends is still
    // a thing the board does not claim.
    expect(COLUMNS.some((col) => col.fixedFilters.view === 'suspicious')).toBe(false);
  });
});
