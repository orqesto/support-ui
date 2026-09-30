import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasUnseenProblem,
  problemKeys,
  readClosedProblems,
  writeClosedProblems,
} from '../panelRules';
import { makeRun } from './fixtures';

describe('problem keys', () => {
  it('one per run problem and one per failed KB thread, with WHEN it failed', () => {
    expect(
      problemKeys({
        runs: [makeRun({ id: 'a', problems: ['failed', 'stalled'] }), makeRun({ id: 'b' })],
        kbMiningFailures: [{ conversationId: 9, at: '2026-09-30T10:00:00Z', error: 'x' }],
      })
    ).toEqual(['run:a:failed', 'run:a:stalled', 'kb:9:2026-09-30T10:00:00Z']);
  });

  it('a KB failure with no clean mine in view is NOT the streak closed under an older clean mine (pass 9)', () => {
    // The backend keeps the newest clean mine, so `:none` means there never was one in the record's
    // life: a close under `:C` long ago must not hide it.
    expect(hasUnseenProblem(['kb-run:failed:none'], ['kb-run:failed:clean-1'])).toBe(true);
    expect(hasUnseenProblem(['kb-run:failed:none'], ['kb-run:failed:none'])).toBe(false);
  });

  it('a new problem is unseen; a subset of what was closed is not', () => {
    expect(hasUnseenProblem(['run:a:failed', 'run:b:paused'], ['run:a:failed'])).toBe(true);
    expect(hasUnseenProblem(['run:a:failed'], ['run:a:failed', 'run:b:paused'])).toBe(false);
    expect(hasUnseenProblem([], [])).toBe(false);
  });
});

describe('closed problems are remembered per workspace and source', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips, and another workspace is not affected', () => {
    writeClosedProblems(1, 5, ['run:a:failed']);
    expect(readClosedProblems(1, 5)).toEqual(['run:a:failed']);
    expect(readClosedProblems(2, 5)).toEqual([]);
  });

  it('garbage in storage reads as nothing closed', () => {
    localStorage.setItem('processingPanel_closedProblems_1_5', '{not json');
    expect(readClosedProblems(1, 5)).toEqual([]);
  });
});
