/**
 * A view saved on the board must show on the board: the snapshot drops keys the board ignores
 * (each column sets its own lifecycle), else `viewAppliesTo` hides the view it just saved.
 */
import { describe, it, expect } from 'vitest';
import type { FilterState } from '@/stores/messagesStore';
import { snapshotForMode, viewAppliesTo } from '../savedViews';

const onNeedsUs: Partial<FilterState> = { messageSourceId: '12', lifecycle: 'needs_us' };

describe('snapshotForMode', () => {
  it('control: the old snapshot (with lifecycle) is hidden on the board — the reported bug', () => {
    expect(viewAppliesTo({ name: 'Client', filters: onNeedsUs }, true)).toBe(false);
  });

  it('on the board, drops lifecycle so the saved view shows there', () => {
    const filters = snapshotForMode(onNeedsUs, true) as Partial<FilterState>;
    expect(filters).toEqual({ messageSourceId: '12' });
    expect(viewAppliesTo({ name: 'Client', filters }, true)).toBe(true);
  });

  it('in the list, keeps lifecycle (Needs us is part of a list view)', () => {
    expect(snapshotForMode(onNeedsUs, false)).toEqual(onNeedsUs);
  });
});
