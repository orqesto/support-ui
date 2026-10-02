/**
 * A mine the daily KB token limit paused ends its socket session with `kb:completed` carrying
 * `paused: true` (backend B9). That is not a completion: the session must keep its progress and
 * say when it resumes — never 100% / "complete" over conversations that were not mined.
 */
import { describe, expect, it } from 'vitest';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { makeKBHandlers } from '@/hooks/useEmailProcessingKBHandlers';

const run = (events: Array<['progress' | 'completed', unknown]>) => {
  let sessions = new Map<string, ProcessingSession>();
  const handlers = makeKBHandlers({
    setSessions: (update) => {
      sessions = typeof update === 'function' ? update(sessions) : update;
    },
  });
  for (const [kind, data] of events) {
    if (kind === 'progress') handlers.handleKBProgress(data);
    else handlers.handleKBCompleted(data);
  }
  return sessions.get('9');
};

const messages = (processed: number) => ({
  total: 100,
  processed,
  successful: processed,
  failed: 0,
  skipped: 0,
});
const progress = {
  messageSourceId: 9,
  organizationId: 4,
  status: 'processing',
  messageSourceName: 'inbox',
  messages: messages(40),
};
const paused = {
  messageSourceId: 9,
  organizationId: 4,
  status: 'completed',
  messageSourceName: 'inbox',
  messages: messages(40),
  // The real backend shape (R2 contract, BE 89785ae0): `forced` too, so an older FE shows an
  // error rather than "complete" — this FE must read `paused` first.
  forced: true,
  paused: true,
  reason: 'kb_token_limit',
  resumesAt: '2026-10-01T00:00:00.000Z',
};

describe('kb:completed paused at the daily KB limit', () => {
  it('keeps the progress and the resume time; not complete, not 100%', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
    ]);
    expect(session?.status).toBe('idle');
    expect(session?.status).not.toBe('error');
    expect(session?.progress).toBe(0);
    expect(session?.isProcessing).toBe(false);
    expect(typeof session?.updatedAt).toBe('number');
    expect(session?.kbMessagesProcessed).toBe(40);
    expect(session?.kbPausedUntil).toBe('2026-10-01T00:00:00.000Z');
  });

  it('with no session yet: a paused one, not a completed one', () => {
    const session = run([['completed', paused]]);
    expect(session?.status).toBe('idle');
    expect(session?.status).not.toBe('error');
    // Stamped by the pause itself — the reaper reads it as the session's last event.
    expect(typeof session?.updatedAt).toBe('number');
    expect(session?.progress).toBe(40);
    expect(session?.kbPausedUntil).toBe('2026-10-01T00:00:00.000Z');
  });

  // Any kb:progress hides the pause while the session moves again — after the reset AND on a
  // reopen before it (be R11 B(a)); a paused kb:completed then sets it again (next test).
  it('progress (after the reset, or a reopen before it) hides the pause while the session moves', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
      ['progress', { ...progress, messages: messages(55) }],
    ]);
    expect(session?.kbPausedUntil).toBeUndefined();
    expect(session?.isProcessing).toBe(true);
  });

  it('a session reopened before its reset that ends paused again shows the pause again (R11 B(a))', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
      ['progress', { ...progress, messages: messages(55) }],
      ['completed', paused],
    ]);
    expect(session?.kbPausedUntil).toBe('2026-10-01T00:00:00.000Z');
  });

  // be-toklim-wt 3d0b965e kbProgressParkedJobs.test: an import/job session that ends with jobs
  // PARKED by the limit now ends with the same paused fields, and `messages.total` leaves the parked
  // jobs out — so processed === total. Still paused, never complete.
  it('a job session ending with parked jobs (total excludes them): paused, not complete', () => {
    const parked = {
      ...paused,
      resumesAt: '2026-10-02T00:00:00.000Z',
      message:
        "Paused: today's AI limit for KB processing was reached (1 processed); the rest resumes from 00:00 UTC",
      messages: { total: 1, processed: 1, successful: 1, failed: 0, skipped: 0 },
    };
    const session = run([
      ['progress', { ...progress, messages: { ...messages(1), total: 2 } }],
      ['completed', parked],
    ]);
    expect(session?.status).toBe('idle');
    expect(session?.isProcessing).toBe(false);
    expect(session?.kbPausedUntil).toBe('2026-10-02T00:00:00.000Z');
    // processed === total (1 of 1) is the one case that could read 100%: a session that existed
    // keeps its own progress (0 here: a KB session's import progress), never 100 (pass 18, NIT).
    expect(session?.progress).toBe(0);
    expect(session?.kbMessagesProcessed).toBe(1);
  });

  // FE audit pass 20, NIT: a standalone KB session's own progress is processed / total, and its
  // last kb:progress before the pause can be 100 (the parked jobs are not in the total).
  it('a session whose last progress read 100: paused at 0, never 100; CONTROL 40 stays 40', () => {
    const full = run([
      ['progress', progress],
      ['progress', { ...progress, messages: messages(100) }],
    ]);
    expect(full?.progress).toBe(100);
    const session = run([
      ['progress', progress],
      ['progress', { ...progress, messages: messages(100) }],
      ['completed', { ...paused, messages: messages(100) }],
    ]);
    expect(session?.progress).toBe(0);
    const partial = run([
      ['progress', progress],
      ['progress', { ...progress, messages: messages(40) }],
      ['completed', paused],
    ]);
    expect(partial?.progress).toBe(40);
  });

  // The same pause with no session before it (the tab opened mid-mine): the session is made from
  // the event, and 1 of 1 parked computed 100 there (FE audit pass 19, NIT).
  it('the same pause with no session before it: progress 0, not 100; CONTROL 1 of 2: 50', () => {
    const parked = {
      ...paused,
      resumesAt: '2026-10-02T00:00:00.000Z',
      messages: { total: 1, processed: 1, successful: 1, failed: 0, skipped: 0 },
    };
    const session = run([['completed', parked]]);
    expect(session?.kbPausedUntil).toBe('2026-10-02T00:00:00.000Z');
    expect(session?.progress).toBe(0);
    const half = run([['completed', { ...parked, messages: { ...parked.messages, total: 2 } }]]);
    expect(half?.progress).toBe(50);
  });

  it('CONTROL: an ordinary completion is still complete at 100%', () => {
    const { paused: _paused, resumesAt: _at, reason: _reason, forced: _forced, ...done } = paused;
    const session = run([
      ['progress', progress],
      ['completed', { ...done, messages: messages(100) }],
    ]);
    expect(session?.status).toBe('complete');
    expect(session?.progress).toBe(100);
  });

  // be-toklim-wt b046e2f9 kbProgressTracker: cancelIdleKBProcessing (reason 'no-kb-messages')
  // spreads pausedCompletionFields over its own reason when parked jobs still wait (R12 B(a)), and
  // forceCompleteKBProcessing keeps forced + its reason ('timeout' | 'manual') and adds paused +
  // resumesAt (R12 B(b)). The pause is read from `paused`, never from `reason`.
  const RESUMES = '2026-10-02T00:00:00.000Z';
  const summary = {
    messageSourceId: 9,
    organizationId: 4,
    status: 'completed',
    messageSourceName: 'inbox',
    messages: messages(40),
  };

  // Real shapes (FE audit pass 13, NITs): cancelIdleKBProcessing refuses a session with any
  // processed message and settleKBRunTotal first sets total = processed, so its event carries
  // `status:'completed'`, total 0 / processed 0; forceCompleteKBProcessing sets `status:'failed'`.
  const nothing = { ...messages(0), total: 0 };
  it.each([
    [
      'an idle-cancelled reopened session (R12 B(a))',
      {
        status: 'completed',
        messages: nothing,
        reason: 'kb_token_limit',
        forced: true,
        paused: true,
        resumesAt: RESUMES,
      },
      undefined,
    ],
    [
      'a timed-out session (R12 B(b))',
      { status: 'failed', forced: true, reason: 'timeout', paused: true, resumesAt: RESUMES },
      'timeout',
    ],
    [
      'a manually stopped session (R12 B(b))',
      { status: 'failed', forced: true, reason: 'manual', paused: true, resumesAt: RESUMES },
      'manual',
    ],
  ])(
    '%s with parked jobs: paused until the reset, not complete or failed',
    (_label, end, early) => {
      const session = run([
        ['progress', progress],
        ['completed', paused],
        ['progress', progress],
        ['completed', { ...summary, ...end }],
      ]);
      expect(session?.status).toBe('idle');
      expect(session?.isProcessing).toBe(false);
      expect(session?.progress).toBe(40);
      expect(session?.kbPausedUntil).toBe(RESUMES);
      expect(session?.kbMessagesProcessed).toBe('messages' in end ? end.messages.processed : 40);
      // A force-end is said as one (FE pass 13, LOW): its total − processed is not parked work.
      expect(session?.kbPauseStoppedEarly).toBe(early);
    }
  );

  it('a force-end after a limit pause, then the limit pause again: the force-end mark goes', () => {
    const session = run([
      ['progress', progress],
      [
        'completed',
        {
          ...summary,
          status: 'failed',
          forced: true,
          reason: 'timeout',
          paused: true,
          resumesAt: RESUMES,
        },
      ],
      // No kb:progress between (fe:tests pass 14, NIT): one would clear the mark itself. Reachable
      // — an idle-cancel takeover can emit its paused kb:completed before its 100 ms kb:progress.
      ['completed', paused],
    ]);
    expect(session?.kbPausedUntil).toBe(paused.resumesAt);
    expect(session?.kbPauseStoppedEarly).toBeUndefined();
  });

  // be-toklim-r8b d5777df6 (BE round 13, area B): a session ending paused leaves its parked state
  // per source until the reset (carriedPauses); a session opened ANY time later that day takes it
  // over and ends paused too — `{forced, paused, reason:'kb_token_limit', resumesAt}`, its own
  // counters (parked jobs left the total). Not only within 2 minutes as before.
  it.each([
    ['with the FE session still open from its kb:progress', true],
    ['with no FE session (a reload since the earlier pause)', false],
  ])('a later session taking over a carried pause ends paused %s', (_label, sawProgress) => {
    const later = {
      ...summary,
      messages: { ...messages(3), total: 3 },
      forced: true,
      paused: true,
      reason: 'kb_token_limit',
      resumesAt: RESUMES,
    };
    const session = run([
      ...(sawProgress
        ? ([
            ['completed', paused],
            ['progress', { ...progress, messages: { ...messages(3), total: 3 } }],
          ] as Array<['progress' | 'completed', unknown]>)
        : []),
      ['completed', later],
    ]);
    // Not "complete": idle and paused. (`progress` is 3 of 3 here — no KB surface renders it; the
    // panel's pause line says "3 messages processed", never "3 of 3".)
    expect(session?.status).toBe('idle');
    expect(session?.isProcessing).toBe(false);
    expect(session?.kbPausedUntil).toBe(RESUMES);
    expect(session?.kbMessagesProcessed).toBe(3);
    expect(session?.kbPauseStoppedEarly).toBeUndefined();
  });

  // be-toklim-wt 0d61a3e0 kbCarriedPauses `emitCarriedPauseLifted` (BE R15): a limit release (or
  // the last parked job dropped) lifts a carried pause with a `kb:progress` of `status:'completed'`
  // and the ENDED session's counters (summarizeProgress) — no `paused`, no `resumesAt` (FE audit
  // pass 16, NIT: no FE test read this shape).
  const lifted = {
    ...summary,
    status: 'completed',
    progress: 40,
    totalFinalized: true,
    messages: { ...messages(40), total: 40 },
    message: 'Done',
  };
  it('a carried pause lifted (kb:progress, status completed): the pause goes, not processing', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
      ['progress', lifted],
    ]);
    expect(session?.kbPausedUntil).toBeUndefined();
    expect(session?.kbPauseStoppedEarly).toBeUndefined();
    expect(session?.isProcessing).toBe(false);
    expect(session?.kbMessagesProcessed).toBe(40);
  });

  // be-toklim-wt 44f0f921 (BE R16, kb-progress LOW-2): the lifted kb:progress carries the ENDED
  // session's own status — `failed` for a forced end or one with failed messages, not always
  // `completed`. The pause goes; nothing calls the session processing, and the failed count is
  // kept for what reads it. `handleKBProgress` writes no `status`: it stays the paused handler's
  // `idle` whatever the BE status was (pass 17 tests NIT-3 — `not.toBe('complete')` held for any).
  it('a carried pause lifted from a FAILED session (status failed): no pause, not processing, status left idle', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
      [
        'progress',
        {
          ...lifted,
          status: 'failed',
          messages: { ...messages(40), total: 40, successful: 37, failed: 3 },
        },
      ],
    ]);
    expect(session?.kbPausedUntil).toBeUndefined();
    expect(session?.isProcessing).toBe(false);
    expect(session?.status).toBe('idle');
    expect(session?.kbMessagesFailed).toBe(3);
  });

  it('a carried pause lifted with no FE session (a reload since): no session is made', () => {
    expect(run([['progress', lifted]])).toBeUndefined();
    expect(run([['progress', { ...lifted, status: 'failed' }]])).toBeUndefined();
  });

  it('CONTROL: a forced end with nothing parked (no paused) is an error, with no pause', () => {
    const session = run([
      ['progress', progress],
      ['completed', { ...summary, status: 'failed', forced: true, reason: 'timeout' }],
    ]);
    expect(session?.status).toBe('error');
    expect(session?.kbPausedUntil).toBeUndefined();
  });

  // The reopen's kb:progress clears the pause here, not the plain end (renamed, FE pass 13 NIT).
  it('CONTROL: reopened (kb:progress), then idle-cancelled with nothing parked (R12 B(c)): plain end, no pause', () => {
    const session = run([
      ['progress', progress],
      ['completed', paused],
      ['progress', progress],
      ['completed', { ...summary, messages: nothing, reason: 'no-kb-messages' }],
    ]);
    expect(session?.status).toBe('complete');
    expect(session?.kbPausedUntil).toBeUndefined();
  });

  // FE audit pass 13 NIT: with NO kb:progress between (the BE's reopen progress goes out on a
  // 100 ms timer, the idle cancel at once), the plain end itself must close the pause.
  it('paused, then a plain end with no kb:progress between: complete, with no stale pause', () => {
    const session = run([
      ['progress', progress],
      [
        'completed',
        {
          ...summary,
          status: 'failed',
          forced: true,
          reason: 'timeout',
          paused: true,
          resumesAt: RESUMES,
        },
      ],
      ['completed', { ...summary, messages: nothing, reason: 'no-kb-messages' }],
    ]);
    expect(session?.status).toBe('complete');
    expect(session?.kbPausedUntil).toBeUndefined();
    expect(session?.kbPauseStoppedEarly).toBeUndefined();
  });
});
