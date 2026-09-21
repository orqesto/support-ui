/**
 * The two halves of the Spam queue are reachable, and behave like the lens they are.
 *
 * `spam_unconfirmed` and `spam_confirmed` partition `spam` exactly and have existed on the
 * backend since #757/#772 (2026-09-19). No UI offered either until now, so the queue an agent is
 * meant to WORK — the half the system filled and no person has agreed with — could not be opened.
 */
import { describe, it, expect } from 'vitest';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS, readAppliesTo } from '../filterSchema';
import { TRIAGE_READ_COLUMN_IDS } from '@/components/messages/kanbanColumns';

const queueOptions = () => {
  const def = buildFilterDefs(EMPTY_DYNAMIC_OPTIONS).find((entry) => entry.key === 'queue');
  return (def?.options ?? []).map((option) => option.value);
};

describe('the Spam halves', () => {
  it('are offered in the Queue filter', () => {
    // RED before this change: neither value appears, so the halves are unreachable from the UI
    // however well the backend partitions them.
    expect(queueOptions()).toEqual(expect.arrayContaining(['spam_unconfirmed', 'spam_confirmed']));
  });

  it('⛔ keep the read/unread control, like every other triage lens', () => {
    /**
     * 🔴 FOUND WHILE WRITING THIS CHANGE, in my own diff. `readAppliesTo` answers from
     * `TRIAGE_READ_COLUMN_IDS`, and adding two queue options without adding them there would have
     * hidden the read control on exactly the queue the feature is for — the same defect that
     * file's comment records being fixed once already, when the quick chips set `columnId` and
     * zeroed `queue`.
     */
    for (const queue of ['spam_unconfirmed', 'spam_confirmed'] as const) {
      expect(readAppliesTo({ queue, columnId: 'all' })).toBe(true);
      expect(TRIAGE_READ_COLUMN_IDS.has(queue)).toBe(true);
    }
  });

  it('⛔ the plain `spam` lens still exists — the halves ADD a choice, they do not replace it', () => {
    // The control: a change that renamed `spam` instead of splitting it would pass both
    // assertions above while removing the queue every agent already knows.
    expect(queueOptions()).toContain('spam');
    expect(readAppliesTo({ queue: 'spam', columnId: 'all' })).toBe(true);
  });
});
