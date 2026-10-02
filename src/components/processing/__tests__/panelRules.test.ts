import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasUnseenProblem,
  problemKeys,
  readClosedProblems,
  writeClosedProblems,
} from '../panelRules';
import { makeKbRun, makeRun } from './fixtures';

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

  it('a zero-thread close record is not a clean mine: the episode stays on the last real mine (pass 9)', () => {
    const kb = { channel: 'kb' as const, kbThreadsDone: 0, kbPairsSaved: 0 };
    const keys = problemKeys({
      runs: [
        // newest first, as be-toklim-wt 415635b0 produces it: a mine paused by the KB limit, then
        // KB switched off — closeKbRunPause writes a `done`, zero-thread `kb_off` record; KB back
        // on, the next mine failed threads. runsView kbRunViews: a LATER finished record
        // supersedes every older problem, so only the newest mine carries one (pass 11: the old
        // fixture had a problem UNDER a newer close record, which the backend never sends).
        makeKbRun({
          ...kb,
          id: 'fail',
          outcome: 'failed',
          kbThreads: 8,
          kbThreadsDone: 6,
          failed: 2,
          problems: ['failed'],
        }),
        makeKbRun({ ...kb, id: 'close', outcome: 'done', kbThreads: 0, stoppedBy: 'kb_off' }),
        makeKbRun({
          ...kb,
          id: 'paused',
          outcome: 'paused',
          kbThreads: 10,
          kbThreadsDone: 4,
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
          problems: [],
        }),
        makeKbRun({ ...kb, id: 'clean', outcome: 'done', kbThreads: 12, kbThreadsDone: 12 }),
      ],
      kbMiningFailures: [],
    });
    expect(keys).toEqual(['kb-run:failed:clean']);
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
