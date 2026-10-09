/**
 * Every sentence of the knowledge-base history-range feature, as pure functions of the backend's
 * wire types — so the dialog (FE-2) and the cards / processing panel (FE-3a) say the same thing in
 * the same words, and one test file pins them.
 *
 * Rules the words keep:
 *  - A raw code is never printed: reasons go through `aiReasonWords`, error text through
 *    `errorText` (which also rewrites a code the server left in its sentence).
 *  - "No estimate" is never a 0. "All time" (0 days) is never "last 0 days".
 *  - Narrowing keeps the knowledge base; an unconfirmed skip count is never "complete".
 */
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import type {
  KbLastSweep,
  KbRangeErrorCode,
  KbRangeApplied,
  KbRangeCount,
  KbRangeEstimate,
  KbRangePolicy,
  KbRangeRoom,
} from '@/services/integrations.service';

const num = (value: number): string => value.toLocaleString();
const date = (iso: string | null | undefined): string | null =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
const plural = (count: number, one: string, many: string): string =>
  `${num(count)} ${count === 1 ? one : many}`;

// ---- AI reasons -------------------------------------------------------------------------------

const AI_REASON_WORDS: Record<string, string> = {
  provider_quota: 'the AI provider says its quota is used up',
  rate_limited: "this workspace's hourly AI allowance is used up",
  settings_unreadable: "this workspace's AI settings could not be read",
  plan_inactive: 'this workspace has no active plan',
};

/** Words for a reason code; null for an absent or unknown one (never the code itself). */
export const aiReasonWords = (reason: string | null | undefined): string | null =>
  (reason && AI_REASON_WORDS[reason]) || null;

/** The server sometimes leaves a code in its sentence ("(rate_limited)"): put words in its place. */
const withoutCodes = (text: string): string =>
  text.replace(/\b(provider_quota|rate_limited|settings_unreadable|plan_inactive)\b/g, (code) =>
    code === 'plan_inactive' ? 'no active plan' : (AI_REASON_WORDS[code] ?? code)
  );

const becauseAi = (reason: string | null | undefined): string => {
  const words = aiReasonWords(reason);
  return words ? ` (${words})` : '';
};

// ---- Header, labels ---------------------------------------------------------------------------

export const KB_RANGE_TITLE = 'Knowledge-base history range';
export const KB_RANGE_SELECT_LABEL = 'Read history from';
export const KB_RANGE_ABOVE_PLAN_SUFFIX = ' — above your plan';
export const KB_RANGE_CHECK = 'Check';
export const KB_RANGE_LOADING = 'Loading…';
export const KB_RANGE_CANCEL = 'Cancel';
export const KB_RANGE_CURRENT_SUFFIX = ' (current setting)';
/** An option label marked as the saved setting. */
export const currentSettingLabel = (label: string): string => `${label}${KB_RANGE_CURRENT_SUFFIX}`;
export const KB_RANGE_COUNTING = 'Counting the mailbox — this can take up to a minute.';
export const KB_RANGE_STILL_COUNTING =
  'Still counting — large mailboxes take longer. Keep this window open.';

export const planCaption = (planMaxHistoryDays: number): string =>
  `Your plan reads at most ${num(planMaxHistoryDays)} days of history.`;

/** `cutoff` is accepted so callers pass the same pair everywhere; the label itself never needs it. */
export const rangeLabel = (days: number, _cutoff?: string | null): string =>
  days <= 0 ? 'all history' : days === 1 ? 'the last day' : `the last ${num(days)} days`;

export const introLine = (name: string, cutoff: string | null, currentDays: number): string =>
  `${name} · mining conversations received before ${date(cutoff) ?? 'the cutoff'}. ` +
  `It now reads ${rangeLabel(currentDays)} before the cutoff.`;

// ---- Counts -----------------------------------------------------------------------------------

const incomplete = (tally: KbRangeCount): boolean => tally.capped || tally.timedOut;

const countWord = (tally: KbRangeCount, total: number): string =>
  incomplete(tally)
    ? `at least ${num(total)}`
    : tally.approximate
      ? `about ${num(total)}`
      : num(total);

const notCounted = (tally: KbRangeCount): boolean =>
  incomplete(tally) && tally.inRange === 0 && tally.inOdly === 0 && tally.toFetch === 0;

export const historyLine = (tally: KbRangeCount): string => {
  if (notCounted(tally)) {
    return `Before the cutoff: could not be counted${tally.cappedBy === 'time' || tally.timedOut ? ' in time' : ''}.`;
  }
  const inOdly = countWord(tally, tally.inOdly);
  const line =
    `Before the cutoff: ${countWord(tally, tally.inRange)} messages · ${inOdly} already in Odly · ` +
    `${countWord(tally, tally.toFetch)} to fetch`;
  return tally.timedOut
    ? `${line} The count ran out of time, so these numbers cover only part of the range.`
    : line;
};

/** Messages the count could not compare by Message-ID: inRange = inOdly + toFetch + these. */
export const unverifiableLine = (count: number): string =>
  `${plural(count, 'message', 'messages')} could not be checked against Odly (no Message-ID) and ${count === 1 ? 'is' : 'are'} not in the fetch figure.`;

/** Messages listed but not compared with Odly before the count stopped. */
export const notComparedLine = (count: number): string =>
  `${plural(count, 'message was', 'messages were')} not compared with what is already in Odly.`;

/** Gmail only (`c` null for IMAP). `days` is the chosen range; 0 is all mail since the cutoff. */
export const recentLine = (
  tally: KbRangeCount | null,
  days: number,
  cutoff: string | null
): string | null => {
  if (!tally) return null;
  const scope =
    days > 0
      ? `last ${num(days)} ${days === 1 ? 'day' : 'days'}`
      : `all mail since the cutoff${date(cutoff) ? `, ${date(cutoff)}` : ''}`;
  const head = `Recent re-check (${scope}): `;
  if (notCounted(tally) || (tally.capped && tally.inRange === 0)) {
    return `${head}could not be counted.`;
  }
  const timeNote = tally.timedOut
    ? ' The count ran out of time, so this covers only part of the range.'
    : '';
  if (tally.toFetch === 0) {
    return incomplete(tally)
      ? `${head}none found so far — the count is incomplete.${timeNote}`
      : `${head}nothing missing.`;
  }
  return `${head}${countWord(tally, tally.toFetch)} not in Odly will be imported as regular mail.${timeNote}`;
};

// ---- Cost, allowance, room --------------------------------------------------------------------

export const costLine = (
  est: KbRangeEstimate | null,
  aiMode: KbRangePolicy['aiMode'],
  recentToFetch: number,
  history: KbRangeCount | null
): string => {
  if (aiMode === 'none') {
    return 'This workspace has no AI provider, so mining uses rule-based extraction — no AI tokens.';
  }
  const unknownAi = 'AI setup could not be read, so the token cost cannot be confirmed.';
  if (!history || notCounted(history)) {
    return 'Token cost: cannot be estimated until the mailbox is counted.';
  }
  if (!est || est.estimatedTokens === null || est.tokensPerThread === null) {
    return aiMode === 'unknown' ? unknownAi : 'Token cost: not measured yet on this workspace.';
  }
  const isMessages = est.threadsBasis === 'upper_bound_messages';
  const unit = isMessages ? 'message' : 'conversation';
  const cappedHistory = history !== null && incomplete(history);
  const lead = cappedHistory
    ? 'At least '
    : isMessages
      ? 'Up to '
      : history?.approximate
        ? 'About '
        : '';
  const bound = cappedHistory
    ? ''
    : isMessages
      ? 'up to '
      : history?.approximate
        ? 'about '
        : 'up to ';
  const incompleteNote = cappedHistory ? ' (the mailbox count is incomplete)' : '';
  const fetched = isMessages
    ? `${num(est.newThreads)} newly fetched ${est.newThreads === 1 ? 'message' : 'messages'} + ${num(est.backlogThreads)} already-imported conversations not yet mined`
    : `${num(est.newThreads)} with newly fetched mail + ${num(est.backlogThreads)} already imported and not yet mined`;
  let line =
    `${lead}≈${num(est.estimatedTokens)} tokens${incompleteNote} for ${bound}${plural(est.threadsToMine, unit, `${unit}s`)} ` +
    `(${fetched}; ${num(est.tokensPerThread)} per ${unit}, measured on this workspace).`;
  if (est.daysAtLimit !== null) {
    if (est.daysAtLimit <= 1) line += " It fits in today's KB limit.";
    else if (est.enforced) {
      line += ` At your daily KB limit that is about ${num(est.daysAtLimit)} days; it pauses each day at the limit and resumes after the reset.`;
    } else {
      line += ` That is about ${num(est.daysAtLimit)} days of your daily KB limit; your limits are only measured, so mining does not pause.`;
    }
  }
  if (recentToFetch > 0) {
    line += ' Recent mail gets regular AI analysis, which is not in this estimate.';
  }
  if (aiMode === 'unknown') line += ` ${unknownAi}`;
  return line;
};

export const allowanceLine = (
  allowance: { callsLeftThisMonth: number | null; estimatedCalls: number | null; short: boolean },
  kbLimitReachedToday: boolean,
  aiMode: KbRangePolicy['aiMode']
): string | null => {
  const parts: string[] = [];
  if (
    allowance.short &&
    allowance.estimatedCalls !== null &&
    allowance.callsLeftThisMonth !== null
  ) {
    parts.push(
      `This read needs about ${num(allowance.estimatedCalls)} AI calls; your plan has ${num(allowance.callsLeftThisMonth)} left this month. ` +
        'When they run out, mining continues without AI (rule-based).'
    );
  }
  if (kbLimitReachedToday) {
    parts.push("Today's KB limit is reached — mining starts after the reset.");
  }
  if (aiMode !== 'none') {
    parts.push(
      'If AI is unavailable during the read, the affected conversations stay unmined and are retried automatically.'
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
};

export const roomLines = (
  room: KbRangeRoom,
  toFetch: number,
  history: KbRangeCount | null
): string[] => {
  const lines: string[] = [];
  if (room.storedMessages && room.projectedSkipped > 0) {
    const limits = `Your plan stores up to ${num(room.storedMessages.limit)} messages and ${num(room.storedMessages.left)} more fit. `;
    const inexact = toFetch === 0 || history === null || incomplete(history) || history.approximate;
    lines.push(
      inexact
        ? `${limits}${history === null || incomplete(history) ? 'At least' : 'About'} ${num(room.projectedSkipped)} messages would not be stored, and the result will be partial.`
        : `${limits}About ${num(room.projectedSkipped)} of the ${num(toFetch)} would not be stored, and the result will be partial.`
    );
  }
  if (room.kbFull) {
    const items = room.kbItems
      ? ` (${num(room.kbItems.used)} of ${num(room.kbItems.limit)} items)`
      : '';
    lines.push(`The knowledge base is full${items}. New Q&A pairs wait until there is room.`);
  }
  return lines;
};

// ---- Notices, confirm, apply ------------------------------------------------------------------

export const sweepInProgressLine = (type: KbRangePolicy['type']): string =>
  'A history read is already running for this mailbox. Confirming restarts it with the new range.' +
  (type === 'email' ? ' IMAP starts again from the oldest message.' : '');

export const narrowingLine = (): string =>
  'A shorter range keeps everything already in the knowledge base. Only later re-reads use the shorter range. Nothing is fetched now.';

/** Gmail only: a re-read also re-checks recent mail. Null for IMAP. */
export const f4Caveat = (
  type: KbRangePolicy['type'],
  days: number,
  openWindowDays: number
): string | null => {
  if (type !== 'gmail') return null;
  const scope =
    days > 0 ? `from the last ${num(days)} ${days === 1 ? 'day' : 'days'}` : 'since the cutoff';
  let text = `Also re-checks mail ${scope}. Mail deleted from Odly in that period (including cleaned-up spam) will be imported again.`;
  if (openWindowDays > 0) {
    text += ` Mail from the last ${num(openWindowDays)} ${openWindowDays === 1 ? 'day' : 'days'} lands as open work and can get an automatic reply.`;
  }
  return text;
};

/** `toFetch` is historyToFetch + recentToFetch. */
export const confirmLabel = (opts: {
  narrower: boolean;
  capped: boolean;
  toFetch: number;
  approximate: boolean;
  timedOut: boolean;
}): string =>
  opts.narrower
    ? 'Save range'
    : opts.capped || opts.timedOut
      ? 'Read the history'
      : opts.toFetch === 0
        ? 'Start the read'
        : `Read ${opts.approximate ? 'about ' : ''}${plural(opts.toFetch, 'message', 'messages')}`;

export const applyAlert = (
  applied: KbRangeApplied,
  type: KbRangePolicy['type']
): { title: string; body: string } => {
  if (applied.direction === 'narrower' && !applied.sweepRequested) {
    return {
      title: 'Range saved',
      body: 'Later re-reads use the shorter range. Nothing was fetched and the knowledge base is unchanged.',
    };
  }
  if (!applied.sweepRequested) {
    return {
      title: 'Range saved',
      body: 'The range is saved. No new read was requested.',
    };
  }
  const restart = applied.restarted
    ? 'The read that was already running restarts with the new range. '
    : '';
  // IMAP applies never start a tracked run in this release: do not promise one.
  const body =
    type === 'gmail'
      ? applied.importRunStarted
        ? 'It is starting now. Progress shows in the processing panel.'
        : 'The next check of this mailbox starts it. Progress shows in the processing panel.'
      : 'The next check of this mailbox starts it. Live import progress for IMAP arrives with a later update.';
  return { title: 'History read requested', body: restart + body };
};

// ---- Last sweep -------------------------------------------------------------------------------

export const lastSweepLine = (sweep: KbLastSweep): string | null => {
  switch (sweep.state) {
    case 'complete':
      return 'The last read completed.';
    case 'partial': {
      const total = sweep.capSkipped
        ? sweep.capSkipped.storedMessages + sweep.capSkipped.historyWindow
        : null;
      return `The last read finished partially: ${total && total > 0 ? plural(total, 'message was', 'messages were') : 'some messages were'} not stored because of the plan's limits.`;
    }
    case 'unknown':
      return 'The last read finished; the number of messages skipped by your plan could not be confirmed.';
    case 'kb_full':
      return `The last read is waiting: the knowledge base is full — ${
        sweep.threadsWaiting !== null
          ? plural(sweep.threadsWaiting, 'conversation waits', 'conversations wait')
          : 'some conversations wait'
      } to be mined.`;
    case 'paused':
      return "Mining is paused by today's KB limit and resumes after the reset.";
    case 'ai_incomplete':
      return `${
        sweep.aiSkipped !== null && sweep.aiSkipped > 0
          ? `${plural(sweep.aiSkipped, 'conversation was', 'conversations were')}`
          : 'Some conversations were'
      } not mined because AI was unavailable${becauseAi(sweep.aiReason)}. They will be retried automatically.`;
    case 'failed':
      return 'The last mining run hit errors; it retries on the next check. The affected conversations are listed under KB mining failures.';
    case 'running':
      return 'A history read is running.';
    default:
      return null;
  }
};

// ---- Errors -----------------------------------------------------------------------------------

const NOT_DEPLOYED =
  'This server does not support changing the history range yet — it arrives with the next backend release.';
const NEEDS_PERMISSION = 'You need the Manage integrations permission to change this.';
const KNOWN_CODES: readonly KbRangeErrorCode[] = [
  'SOURCE_NOT_FOUND',
  'NOT_KB_SOURCE',
  'UNSUPPORTED_SOURCE_TYPE',
  'MINING_OFF',
  'SOURCE_DISABLED',
  'PLAN_INACTIVE',
  'LEGACY_GMAIL_CONFIG',
  'NO_SOURCE_CONFIG',
  'PLAN_HISTORY_LIMIT',
  'IMAP_RANGE_LIMIT',
  'AI_UNAVAILABLE',
  'APPLY_IN_PROGRESS',
  'COUNT_IN_PROGRESS',
  'INVALID_BODY',
  'COUNT_TIMED_OUT',
  'NOT_WORKSPACE_ADMIN',
  'MAILBOX_SIGN_IN',
  'MAILBOX_QUOTA',
  'MAILBOX_UNREADABLE',
  'MAILBOX_ERROR',
  'PLAN_UNREADABLE',
  'INVALID_ID',
];
const GENERIC_FAILURE = 'The request failed. Try again later.';

const errorCode = (err: unknown): string | null => {
  const code = (err as { data?: { code?: unknown } } | null | undefined)?.data?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
};

export const errorText = (err: unknown): string => {
  const status = apiErrorStatus(err);
  const code = errorCode(err);
  if (status === 404) {
    // Only a 404 that names no code is an older backend without the route.
    return code === null
      ? NOT_DEPLOYED
      : code === 'SOURCE_NOT_FOUND'
        ? 'This mailbox no longer exists in this workspace.'
        : withoutCodes(apiErrorMessage(err, 'The request failed.'));
  }
  if (status === 403 && code === null) return NEEDS_PERMISSION;
  // A 5xx is shown raw only when it names a code of ours; else the interceptor's masking stands.
  if (status !== undefined && status >= 500 && !KNOWN_CODES.includes(code as KbRangeErrorCode))
    return GENERIC_FAILURE;
  return withoutCodes(apiErrorMessage(err, 'The request failed.'));
};

// ---- Import runs and the processing panel (words only; FE-3a wires them) -----------------------

export const runStoppedLine = (
  run: {
    stoppedBy?: string | null;
    aiSkipped?: number;
    aiReason?: string;
    retry?: 'automatic' | 're_mine';
  },
  laterKbRun = false
): string | null => {
  // A later KB run of the mailbox followed: no promise about what comes next is still true.
  if (laterKbRun && (run.stoppedBy === 'kb_full' || run.stoppedBy === 'ai_unavailable')) {
    const what =
      run.stoppedBy === 'kb_full'
        ? 'the knowledge base was full (plan limit)'
        : `AI was unavailable${becauseAi(run.aiReason)}`;
    return `Stopped: ${what}; a later KB run of this mailbox has been recorded since.`;
  }
  if (run.stoppedBy === 'kb_full') {
    return 'Stopped: the knowledge base is full (plan limit). The remaining conversations are mined when there is room — remove KB items or raise the plan, then press Re-mine.';
  }
  if (run.stoppedBy === 'ai_unavailable') {
    const skipped =
      typeof run.aiSkipped === 'number' && run.aiSkipped > 0
        ? ` ${plural(run.aiSkipped, 'conversation was', 'conversations were')} not reached.`
        : '';
    const tail =
      run.retry === 'automatic'
        ? 'will be retried automatically.'
        : 'will be mined by the next Re-mine.';
    return `Stopped: AI was unavailable${becauseAi(run.aiReason)}.${skipped} Conversations not yet mined stay unmined and ${tail}`;
  }
  return null;
};

export const kbFullHoldLine = (owedThreads: number): string =>
  `Waiting for room: the knowledge base is full — ${plural(owedThreads, 'conversation waits', 'conversations wait')} to be mined.`;

export const kbFullHeldLine = (runs: number): string =>
  `${plural(runs, 'run is', 'runs are')} waiting for room in the knowledge base.`;

/** The knowledge-base switch is on, but mining is deferred because the workspace has no active plan. */
export const KB_MINING_DEFERRED_LINE =
  'Knowledge base is on, but nothing is mined yet: this workspace has no active plan. Once a plan is chosen, press Re-mine on this mailbox.';

/**
 * Retry-owed queued nothing for the knowledge-base part because the KB is full (`kbFull` > 0) or AI
 * is refused (`aiUnavailable` is the reason, or null when unreadable). Null when neither applies.
 */
export const retryOwedWithheldLine = (opts: {
  kbFull?: number;
  aiUnavailable?: string | null;
  /** The plan before confirming: nothing has been queued yet, so "will be", not "was". */
  dryRun?: boolean;
}): string | null => {
  // Scoped to the knowledge-base part: decisions and search-index retries still run beside it.
  const nothing = opts.dryRun
    ? 'No knowledge-base work will be queued'
    : 'No knowledge-base work was queued';
  if (opts.kbFull && opts.kbFull > 0) {
    return `${nothing}: the knowledge base is full. Make room, then retry.`;
  }
  if (opts.aiUnavailable !== undefined) {
    return `${nothing}: AI is unavailable${becauseAi(opts.aiUnavailable)}. Try again when it is back.`;
  }
  return null;
};

/** The kebab / strip label of a KB mailbox's history range (a non-KB one keeps "Initial Sync Range"). */
export const KB_RANGE_MENU_LABEL = 'History range';
