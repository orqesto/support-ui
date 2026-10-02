/**
 * A limit save's response body, read by the service itself — the console tests mock the service
 * and hand the toast a ready-made value, so this is the one place the HTTP body is read (FE audit
 * pass 8: the release-toast fixtures skipped the body entirely).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let body: unknown = undefined;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: () => Promise.resolve({ data: body }),
    patch: () => Promise.resolve({ data: body }),
  },
}));

const { managedAiUsageService } = await import('@/services/managedAiUsage.service');
const { describeRelease, describeSave } = await import('@/pages/console/tokenLimits.helpers');

beforeEach(() => {
  body = undefined;
});

// The regular-limit sentences carry the next reset; pinned so they can be compared whole.
vi.mock('@/lib/utcClock', () => ({ describeNextReset: () => '00:00 UTC (03:00 your time)' }));

describe('a limit save, read from the response body', () => {
  it.each([
    ['an empty body', undefined],
    ['no data', {}],
    ['data without release or regularRelease', { data: {} }],
  ])(
    '%s (malformed — the final backend always sends both): nothing to add',
    async (_label, value) => {
      body = value;
      const outcome = await managedAiUsageService.updateWorkspaceLimits(7, { kbTokensPerDay: 1 });
      expect(outcome).toEqual({ release: null, regularRelease: null });
      expect(describeSave(outcome)).toBeNull();
      expect(await managedAiUsageService.updatePlatformLimits({ kbTokensPerDay: 1 })).toEqual({
        release: null,
        regularRelease: null,
      });
    }
  );

  // BE fix round 22 (C1): `partialOrganizations`, read off the HTTP body by the service itself.
  it('C1: partialOrganizations in the body makes the save toast a warning; absent it is []', async () => {
    const release = {
      releasedOrganizations: [5],
      stillPaused: [],
      promotedKbJobs: 0,
      promotedKbJobsInFailedOrganizations: 0,
      resumedMines: 0,
      minesAlreadyQueued: 0,
      failedToQueue: 0,
      failedOrganizations: [],
      noticeOnlyOrganizations: [],
      unreachableOrganizations: [],
      partialOrganizations: [5],
      truncated: false,
    };
    body = { data: { release, regularRelease: null } };
    const partial = await managedAiUsageService.updatePlatformLimits({ kbTokensPerDay: 9_000_000 });
    expect(describeSave(partial, 9_000_000)).toMatchObject({ tone: 'warning' });
    expect(describeSave(partial, 9_000_000)?.text).toContain(
      'In 1 workspace (#5) some paused KB work may still wait until the reset at 00:00 UTC (03:00 your time): not all of it could be found or released at once.'
    );
    const { partialOrganizations: _absent, ...without } = release;
    body = { data: { release: without, regularRelease: null } };
    const absent = await managedAiUsageService.updatePlatformLimits({ kbTokensPerDay: 9_000_000 });
    expect(absent.release && 'partialOrganizations' in absent.release).toBe(true);
    expect(
      absent.release &&
        'partialOrganizations' in absent.release &&
        absent.release.partialOrganizations
    ).toEqual([]);
    // CONTROL: absent ⇒ a released workspace with nothing found, said as success.
    expect(describeSave(absent, 9_000_000)?.tone).toBe('success');
  });

  it('release null (the edit did not lift the KB limit): nothing to add', async () => {
    body = { data: { release: null, regularRelease: null } };
    const outcome = await managedAiUsageService.updateWorkspaceLimits(7, { kbTokensPerDay: 1 });
    expect(outcome.release).toBeNull();
    expect(describeSave(outcome)).toBeNull();
  });

  it("the backend's own release error is passed on as a warning", async () => {
    body = { data: { release: { error: 'Paused KB work could not be released now.' } } };
    const { release } = await managedAiUsageService.updateWorkspaceLimits(7, { kbTokensPerDay: 1 });
    // The KB limit the save left in force (1) picks the retry advice (pass 10).
    expect(describeRelease(release, 1)).toEqual({
      tone: 'warning',
      text: 'Paused KB work could not be released now. Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 (no limit), into a blank KB field.',
    });
  });
});

// be-toklim-wt b046e2f9 platformSettingsController regularReleaseForEdit + tokenLimitRegularRelease:
// null | {error} | {releasedOrganizations, stillStopped, unreachableOrganizations, truncated}.
describe('regularRelease (BE round 12), read from the response body', () => {
  // FE audit pass 13: neither surface re-sends an unchanged regular value, so the advice names
  // what does re-check — a raise, or a value typed into a blank field — as the KB advice does.
  const LAG =
    'may keep saying AI work is stopped until a later save checks it again — raising the regular limit, or typing the limit now in force, or 0 (no limit), into a blank regular field; saving it unchanged does not — or the reset at 00:00 UTC (03:00 your time)';

  it('released workspaces: success, in regular words only', async () => {
    body = {
      data: {
        release: null,
        regularRelease: {
          releasedOrganizations: [4, 9],
          stillStopped: [],
          unreachableOrganizations: [],
          truncated: false,
        },
      },
    };
    const outcome = await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 0 });
    const said = describeSave(outcome);
    expect(said).toEqual({
      tone: 'success',
      text: 'The regular limit no longer stops 2 workspaces: AI drafts, auto-replies and widget answers run there for new mail.',
    });
    expect(said?.text).not.toMatch(/KB|knowledge|min(e|ing)|pause/i);
  });

  it('a lift that found no enforced notice: nothing to add', async () => {
    body = {
      data: {
        regularRelease: {
          releasedOrganizations: [],
          stillStopped: [],
          unreachableOrganizations: [],
          truncated: false,
        },
      },
    };
    expect(
      describeSave(await managedAiUsageService.updateWorkspaceLimits(7, { regularTokensPerDay: 9 }))
    ).toBeNull();
  });

  it('still stopped, not checked, truncated: one warning naming each', async () => {
    body = {
      data: {
        regularRelease: {
          releasedOrganizations: [1],
          stillStopped: [2],
          unreachableOrganizations: [3, 5],
          truncated: true,
        },
      },
    };
    const said = describeSave(
      await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 9 })
    );
    expect(said).toEqual({
      tone: 'warning',
      text: [
        'The regular limit no longer stops 1 workspace: AI drafts, auto-replies and widget answers run there for new mail.',
        "1 workspace stays stopped — the regular limit that applies to it is still under today's regular spend, so AI drafts, auto-replies and widget answers there wait for the reset at 00:00 UTC (03:00 your time).",
        // BE round 13: the list also holds workspaces whose notice MARK failed — said too.
        `2 workspaces (#3, #5) could not be checked, or their regular-limit notices could not be updated; they were left as they were and ${LAG.replace('checks it', 'checks them')}.`,
        `Not every regular-limit notice could be checked; any left ${LAG.replace('checks it', 'checks them')}.`,
      ].join(' '),
    });
    expect(said?.text).not.toMatch(/KB|knowledge|min(e|ing)|pause/i);
  });

  it('one workspace not checked or not updated (BE round 13 failed mark): singular words', async () => {
    body = {
      data: {
        regularRelease: {
          releasedOrganizations: [],
          stillStopped: [],
          unreachableOrganizations: [3],
          truncated: false,
        },
      },
    };
    const said = describeSave(
      await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 9 })
    );
    expect(said?.text).toBe(
      `1 workspace (#3) could not be checked, or its regular-limit notice could not be updated; it was left as it was and ${LAG}.`
    );
  });

  it.each([
    ['stillStopped', { stillStopped: [2] }],
    ['unreachableOrganizations', { unreachableOrganizations: [3] }],
    ['truncated', { truncated: true }],
  ])('%s alone tones the toast as a warning', async (_label, over) => {
    body = {
      data: {
        regularRelease: {
          releasedOrganizations: [1],
          stillStopped: [],
          unreachableOrganizations: [],
          truncated: false,
          ...over,
        },
      },
    };
    const said = describeSave(
      await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 9 })
    );
    expect(said?.tone).toBe('warning');
  });

  it("the backend's error: a warning that the notice, not the work, lags", async () => {
    body = {
      data: {
        regularRelease: {
          error: 'The regular-limit notices could not be updated now; they clear at 00:00 UTC.',
        },
      },
    };
    expect(
      describeSave(await managedAiUsageService.updateWorkspaceLimits(7, { regularTokensPerDay: 0 }))
    ).toEqual({
      tone: 'warning',
      text: `The regular-limit notices could not be updated now; they clear at 00:00 UTC. New AI work follows the saved limit; only the regular-limit notice ${LAG}.`,
    });
  });

  // FE audit pass 14, LOW: a regular limit of 0 cannot be raised and opens prefilled "0", so the
  // advice must not tell the operator to raise it (parity with retryAdvice for KB).
  it('an unreachable workspace after a save of regular 0: no "raise it" advice', async () => {
    body = {
      data: {
        release: null,
        regularRelease: {
          releasedOrganizations: [],
          stillStopped: [],
          unreachableOrganizations: [3],
          truncated: false,
        },
      },
    };
    const outcome = await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 0 });
    expect(describeSave(outcome, 1_000, 0)).toEqual({
      tone: 'warning',
      text: '1 workspace (#3) could not be checked, or its regular-limit notice could not be updated; it was left as it was and may keep saying AI work is stopped until a later save checks it again — the regular limit is now off (0), so there is no higher limit to raise it to, and saving it unchanged does not; if the regular field is blank, typing 0 into it does — or the reset at 00:00 UTC (03:00 your time).',
    });
    // Control: a non-zero regular limit keeps the raise advice.
    expect(describeSave(outcome, 1_000, 5)?.text).toContain(LAG);
    expect(describeSave(outcome, 1_000, 0)?.text).not.toMatch(/raising the regular limit/);
  });

  // FE audit pass 15, NIT: the plural paths rewrite only the first "checks it"; the 0-branch must
  // not carry a second, singular "check it" into a sentence about several workspaces' notices.
  it('two unreachable workspaces, and a truncated scan, after a save of regular 0: no singular "it" left', async () => {
    body = {
      data: {
        release: null,
        regularRelease: {
          releasedOrganizations: [],
          stillStopped: [],
          unreachableOrganizations: [3, 5],
          truncated: true,
        },
      },
    };
    const outcome = await managedAiUsageService.updatePlatformLimits({ regularTokensPerDay: 0 });
    const text = describeSave(outcome, 1_000, 0)?.text ?? '';
    expect(text).toContain(
      '2 workspaces (#3, #5) could not be checked, or their regular-limit notices could not be updated; they were left as they were and may keep saying AI work is stopped until a later save checks them again — the regular limit is now off (0), so there is no higher limit to raise it to, and saving it unchanged does not; if the regular field is blank, typing 0 into it does — or the reset at 00:00 UTC'
    );
    expect(text).toContain(
      'Not every regular-limit notice could be checked; any left may keep saying AI work is stopped until a later save checks them again'
    );
    expect(text).not.toMatch(/check(s)? it\b/);
  });

  it('with a KB release in the same save: KB first, then regular; the worst outcome tones it', async () => {
    body = {
      data: {
        release: {
          releasedOrganizations: [4],
          stillPaused: [],
          promotedKbJobs: 2,
          resumedMines: 0,
          failedToQueue: 0,
          truncated: false,
        },
        regularRelease: {
          releasedOrganizations: [],
          stillStopped: [4],
          unreachableOrganizations: [],
          truncated: false,
        },
      },
    };
    const outcome = await managedAiUsageService.updateWorkspaceLimits(4, {
      kbTokensPerDay: 0,
      regularTokensPerDay: 9,
    });
    const said = describeSave(outcome, 0);
    expect(said?.tone).toBe('warning');
    const kb = describeRelease(outcome.release, 0);
    expect(kb?.tone).toBe('success');
    expect(said?.text.startsWith(`${kb?.text} 1 workspace stays stopped`)).toBe(true);
  });
});
