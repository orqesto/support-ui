import { describe, expect, it } from 'vitest';
import {
  describeDays,
  describeLimit,
  describeRelease,
  formatLimit,
  parseLimitInput,
  usageLevel,
} from '../tokenLimits.helpers';
import { normaliseRelease, type TokenLimitRelease } from '@/services/managedAiUsage.service';

describe('token limit helpers', () => {
  it('0 reads "no limit" — it switches the limit off, it does not mean zero tokens', () => {
    expect(formatLimit(0)).toBe('no limit');
    expect(formatLimit(2_000_000)).toBe((2_000_000).toLocaleString());
    expect(describeLimit({ limit: 5_000_000, source: 'default' })).toContain('built-in default');
  });

  it('flags ≥80% as near and ≥100% as reached; no limit is never flagged', () => {
    expect(usageLevel(0, 100)).toBe('ok');
    expect(usageLevel(79, 100)).toBe('ok');
    expect(usageLevel(80, 100)).toBe('near');
    expect(usageLevel(100, 100)).toBe('reached');
    expect(usageLevel(5_000_000, 0)).toBe('unlimited');
  });

  it('parses a typed limit: blank follows the platform, separators are fine, junk is refused', () => {
    expect(parseLimitInput('')).toEqual({ ok: true, value: null });
    expect(parseLimitInput('  ')).toEqual({ ok: true, value: null });
    expect(parseLimitInput('2,000,000')).toEqual({ ok: true, value: 2_000_000 });
    expect(parseLimitInput('0')).toEqual({ ok: true, value: 0 });
    for (const junk of ['-5', '1.5', '2M', 'lots', '1e6']) {
      expect(parseLimitInput(junk).ok).toBe(false);
    }
    expect(parseLimitInput('9999999999999').ok).toBe(false);
  });

  it('accepts groups of three with one separator, refuses stray or mixed separators (F9)', () => {
    for (const good of ['2 000 000', '2_000_000', "2'000'000", '1,000', '999']) {
      expect(parseLimitInput(good).ok).toBe(true);
    }
    expect(parseLimitInput('2 000 000')).toEqual({ ok: true, value: 2_000_000 });
    for (const typo of ['1,2,3', '20,00', '2,000 000', ',000', '2,000,', '1,0000']) {
      expect(parseLimitInput(typo).ok).toBe(false);
    }
  });

  it('says days plainly, and nothing when it cannot', () => {
    expect(describeDays(null)).toBeNull();
    expect(describeDays(1)).toBe('within today');
    expect(describeDays(3)).toBe('about 3 days');
  });
});

describe('what a limit save released (A1)', () => {
  const release = (over: Partial<TokenLimitRelease> = {}): TokenLimitRelease => ({
    releasedOrganizations: [],
    stillPaused: [],
    promotedKbJobs: 0,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [],
    partialOrganizations: [],
    truncated: false,
    ...over,
  });

  it('a mine an earlier save already queued: said as queued, never "no parked KB work"', () => {
    const said = describeRelease(release({ releasedOrganizations: [3], minesAlreadyQueued: 1 }));
    expect(said).toEqual({
      tone: 'success',
      text: 'The KB limit no longer pauses 1 workspace. 1 paused mine already queued to continue.',
    });
    const both = describeRelease(
      release({ releasedOrganizations: [3], promotedKbJobs: 2, minesAlreadyQueued: 2 })
    );
    expect(both?.text).toBe(
      'The KB limit no longer pauses 1 workspace. 2 parked conversations queued to continue; 2 paused mines already queued to continue.'
    );
  });

  it('work the backend could not queue: says it waits for the reset, warning tone', () => {
    const said = describeRelease(release({ releasedOrganizations: [3], failedToQueue: 2 }));
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(
      /^The KB limit no longer pauses 1 workspace\. Could not queue 2 paused mines — they resume after the reset at 00:00 UTC/
    );
    expect(said?.text).not.toContain('no parked KB work');
  });

  it('conversations queued for a workspace whose mine failed are said, not dropped or credited to released ones', () => {
    // Only failed workspaces: the BE still queued their parked conversations — and counts them in
    // promotedKbJobsInFailedOrganizations, NOT promotedKbJobs (BE tokenLimitRelease round 5).
    const onlyFailed = describeRelease(
      release({
        failedOrganizations: [5],
        failedToQueue: 1,
        promotedKbJobsInFailedOrganizations: 3,
      })
    );
    expect(onlyFailed?.tone).toBe('warning');
    expect(onlyFailed?.text).toMatch(
      /^3 parked conversations \(all in the workspace whose mine could not be queued\) queued to continue\. Could not queue 1 paused mine in 1 workspace — it resumes after the reset at 00:00 UTC/
    );
    expect(onlyFailed?.text).not.toContain('no longer pauses');
    // Audit pass 8: a released workspace with NOTHING queued beside a failed one — the failed
    // workspace's conversations are never left to read as the released one's work.
    const releasedEmpty = describeRelease(
      release({
        releasedOrganizations: [3],
        failedOrganizations: [5],
        failedToQueue: 1,
        promotedKbJobsInFailedOrganizations: 1,
      })
    );
    expect(releasedEmpty?.text).toMatch(
      /^The KB limit no longer pauses 1 workspace\. 1 parked conversation \(in the workspace whose mine could not be queued\) queued to continue\./
    );
    // Mixed: the total is never stated as the released workspace's work.
    const mixed = describeRelease(
      release({
        releasedOrganizations: [3],
        failedOrganizations: [5, 6],
        failedToQueue: 2,
        promotedKbJobs: 1,
        promotedKbJobsInFailedOrganizations: 3,
      })
    );
    expect(mixed?.text).toMatch(
      /^The KB limit no longer pauses 1 workspace\. 4 parked conversations \(3 of them in workspaces whose mines could not be queued\) queued to continue\. Could not queue 2 paused mines in 2 workspaces — they resume/
    );
    expect(mixed?.text).not.toMatch(/pauses 1 workspace:/);
    expect(mixed?.text).not.toContain('KB job');
  });

  // Round 6: the exact shapes the BE sends (be-toklim-wt tokenLimitRelease.test.ts), end to end.
  const beFailedOrg = {
    releasedOrganizations: [37],
    stillPaused: [],
    promotedKbJobs: 1,
    promotedKbJobsInFailedOrganizations: 2,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 1,
    failedOrganizations: [36],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [],
    partialOrganizations: [],
    truncated: false,
  };
  const beNoticeOnly = {
    releasedOrganizations: [],
    stillPaused: [],
    promotedKbJobs: 0,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [36],
    unreachableOrganizations: [],
    partialOrganizations: [],
    truncated: false,
  };

  it('round 6: conversations queued in a FAILED workspace are read and said (BE response shape)', () => {
    expect(normaliseRelease(beFailedOrg)).toEqual(beFailedOrg);
    const said = describeRelease(normaliseRelease(beFailedOrg));
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(
      /^The KB limit no longer pauses 1 workspace\. 3 parked conversations \(2 of them in the workspace whose mine could not be queued\) queued to continue\. Could not queue 1 paused mine in 1 workspace — it resumes/
    );
    // Only the failed workspace had parked conversations: all of them are said.
    const onlyFailed = describeRelease(
      normaliseRelease({ ...beFailedOrg, releasedOrganizations: [], promotedKbJobs: 0 })
    );
    expect(onlyFailed?.text).toMatch(
      /^2 parked conversations \(all in the workspace whose mine could not be queued\) queued to continue\. Could not queue/
    );
  });

  it('round 6: notice-only workspaces are said — never "nothing needed releasing" (BE response shape)', () => {
    const said = describeRelease(normaliseRelease(beNoticeOnly));
    expect(said).toEqual({
      tone: 'success',
      text: 'The KB limit no longer pauses 1 workspace with no parked KB work; its notice was updated.',
    });
    expect(describeRelease(release({ noticeOnlyOrganizations: [3, 4] }))?.text).toBe(
      'The KB limit no longer pauses 2 workspaces with no parked KB work; their notices were updated.'
    );
    // Beside released work it follows the released workspaces' own sentences.
    expect(
      describeRelease(
        release({ releasedOrganizations: [5], promotedKbJobs: 2, noticeOnlyOrganizations: [3] })
      )?.text
    ).toBe(
      'The KB limit no longer pauses 1 workspace. 2 parked conversations queued to continue. The KB limit no longer pauses 1 workspace with no parked KB work; its notice was updated.'
    );
  });

  it('reads failedOrganizations, and tolerates its absence', () => {
    expect(normaliseRelease({ failedToQueue: 1, failedOrganizations: [5, 'x'] })).toEqual(
      release({ failedToQueue: 1, failedOrganizations: [5] })
    );
    expect(normaliseRelease({ failedToQueue: 1 })).toEqual(release({ failedToQueue: 1 }));
  });

  it('reads minesAlreadyQueued and failedToQueue, and tolerates their absence', () => {
    expect(
      normaliseRelease({ releasedOrganizations: [3], minesAlreadyQueued: 2, failedToQueue: 1 })
    ).toEqual(release({ releasedOrganizations: [3], minesAlreadyQueued: 2, failedToQueue: 1 }));
    expect(normaliseRelease({ releasedOrganizations: [3], minesAlreadyQueued: 'x' })).toEqual(
      release({ releasedOrganizations: [3] })
    );
  });

  it('released work: counts, success tone', () => {
    expect(
      describeRelease(
        release({ releasedOrganizations: [3, 4], promotedKbJobs: 12, resumedMines: 1 })
      )
    ).toEqual({
      tone: 'success',
      text: 'The KB limit no longer pauses 2 workspaces. 12 parked conversations and 1 paused mine queued to continue.',
    });
  });

  it('released work is queued, never promised to "run now"', () => {
    const said = describeRelease(release({ releasedOrganizations: [3], promotedKbJobs: 2 }));
    expect(said?.text).not.toMatch(/run now/);
    expect(said?.text).toContain('2 parked conversations queued to continue');
    expect(said?.text).not.toContain('paused mine');
  });

  it('released with 0 and 0: says nothing was found to queue, never "0 … run"', () => {
    const said = describeRelease(release({ releasedOrganizations: [3] }));
    expect(said?.text).toBe(
      'The KB limit no longer pauses 1 workspace; no parked KB work was found to queue.'
    );
  });

  it('still paused: true for any limit that applies (own-key-off, lower override), not "the new limit"', () => {
    const one = describeRelease(release({ stillPaused: [7] }));
    expect(one?.tone).toBe('warning');
    expect(one?.text).toMatch(
      /^1 workspace stays paused — the KB limit that applies to it is still under today's KB spend, so its KB work resumes after the reset at 00:00 UTC/
    );
    expect(one?.text).not.toContain('new KB limit');
    expect(describeRelease(release({ stillPaused: [7, 8] }))?.text).toContain(
      'the KB limit that applies to them is still under'
    );
  });

  it('truncated: says some paused work may still wait until the reset', () => {
    const said = describeRelease(release({ releasedOrganizations: [3], truncated: true }));
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(
      /some paused KB work may still wait until 00:00 UTC \(\d\d:\d\d your time\)/
    );
  });

  it('nothing paused: says nothing needed releasing (never "released")', () => {
    expect(describeRelease(release())?.text).toBe(
      'No KB work was paused by the limit, so nothing needed releasing.'
    );
  });

  it('null (the edit did not lift the KB limit) adds nothing', () => {
    expect(describeRelease(null)).toBeNull();
  });

  it('normalises every shape: absent, null, error, partial', () => {
    expect(normaliseRelease(undefined)).toBeNull();
    expect(normaliseRelease(null)).toBeNull();
    expect(normaliseRelease({ error: 'x' })).toEqual({ error: 'x' });
    expect(normaliseRelease({ stillPaused: [5, 'bad'] })).toEqual(release({ stillPaused: [5] }));
  });
});

describe('R8: a workspace whose database could not be reached', () => {
  // be-toklim-wt 2b678d40 tokenLimitRelease.test "audit pass 8: an unreachable workspace …":
  // 36 unreachable, 35 and 37 released (one parked job promoted in each).
  const beUnreachable = {
    releasedOrganizations: [35, 37],
    stillPaused: [],
    promotedKbJobs: 2,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [36],
    truncated: false,
  };

  it('is named per workspace; the rest of the release is still said; warning tone', () => {
    const said = describeRelease(normaliseRelease(beUnreachable), 7_000_000);
    expect(said?.tone).toBe('warning');
    expect(said?.text).toContain('The KB limit no longer pauses 2 workspaces.');
    expect(said?.text).toContain('2 parked conversations queued to continue.');
    expect(said?.text).toContain(
      // BE round 13: also a workspace with nothing parked whose notice could not be updated.
      '1 workspace (#36) could not be reached or checked, or its notice could not be updated, so nothing was released there — any KB work paused there waits for the reset at'
    );
    expect(said?.text).not.toMatch(/could not be released/i);
    // Both editors send an unchanged KB value no more (pass 9), but a blank field sends what is
    // typed there (pass 12): the toast names both ways to retry.
    expect(said?.text).toMatch(
      /Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 \(no limit\), into a blank KB field\.$/
    );
  });

  // FE audit pass 14, NIT: the plural form was untested.
  it('two workspaces: "their notices", never "its notice"', () => {
    const said = describeRelease(
      normaliseRelease({ ...beUnreachable, unreachableOrganizations: [36, 41] }),
      7_000_000
    );
    expect(said?.text).toContain(
      '2 workspaces (#36, #41) could not be reached or checked, or their notices could not be updated, so nothing was released there'
    );
    expect(said?.text).not.toContain('its notice');
  });

  it('alone, it is not "nothing needed releasing"', () => {
    const said = describeRelease(
      normaliseRelease({ ...beUnreachable, releasedOrganizations: [], promotedKbJobs: 0 })
    );
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(/^1 workspace \(#36\) could not be reached or checked/);
    expect(said?.text).not.toContain('nothing needed releasing');
  });
});

describe('R9: a workspace whose limit state could not be READ is listed as unreachable', () => {
  // be-toklim-wt 3d0b965e tokenLimitRelease.test "audit pass 9: a workspace whose limit state
  // cannot be READ is unreachable": 36's check throws, 35 released (one parked job promoted).
  const beUnread = {
    releasedOrganizations: [35],
    stillPaused: [],
    promotedKbJobs: 1,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [36],
    truncated: false,
  };

  it('is not called a database outage — "reached or checked" holds for both causes', () => {
    const said = describeRelease(normaliseRelease(beUnread));
    expect(said?.tone).toBe('warning');
    expect(said?.text).toContain('1 workspace (#36) could not be reached or checked');
    expect(said?.text).not.toMatch(/database/i);
    expect(said?.text).toContain('The KB limit no longer pauses 1 workspace.');
  });
});

describe('pass 10: the retry advice is true for the KB limit the save left in force', () => {
  // be-toklim-wt 64d8d228 platformSettingsController: keepsKbLimitLifted re-runs the release for a
  // re-sent value at least the one in force when that is not 0, or for a re-sent 0 at any limit —
  // from a 0 (no limit) only 0 re-runs it (FE audit pass 12, NIT: this said "no number").
  const unreachable = normaliseRelease({
    releasedOrganizations: [],
    stillPaused: [],
    promotedKbJobs: 0,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [36],
    truncated: false,
  });

  // be-toklim-wt 64d8d228 keepsKbLimitLifted: the backend DOES re-run the release for a re-sent 0,
  // and a blank KB field sends what is typed there — so typing 0 there retries (pass 12, NIT);
  // only a 0 already saved there waits for the reset.
  it('a KB limit of 0: never "raising it does", and typing 0 into a blank field is named (pass 12)', () => {
    for (const said of [
      describeRelease(unreachable, 0),
      describeRelease({ error: 'Saved, but paused KB work could not be released.' }, 0),
    ]) {
      expect(said?.text).not.toContain('raising it does');
      expect(said?.text).not.toContain('from this page does not retry');
      expect(said?.text).toMatch(
        /The KB limit is now off \(0\), so there is no higher limit to raise it to, and saving it unchanged does not retry this\. If the KB field is blank, typing 0 into it does; otherwise this work waits for the reset at .+\.$/
      );
    }
  });

  it('a limit not known here (the card cleared its setting; the field opens blank) names typing 0 for a 0', () => {
    expect(describeRelease(unreachable)?.text).toMatch(
      /into a blank KB field\. If the limit now in force is 0 \(no limit\), nothing is higher: only typing 0 retries it\.$/
    );
  });

  it('CONTROL: a KB limit above 0 keeps the plain advice', () => {
    expect(describeRelease(unreachable, 1)?.text).toMatch(
      /Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 \(no limit\), into a blank KB field\.$/
    );
  });
});

/**
 * BE fix round 22 (C1): `partialOrganizations` — workspaces whose KB notice the release marked
 * partial (a promote that failed, or a cut scan). Shapes as the final tokenLimitRelease writes them:
 * a failed promote leaves the workspace in `releasedOrganizations` with nothing promoted; a
 * notice-only workspace whose scan was cut is in no other list, beside `truncated`.
 */
describe('C1: a release the backend marked partial', () => {
  const be = (over: Record<string, unknown>) => ({
    releasedOrganizations: [],
    stillPaused: [],
    promotedKbJobs: 0,
    promotedKbJobsInFailedOrganizations: 0,
    resumedMines: 0,
    minesAlreadyQueued: 0,
    failedToQueue: 0,
    failedOrganizations: [],
    noticeOnlyOrganizations: [],
    unreachableOrganizations: [],
    partialOrganizations: [],
    truncated: false,
    ...over,
  });
  const PARTIAL =
    /In 1 workspace \(#35\) some paused KB work may still wait until the reset at 00:00 UTC \(\d\d:\d\d your time\): not all of it could be found or released at once\./;

  it('a promote that failed: warning, the partial line and how to retry — never "no parked KB work was found"', () => {
    const said = describeRelease(
      normaliseRelease(be({ releasedOrganizations: [35], partialOrganizations: [35] })),
      7_000_000
    );
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(
      /^The KB limit no longer pauses 1 workspace\. In 1 workspace \(#35\)/
    );
    expect(said?.text).toMatch(PARTIAL);
    expect(said?.text).not.toContain('no parked KB work was found');
    expect(said?.text).toMatch(
      /Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 \(no limit\), into a blank KB field\.$/
    );
  });

  it('a notice-only workspace whose scan was cut (in no other list): warning, never "nothing needed releasing"', () => {
    const said = describeRelease(
      normaliseRelease(be({ partialOrganizations: [35], truncated: true })),
      7_000_000
    );
    expect(said?.tone).toBe('warning');
    expect(said?.text).toMatch(PARTIAL);
    expect(said?.text).not.toContain('nothing needed releasing');
  });

  it('CONTROL: a full release (partialOrganizations []) keeps the success line', () => {
    expect(
      describeRelease(normaliseRelease(be({ releasedOrganizations: [35], promotedKbJobs: 2 })))
    ).toEqual({
      tone: 'success',
      text: 'The KB limit no longer pauses 1 workspace. 2 parked conversations queued to continue.',
    });
  });

  it('the field absent is read as []', () => {
    const { partialOrganizations: _absent, ...without } = be({ releasedOrganizations: [35] });
    const read = normaliseRelease(without);
    expect(read && 'partialOrganizations' in read && read.partialOrganizations).toEqual([]);
  });
});
