import { describe, expect, it } from 'vitest';
import type {
  KbLastSweep,
  KbRangeApplied,
  KbRangeCount,
  KbRangeEstimate,
  KbRangeRoom,
} from '@/services/integrations.service';
import {
  aiReasonWords,
  allowanceLine,
  applyAlert,
  confirmLabel,
  costLine,
  errorText,
  f4Caveat,
  historyLine,
  unverifiableLine,
  notComparedLine,
  KB_RANGE_LOADING,
  KB_RANGE_CANCEL,
  KB_RANGE_CURRENT_SUFFIX,
  introLine,
  kbFullHeldLine,
  kbFullHoldLine,
  lastSweepLine,
  narrowingLine,
  rangeLabel,
  recentLine,
  retryOwedWithheldLine,
  roomLines,
  runStoppedLine,
  sweepInProgressLine,
} from '../kbRangeCopy';

const CUTOFF = '2026-03-15T12:00:00.000Z';
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const count = (over: Partial<KbRangeCount> = {}): KbRangeCount => ({
  inRange: 1200,
  inOdly: 300,
  toFetch: 900,
  unverifiable: 0,
  notCompared: 0,
  capped: false,
  cappedBy: null,
  timedOut: false,
  approximate: false,
  from: null,
  to: null,
  ...over,
});
const estimate = (over: Partial<KbRangeEstimate> = {}): KbRangeEstimate => ({
  newThreads: 100,
  backlogThreads: 20,
  threadsToMine: 120,
  threadsBasis: 'distinct_threads',
  tokensPerThread: 2500,
  estimatedTokens: 300000,
  daysAtLimit: 1,
  limit: 500000,
  spentToday: 0,
  enforced: true,
  ...over,
});
const sweep = (over: Partial<KbLastSweep> = {}): KbLastSweep => ({
  state: 'complete',
  at: null,
  capSkipped: null,
  threadsWaiting: null,
  aiSkipped: null,
  aiReason: null,
  aiIncompleteSince: null,
  pausedUntil: null,
  ...over,
});
const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error('Request failed'), { status, data });

describe('kbRangeCopy', () => {
  it('estimate null reads "not measured", never 0 tokens', () => {
    expect(costLine(null, 'own_key', 0, count())).toBe(
      'Token cost: not measured yet on this workspace.'
    );
    expect(costLine(null, 'own_key', 0, count())).not.toMatch(/\b0 tokens/);
    // measured estimate with no tokens figure is the same state
    expect(
      costLine(estimate({ estimatedTokens: null, tokensPerThread: null }), 'managed', 0, count())
    ).toBe('Token cost: not measured yet on this workspace.');
  });

  it('cost sentence names the backlog, the per-thread figure and the limit days', () => {
    const cost = costLine(estimate(), 'own_key', 0, count());
    expect(cost).toContain('≈300,000 tokens for up to 120 conversations');
    expect(cost).toContain('100 with newly fetched mail + 20 already imported and not yet mined');
    expect(cost).toContain('2,500 per conversation, measured on this workspace');
    expect(cost).toContain("It fits in today's KB limit.");
    expect(costLine(estimate({ daysAtLimit: 4 }), 'own_key', 0, count())).toContain(
      'At your daily KB limit that is about 4 days; it pauses each day at the limit and resumes after the reset.'
    );
    expect(
      costLine(estimate({ daysAtLimit: 4, enforced: false }), 'own_key', 0, count())
    ).toContain(
      'That is about 4 days of your daily KB limit; your limits are only measured, so mining does not pause.'
    );
    expect(costLine(estimate({ daysAtLimit: null }), 'own_key', 0, count())).not.toMatch(
      /days|fits/
    );
  });

  it('upper bound prefix and recent-mail caveat', () => {
    expect(
      costLine(estimate({ threadsBasis: 'upper_bound_messages' }), 'own_key', 0, count())
    ).toMatch(/^Up to ≈300,000 tokens/);
    expect(costLine(estimate(), 'own_key', 7, count())).toContain(
      'Recent mail gets regular AI analysis, which is not in this estimate.'
    );
    expect(costLine(estimate(), 'own_key', 0, count())).not.toContain('Recent mail');
  });

  it('aiMode none has its own sentence; allowance says "without AI"', () => {
    expect(costLine(null, 'none', 0, count())).toBe(
      'This workspace has no AI provider, so mining uses rule-based extraction — no AI tokens.'
    );
    expect(costLine(estimate(), 'none', 0, count())).toMatch(/no AI provider/);
    const allowance = allowanceLine(
      { callsLeftThisMonth: 40, estimatedCalls: 130, short: true },
      false,
      'managed'
    );
    expect(allowance).toContain(
      'This read needs about 130 AI calls; your plan has 40 left this month. When they run out, mining continues without AI (rule-based).'
    );
    expect(allowance).toContain(
      'If AI is unavailable during the read, the affected conversations stay unmined and are retried automatically.'
    );
    expect(
      allowanceLine({ callsLeftThisMonth: 400, estimatedCalls: 130, short: false }, true, 'none')
    ).toBe("Today's KB limit is reached — mining starts after the reset.");
    expect(
      allowanceLine({ callsLeftThisMonth: null, estimatedCalls: null, short: false }, false, 'none')
    ).toBeNull();
  });

  it('history line: plain, approximate, capped, could-not-count, timed out', () => {
    expect(historyLine(count())).toBe(
      'Before the cutoff: 1,200 messages · 300 already in Odly · 900 to fetch'
    );
    expect(historyLine(count({ approximate: true }))).toBe(
      'Before the cutoff: about 1,200 messages · about 300 already in Odly · about 900 to fetch'
    );
    const capped = historyLine(count({ capped: true, cappedBy: 'size' }));
    expect(capped).toContain('at least 1,200 messages');
    expect(capped).toContain('at least 900 to fetch');
    expect(
      historyLine(count({ capped: true, cappedBy: 'time', inRange: 0, inOdly: 0, toFetch: 0 }))
    ).toBe('Before the cutoff: could not be counted in time.');
    expect(
      historyLine(count({ capped: true, cappedBy: 'quota', inRange: 0, inOdly: 0, toFetch: 0 }))
    ).toBe('Before the cutoff: could not be counted.');
    expect(historyLine(count({ timedOut: true, capped: true, cappedBy: 'time' }))).toMatch(
      / The count ran out of time, so these numbers cover only part of the range\.$/
    );
  });

  it('recent line: window, all-time, nothing missing, capped, uncounted', () => {
    expect(recentLine(null, 30, CUTOFF)).toBeNull();
    expect(recentLine(count({ toFetch: 12 }), 30, CUTOFF)).toBe(
      'Recent re-check (last 30 days): 12 not in Odly will be imported as regular mail.'
    );
    expect(recentLine(count({ toFetch: 0 }), 30, CUTOFF)).toBe(
      'Recent re-check (last 30 days): nothing missing.'
    );
    expect(recentLine(count({ capped: true, cappedBy: 'size', toFetch: 5000 }), 30, CUTOFF)).toBe(
      'Recent re-check (last 30 days): at least 5,000 not in Odly will be imported as regular mail.'
    );
    expect(
      recentLine(count({ capped: true, cappedBy: 'time', inRange: 0, toFetch: 0 }), 30, CUTOFF)
    ).toBe('Recent re-check (last 30 days): could not be counted.');
  });

  it('All Time never says "last 0 days"', () => {
    expect(rangeLabel(0, CUTOFF)).toBe('all history');
    expect(rangeLabel(0, CUTOFF)).not.toMatch(/\b0 days/);
    expect(rangeLabel(90, CUTOFF)).toBe('the last 90 days');
    expect(rangeLabel(1, CUTOFF)).toBe('the last day');
    const recent = recentLine(count({ toFetch: 3 }), 0, CUTOFF) as string;
    expect(recent).toContain(`all mail since the cutoff, ${day(CUTOFF)}`);
    expect(recent).not.toMatch(/last 0|0 days/);
    expect(f4Caveat('gmail', 0, 7)).not.toMatch(/last 0|0 days/);
    expect(f4Caveat('gmail', 0, 7)).toContain('since the cutoff');
    expect(introLine('Support', CUTOFF, 0)).toBe(
      `Support · mining conversations received before ${day(CUTOFF)}. It now reads all history before the cutoff.`
    );
    expect(introLine('Support', CUTOFF, 90)).toContain('reads the last 90 days before the cutoff');
  });

  it('G14: F4 caveat for Gmail names the days; absent for IMAP', () => {
    expect(f4Caveat('gmail', 30, 0)).toBe(
      'Also re-checks mail from the last 30 days. Mail deleted from Odly in that period (including cleaned-up spam) will be imported again.'
    );
    expect(f4Caveat('gmail', 30, 7)).toMatch(
      / Mail from the last 7 days lands as open work and can get an automatic reply\.$/
    );
    expect(f4Caveat('email', 30, 7)).toBeNull();
    expect(f4Caveat('other', 30, 7)).toBeNull();
  });

  it('room lines: partial cap and a full knowledge base', () => {
    const room = (over: Partial<KbRangeRoom>): KbRangeRoom => ({
      storedMessages: null,
      kbItems: null,
      projectedSkipped: 0,
      kbFull: false,
      ...over,
    });
    expect(roomLines(room({}), 900, count())).toEqual([]);
    expect(
      roomLines(
        room({ storedMessages: { limit: 5000, used: 4500, left: 500 }, projectedSkipped: 400 }),
        900,
        count()
      )
    ).toEqual([
      'Your plan stores up to 5,000 messages and 500 more fit. About 400 of the 900 would not be stored, and the result will be partial.',
    ]);
    expect(
      roomLines(room({ kbFull: true, kbItems: { limit: 100, used: 100, left: 0 } }), 900, count())
    ).toEqual([
      'The knowledge base is full (100 of 100 items). New Q&A pairs wait until there is room.',
    ]);
    expect(roomLines(room({ kbFull: true }), 0, count())[0]).toMatch(
      /^The knowledge base is full\./
    );
  });

  it('static lines: sweep in progress, narrowing, confirm label', () => {
    expect(sweepInProgressLine('gmail')).toBe(
      'A history read is already running for this mailbox. Confirming restarts it with the new range.'
    );
    expect(sweepInProgressLine('email')).toMatch(/ IMAP starts again from the oldest message\.$/);
    expect(narrowingLine()).toBe(
      'A shorter range keeps everything already in the knowledge base. Only later re-reads use the shorter range. Nothing is fetched now.'
    );
    expect(
      confirmLabel({
        narrower: false,
        capped: false,
        toFetch: 1250,
        approximate: false,
        timedOut: false,
      })
    ).toBe('Read 1,250 messages');
    expect(
      confirmLabel({
        narrower: false,
        capped: true,
        toFetch: 1250,
        approximate: false,
        timedOut: false,
      })
    ).toBe('Read the history');
    expect(
      confirmLabel({
        narrower: true,
        capped: false,
        toFetch: 0,
        approximate: false,
        timedOut: false,
      })
    ).toBe('Save range');
  });

  it('last sweep: every state, never a raw enum, unknown is never "complete"', () => {
    expect(lastSweepLine(sweep({ state: 'complete' }))).toBe('The last read completed.');
    expect(
      lastSweepLine(
        sweep({ state: 'partial', capSkipped: { storedMessages: 30, historyWindow: 12 } })
      )
    ).toBe(
      "The last read finished partially: 42 messages were not stored because of the plan's limits."
    );
    expect(lastSweepLine(sweep({ state: 'partial' }))).toBe(
      "The last read finished partially: some messages were not stored because of the plan's limits."
    );
    const unknown = lastSweepLine(sweep({ state: 'unknown' })) as string;
    expect(unknown).toContain(
      'finished; the number of messages skipped by your plan could not be confirmed'
    );
    expect(unknown).not.toMatch(/complete/i);
    expect(lastSweepLine(sweep({ state: 'kb_full', threadsWaiting: 14 }))).toBe(
      'The last read is waiting: the knowledge base is full — 14 conversations wait to be mined.'
    );
    expect(lastSweepLine(sweep({ state: 'paused' }))).toBe(
      "Mining is paused by today's KB limit and resumes after the reset."
    );
    expect(
      lastSweepLine(sweep({ state: 'ai_incomplete', aiSkipped: 9, aiReason: 'rate_limited' }))
    ).toBe(
      "9 conversations were not mined because AI was unavailable (this workspace's hourly AI allowance is used up). They will be retried automatically."
    );
    const noNumber = lastSweepLine(
      sweep({ state: 'ai_incomplete', aiReason: 'provider_quota' })
    ) as string;
    expect(noNumber).toMatch(/^Some conversations were not mined because AI was unavailable/);
    expect(noNumber).not.toMatch(/provider_quota|null|undefined|\bNaN\b/);
    expect(lastSweepLine(sweep({ state: 'ai_incomplete' }))).toBe(
      'Some conversations were not mined because AI was unavailable. They will be retried automatically.'
    );
    expect(lastSweepLine(sweep({ state: 'failed' }))).toBe(
      'The last mining run hit errors; it retries on the next check. The affected conversations are listed under KB mining failures.'
    );
    expect(lastSweepLine(sweep({ state: 'running' }))).toBe('A history read is running.');
  });

  it('errors: 404 SOURCE_NOT_FOUND vs 404 without a code', () => {
    expect(
      errorText(
        httpError(404, { success: false, code: 'SOURCE_NOT_FOUND', error: 'Mail source not found' })
      )
    ).toBe('This mailbox no longer exists in this workspace.');
    expect(errorText(httpError(404, 'Cannot POST /api/integrations/1/kb-history-range'))).toBe(
      'This server does not support changing the history range yet — it arrives with the next backend release.'
    );
    expect(errorText(httpError(404, { success: false, error: 'Not found' }))).toMatch(
      /does not support/
    );
  });

  it('errors: 403 split, other codes verbatim, no raw enum', () => {
    const limit = 'Your plan reads at most 90 days of history.';
    expect(
      errorText(httpError(403, { code: 'PLAN_HISTORY_LIMIT', error: limit, message: limit }))
    ).toBe(limit);
    expect(
      errorText(
        httpError(403, {
          code: 'NOT_WORKSPACE_ADMIN',
          error:
            "Only a workspace admin can change a mailbox's history range: it re-reads mail for every department.",
        })
      )
    ).toMatch(/^Only a workspace admin/);
    expect(errorText(httpError(403, { success: false, error: 'Forbidden' }))).toBe(
      'You need the Manage integrations permission to change this.'
    );
    expect(errorText(httpError(403))).toBe(
      'You need the Manage integrations permission to change this.'
    );
    const mining = 'Mining is off for this mailbox: it has no knowledge-base start date.';
    expect(errorText(httpError(409, { code: 'MINING_OFF', error: mining, message: mining }))).toBe(
      mining
    );
    expect(
      errorText(
        httpError(409, { code: 'AI_UNAVAILABLE', error: 'AI is unavailable (rate_limited)' })
      )
    ).toBe("AI is unavailable (this workspace's hourly AI allowance is used up)");
    expect(errorText(httpError(400, { error: 'Boom' }))).toBe('Boom');
    expect(errorText(new Error('Network Error'))).toBe('Network Error');
    expect(errorText({})).toBe('The request failed.');
  });

  it('apply alert: Gmail, IMAP (no tracked run), narrower, restart', () => {
    const applied = (over: Partial<KbRangeApplied>): KbRangeApplied => ({
      applied: true,
      days: 180,
      direction: 'wider',
      sweepRequested: true,
      restarted: false,
      importRunStarted: false,
      ...over,
    });
    expect(applyAlert(applied({}), 'gmail')).toEqual({
      title: 'History read requested',
      body: 'The next check of this mailbox starts it. Progress shows in the processing panel.',
    });
    expect(applyAlert(applied({ importRunStarted: true }), 'gmail').body).toBe(
      'It is starting now. Progress shows in the processing panel.'
    );
    const imapStarted = applyAlert(applied({ importRunStarted: true }), 'email');
    expect(imapStarted.body).toBe('It is starting now. Progress shows in the processing panel.');
    const imap = applyAlert(applied({ importRunStarted: false }), 'email');
    expect(imap.title).toBe('History read requested');
    expect(imap.body).toBe('No progress run was started, so none shows in the processing panel.');
    expect(imap.body).not.toMatch(/later update|arrives/);
    expect(applyAlert(applied({ direction: 'narrower', sweepRequested: false }), 'gmail')).toEqual({
      title: 'Range saved',
      body: 'Later re-reads use the shorter range. Nothing was fetched and the knowledge base is unchanged.',
    });
    expect(applyAlert(applied({ restarted: true }), 'email').body).toMatch(
      /^The read that was already running restarts with the new range\. /
    );
    expect(applyAlert(applied({ direction: 'same', sweepRequested: false }), 'gmail').title).toBe(
      'Range saved'
    );
  });

  it('run and import-progress words (FE-3a wires them)', () => {
    expect(aiReasonWords('provider_quota')).toBe('the AI provider says its quota is used up');
    expect(aiReasonWords('plan_inactive')).toBe('this workspace has no active plan');
    expect(aiReasonWords('something_new')).toBeNull();
    expect(aiReasonWords(undefined)).toBeNull();
    expect(runStoppedLine({ stoppedBy: 'kb_full' })).toBe(
      'Stopped: the knowledge base is full (plan limit). The remaining conversations are mined when there is room — remove KB items or raise the plan, then press Re-mine.'
    );
    expect(
      runStoppedLine({ stoppedBy: 'ai_unavailable', aiReason: 'rate_limited', retry: 're_mine' })
    ).toBe(
      "Stopped: AI was unavailable (this workspace's hourly AI allowance is used up). Conversations not yet mined stay unmined and will be mined by the next Re-mine."
    );
    expect(runStoppedLine({ stoppedBy: 'ai_unavailable', aiReason: 'rate_limited' })).toMatch(
      /next Re-mine\.$/
    );
    expect(
      runStoppedLine({
        stoppedBy: 'ai_unavailable',
        aiReason: 'provider_quota',
        retry: 'automatic',
      })
    ).toMatch(/will be retried automatically\.$/);
    expect(
      runStoppedLine({ stoppedBy: 'ai_unavailable', aiReason: 'weird_code', retry: 'automatic' })
    ).toBe(
      'Stopped: AI was unavailable. Conversations not yet mined stay unmined and will be retried automatically.'
    );
    expect(
      runStoppedLine({ stoppedBy: 'ai_unavailable', aiSkipped: 4, retry: 'automatic' })
    ).toContain('4 conversations');
    expect(runStoppedLine({ stoppedBy: 'quota' })).toBeNull();
    expect(kbFullHoldLine(12)).toBe(
      'Waiting for room: the knowledge base is full — 12 conversations wait to be mined.'
    );
    expect(kbFullHeldLine(1)).toBe('1 run is waiting for room in the knowledge base.');
    expect(kbFullHeldLine(3)).toBe('3 runs are waiting for room in the knowledge base.');
    expect(retryOwedWithheldLine({ kbFull: 5 })).toBe(
      'No knowledge-base work was queued: the knowledge base is full. Make room, then retry.'
    );
    expect(retryOwedWithheldLine({ aiUnavailable: 'rate_limited' })).toBe(
      "No knowledge-base work was queued: AI is unavailable (this workspace's hourly AI allowance is used up). Try again when it is back."
    );
    expect(retryOwedWithheldLine({ aiUnavailable: null })).toBe(
      'No knowledge-base work was queued: AI is unavailable. Try again when it is back.'
    );
    expect(retryOwedWithheldLine({})).toBeNull();
  });

  it('fix round: cost never understates (capped / approximate / uncounted / unit / unknown AI)', () => {
    const capped = count({ capped: true, cappedBy: 'size' });
    const costCapped = costLine(estimate(), 'own_key', 0, capped);
    expect(costCapped).toMatch(/^At least ≈300,000 tokens \(the mailbox count is incomplete\)/);
    expect(costLine(estimate(), 'own_key', 0, count({ timedOut: true }))).toMatch(/^At least ≈/);
    expect(costLine(estimate(), 'own_key', 0, count({ approximate: true }))).toMatch(
      /^About ≈300,000 tokens for about 120 conversations/
    );
    const uncounted = count({ capped: true, cappedBy: 'time', inRange: 0, inOdly: 0, toFetch: 0 });
    expect(costLine(estimate(), 'own_key', 0, uncounted)).toBe(
      'Token cost: cannot be estimated until the mailbox is counted.'
    );
    const imap = costLine(
      estimate({ threadsBasis: 'upper_bound_messages', newThreads: 900, threadsToMine: 920 }),
      'own_key',
      0,
      count({ approximate: true })
    );
    expect(imap).toMatch(/^Up to ≈300,000 tokens for up to 920 messages/);
    expect(imap).not.toMatch(/920 conversations/);
    expect(costLine(null, 'unknown', 0, count())).toBe(
      'AI setup could not be read, so the token cost cannot be confirmed.'
    );
    expect(costLine(null, 'unknown', 0, count())).not.toMatch(/not measured/);
    expect(costLine(estimate(), 'unknown', 0, count())).toMatch(/AI setup could not be read/);
  });

  it('fix round: confirm label never says "Read 0 messages"', () => {
    expect(
      confirmLabel({
        narrower: false,
        capped: false,
        toFetch: 0,
        approximate: false,
        timedOut: false,
      })
    ).toBe('Start the read');
    expect(
      confirmLabel({
        narrower: false,
        capped: false,
        toFetch: 40,
        approximate: true,
        timedOut: false,
      })
    ).toBe('Read about 40 messages');
    expect(
      confirmLabel({
        narrower: false,
        capped: false,
        toFetch: 1,
        approximate: false,
        timedOut: false,
      })
    ).toBe('Read 1 message');
  });

  it('fix round: recent line capped with nothing found, and timed out', () => {
    const line = recentLine(
      count({ capped: true, cappedBy: 'size', inRange: 50, toFetch: 0 }),
      30,
      CUTOFF
    ) as string;
    expect(line).not.toMatch(/at least 0|will be imported/);
    expect(line).toContain('none found so far');
    expect(recentLine(count({ timedOut: true, toFetch: 4 }), 30, CUTOFF)).toMatch(
      /at least 4 not in Odly.*ran out of time/
    );
  });

  it('fix round: last sweep plural and zero skipped', () => {
    expect(
      lastSweepLine(
        sweep({ state: 'partial', capSkipped: { storedMessages: 1, historyWindow: 0 } })
      )
    ).toMatch(/^The last read finished partially: 1 message was not stored/);
    expect(lastSweepLine(sweep({ state: 'ai_incomplete', aiSkipped: 0 }))).toBe(
      'Some conversations were not mined because AI was unavailable. They will be retried automatically.'
    );
  });

  it('fix round: room lines do not state inexact numbers as exact', () => {
    const room: KbRangeRoom = {
      storedMessages: { limit: 5000, used: 4500, left: 500 },
      kbItems: null,
      projectedSkipped: 400,
      kbFull: false,
    };
    const inexact = roomLines(room, 900, count({ capped: true, cappedBy: 'size' }))[0];
    expect(inexact).not.toMatch(/of the 900/);
    expect(inexact).toContain('At least 400 messages would not be stored');
    expect(roomLines(room, 0, count())[0]).not.toMatch(/of the 0/);
    expect(roomLines(room, 900, count())[0]).toContain('About 400 of the 900');
  });

  it('fix round: 5xx never shows raw text; new codes show server text', () => {
    expect(errorText(httpError(500, { error: 'ECONNREFUSED 10.0.0.4:5432' }))).toBe(
      'The request failed. Try again later.'
    );
    expect(
      errorText(
        httpError(502, {
          code: 'MAILBOX_ERROR',
          error:
            'The mailbox could not be read just now, so nothing was counted. Try again in a few minutes.',
        })
      )
    ).toMatch(/^The mailbox could not be read/);
    expect(
      errorText(
        httpError(503, {
          code: 'PLAN_UNREADABLE',
          error:
            "Your plan's limits could not be read, so the range cannot be checked. Try again in a moment.",
        })
      )
    ).toMatch(/^Your plan's limits/);
    expect(
      errorText(
        httpError(400, { code: 'INVALID_ID', error: 'The mailbox id must be a positive integer.' })
      )
    ).toMatch(/positive integer/);
  });

  it('fix round 2: a missing count never restores exact wording', () => {
    expect(costLine(estimate(), 'own_key', 0, null)).toBe(
      'Token cost: cannot be estimated until the mailbox is counted.'
    );
    const room: KbRangeRoom = {
      storedMessages: { limit: 5000, used: 4500, left: 500 },
      kbItems: null,
      projectedSkipped: 400,
      kbFull: false,
    };
    expect(roomLines(room, 900, null)[0]).not.toMatch(/of the 900/);
    expect(
      confirmLabel({
        narrower: false,
        capped: false,
        toFetch: 40,
        approximate: false,
        timedOut: true,
      })
    ).toBe('Read the history');
    // timed out, all zeros: not counted
    const zeroTimedOut = count({ timedOut: true, inRange: 0, inOdly: 0, toFetch: 0 });
    expect(costLine(estimate(), 'own_key', 0, zeroTimedOut)).toBe(
      'Token cost: cannot be estimated until the mailbox is counted.'
    );
    expect(historyLine(zeroTimedOut)).toMatch(/^Before the cutoff: could not be counted in time\./);
    expect(historyLine(count({ timedOut: true }))).toContain('at least 300 already in Odly');
  });

  it('fix round 2: IMAP says per message', () => {
    const imap = costLine(
      estimate({ threadsBasis: 'upper_bound_messages' }),
      'own_key',
      0,
      count({ approximate: true })
    );
    expect(imap).toContain('2,500 per message');
    expect(imap).not.toContain('per conversation');
    expect(costLine(estimate(), 'own_key', 0, count())).toContain('2,500 per conversation');
  });

  it('fix round 2: 5xx masks unless the code is one of ours', () => {
    const generic = 'The request failed. Try again later.';
    expect(
      errorText(httpError(502, { code: 'BAD_GATEWAY', error: 'upstream connect error' }))
    ).toBe(generic);
    expect(errorText(httpError(500, { code: 'INTERNAL_ERROR', error: 'boom at db.ts:12' }))).toBe(
      generic
    );
    expect(errorText(httpError(503, { code: 'SERVICE_UNAVAILABLE', error: 'pg down' }))).toBe(
      generic
    );
    expect(
      errorText(
        httpError(503, { code: 'PLAN_UNREADABLE', error: 'Your plan limits could not be read.' })
      )
    ).toBe('Your plan limits could not be read.');
    expect(errorText(httpError(409, { code: 'WHATEVER', error: 'Some 4xx text' }))).toBe(
      'Some 4xx text'
    );
  });
});

describe('fix round words', () => {
  it('pins the labels and the not-checked sentences', () => {
    expect(KB_RANGE_LOADING).toBe('Loading…');
    expect(KB_RANGE_CANCEL).toBe('Cancel');
    expect(KB_RANGE_CURRENT_SUFFIX).toBe(' (current setting)');
    expect(unverifiableLine(1)).toBe(
      '1 message could not be checked against Odly (no Message-ID) and is not in the fetch figure.'
    );
    expect(unverifiableLine(12)).toBe(
      '12 messages could not be checked against Odly (no Message-ID) and are not in the fetch figure.'
    );
    expect(notComparedLine(4)).toBe('4 messages were not compared with what is already in Odly.');
  });
});
