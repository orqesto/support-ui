/**
 * #756 deleted the Suspicious COLUMN. Six collections still named `suspicious`, and they do
 * not all mean the same thing — which is why this file asserts both directions.
 *
 * The COLUMN-keyed ones are matched against `col.id`: `DRAGGABLE_COLS`, `VALID_TARGETS` and
 * `getDndAction` here, plus `HIDEABLE_COLS` and `ARRIVAL_KIND_BY_COL` in MessagesKanbanView.
 * With no column carrying that id they were unreachable — dead branches that read as live
 * support for a drag-and-drop path nobody can perform.
 *
 * ⛔ `TRIAGE_READ_COLUMN_IDS` is NOT one of them and must keep the string. It is keyed by two
 * spaces: `readAppliesTo` in `filters/filterSchema.ts` tests it against `filters.queue` as
 * well as `filters.columnId`, and `queue='suspicious'` is live — the Suspicious chip and the
 * arrival notice both jump to it. Removing it there would hide the read/unread control on
 * exactly that lens, which is the defect `filterSchema.ts`'s own comment exists to prevent.
 * Finishing the cleanup by deleting every occurrence is the mistake this test blocks.
 */
import { describe, it, expect } from 'vitest';
import {
  COLUMNS,
  DRAGGABLE_COLS,
  VALID_TARGETS,
  TRIAGE_READ_COLUMN_IDS,
  getDndAction,
  APPROVE_TARGET,
} from '../kanbanColumns';
import { readAppliesTo } from '../filters/filterSchema';

describe('suspicious is no longer a column', () => {
  it('has no column with that id — the premise of everything below', () => {
    expect(COLUMNS.find((col) => col.id === 'suspicious')).toBeUndefined();
  });

  it('is not a drag source', () => {
    expect(DRAGGABLE_COLS.has('suspicious')).toBe(false);
    // Control: the set still holds the sources that do exist.
    expect(DRAGGABLE_COLS.has('not_analysed')).toBe(true);
  });

  it('has no drop-target table', () => {
    expect(VALID_TARGETS.suspicious).toBeUndefined();
    expect(VALID_TARGETS.not_analysed).toBeDefined();
  });

  it('yields no drag action from a column that cannot exist', () => {
    expect(getDndAction('suspicious', APPROVE_TARGET)).toBeNull();
    expect(getDndAction('suspicious', 'spam')).toBeNull();
    // Control: the surviving sources still resolve, so a null above means "removed",
    // not "getDndAction returns null for everything".
    expect(getDndAction('not_analysed', APPROVE_TARGET)).toBe('approve');
    expect(getDndAction('archived', 'spam')).toBe('move_to_spam');
  });
});

describe('suspicious is still a QUEUE, and the read filter follows it there', () => {
  it('keeps the read/unread control on the Suspicious chip', () => {
    expect(TRIAGE_READ_COLUMN_IDS.has('suspicious')).toBe(true);
    expect(readAppliesTo({ queue: 'suspicious', columnId: undefined })).toBe(true);
  });

  it('still refuses the control on a lifecycle lane', () => {
    expect(readAppliesTo({ queue: 'all', columnId: 'open' })).toBe(false);
  });
});
