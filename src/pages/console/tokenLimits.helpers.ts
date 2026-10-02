import type {
  RegularLimitReleaseOutcome,
  TokenLimit,
  TokenLimitOverride,
  TokenLimitReleaseOutcome,
  TokenLimitSaveOutcome,
  TokenLimitSource,
} from '@/services/managedAiUsage.service';
import { toast } from 'sonner';
import { describeNextReset } from '@/lib/utcClock';
import { TOKEN_LIMITS_SAVED_EVENT } from '@/hooks/useTokenLimitAlerts';

/** `2,000,000`, or "no limit" for 0 — 0 switches the limit off, it does not mean "nothing". */
export const formatLimit = (limit: number): string =>
  limit === 0 ? 'no limit' : limit.toLocaleString();

/** Where the number came from, in words an operator can act on. */
export const SOURCE_WORDS: Record<TokenLimitSource, string> = {
  workspace: 'set for this workspace',
  platform: 'platform setting',
  env: 'server environment setting',
  default: 'built-in default',
};

export const describeLimit = (limit: TokenLimit): string =>
  `${formatLimit(limit.limit)} · ${SOURCE_WORDS[limit.source] ?? limit.source}`;

/** How close today's spend is to a limit — the console's flag (owner decision D7: ≥80%, 100%). */
export type UsageLevel = 'unlimited' | 'ok' | 'near' | 'reached';

export const NEAR_LIMIT_SHARE = 0.8;

export const usageLevel = (spent: number, limit: number): UsageLevel => {
  if (limit <= 0) return 'unlimited';
  if (spent >= limit) return 'reached';
  if (spent >= limit * NEAR_LIMIT_SHARE) return 'near';
  return 'ok';
};

export const LEVEL_CLASS: Record<UsageLevel, string> = {
  unlimited: 'text-muted-foreground',
  ok: 'text-foreground',
  near: 'text-warning',
  reached: 'text-destructive',
};

/** Largest limit the backend accepts (its schema's max). */
export const MAX_LIMIT = 1_000_000_000_000;

export type ParsedLimit = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Plain digits, or digits in groups of three with ONE thousands separator used throughout
 * ("2,000,000", "2 000 000", "2_000_000", "2'000'000"). A stray separator ("1,2,3", "20,00")
 * is a typo, not a number — accepting it would save 123 for someone who meant something else.
 */
const LIMIT_TEXT = /^(?:\d+|\d{1,3}([,_' \u00a0\u202f])\d{3}(?:\1\d{3})*)$/;

/**
 * A limit typed into the console. Blank = no value of its own (follow the next layer). Digits
 * with thousands separators are accepted, so a pasted "2,000,000" is not an error; anything
 * fractional, negative, oddly grouped or too large is refused here rather than by a 400 after
 * Save.
 */
export const parseLimitInput = (text: string): ParsedLimit => {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!LIMIT_TEXT.test(trimmed)) {
    return { ok: false, error: 'Whole tokens only, e.g. 2000000 or 2,000,000.' };
  }
  const digits = trimmed.replace(/\D/g, '');
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value > MAX_LIMIT) {
    return { ok: false, error: 'That is larger than any limit the server accepts.' };
  }
  return { ok: true, value };
};

/**
 * The smallest daily KB limit the backend accepts (owner decision D-R21-1, support-service
 * KB_MIN_TOKENS_PER_DAY): it answers 400 below it. 0 is not a limit — it switches the limit off —
 * so it stays allowed.
 */
export const KB_MIN_TOKENS_PER_DAY = 1_000_000;

export const KB_FLOOR_ERROR = `The KB limit is at least ${KB_MIN_TOKENS_PER_DAY.toLocaleString('en-US')} tokens a day, or 0 for no limit.`;

/**
 * A KB limit typed into the console, held to the floor. Only a value that would be SENT is held to
 * it: the workspace dialog passes its raw saved override (`saved`), which it does not re-send
 * unchanged, so one written outside the console below the floor does not lock the dialog for an
 * edit of the other limit. The platform card passes none: what it shows is the limit in force,
 * which the backend clamps to the floor.
 */
export const parseKbLimitInput = (text: string, saved?: number | null): ParsedLimit => {
  const parsed = parseLimitInput(text);
  if (
    parsed.ok &&
    parsed.value !== null &&
    parsed.value !== 0 &&
    parsed.value < KB_MIN_TOKENS_PER_DAY &&
    parsed.value !== saved
  ) {
    return { ok: false, error: KB_FLOOR_ERROR };
  }
  return parsed;
};

/**
 * The workspace dialog's save body: ONLY the limits the operator changed. A field left as it
 * opened is omitted, not sent as null — the backend reads null as "cleared", and clearing the
 * KB limit counts as lifting it (a release + a KB toast) on an edit that only touched regular.
 */
export const changedLimitEdit = (
  override: TokenLimitOverride | null | undefined,
  next: { kbTokensPerDay: number | null; regularTokensPerDay: number | null }
): { kbTokensPerDay?: number | null; regularTokensPerDay?: number | null } => {
  const edit: { kbTokensPerDay?: number | null; regularTokensPerDay?: number | null } = {};
  for (const field of ['kbTokensPerDay', 'regularTokensPerDay'] as const) {
    const before = override?.[field] ?? null;
    if (next[field] !== before) edit[field] = next[field];
  }
  return edit;
};

/**
 * Both limit editors send the KB value (and the platform's own-key switch) only when it differs
 * from the value saved at that level, so a save that repeats them does not re-run a release that
 * failed — a raise does (FE audit pass 9, LOW). A KB field that opened BLANK (no setting at that
 * level: the card's built-in default / env, the dialog's "follows the platform") has nothing
 * saved, so ANY value typed there is sent — and the backend re-runs the release for a re-sent
 * value at least the one in force, or 0 (keepsKbLimitLifted, be 64d8d228). The advice names that
 * step too (FE audit pass 12, LOW). Said wherever a retry is what the reader would want.
 */
export const NO_SAME_VALUE_RETRY =
  'Saving the KB limit unchanged does not retry this; raising it does, and so does typing the limit now in force, or 0 (no limit), into a blank KB field.';

/**
 * The retry advice, true for the KB limit the save left in force (FE audit pass 10, LOW): a limit
 * of 0 is "no limit" and cannot be raised, but typing 0 into a blank KB field is sent and re-runs
 * the release (FE audit pass 12, NIT) — only a 0 already saved there waits for the reset.
 * `undefined` = not known here (a cleared platform setting falls back to a layer this page cannot
 * see).
 */
export const retryAdvice = (kbLimitAfter?: number): string => {
  if (kbLimitAfter === 0) {
    return `The KB limit is now off (0), so there is no higher limit to raise it to, and saving it unchanged does not retry this. If the KB field is blank, typing 0 into it does; otherwise this work waits for the reset at ${describeNextReset()}.`;
  }
  if (kbLimitAfter === undefined) {
    // Only the card's Clear passes this: its KB field then opens blank.
    return `${NO_SAME_VALUE_RETRY} If the limit now in force is 0 (no limit), nothing is higher: only typing 0 retries it.`;
  }
  return NO_SAME_VALUE_RETRY;
};

/** "about 3 days" for the KB backlog; "today" when it fits in what is left of today. */
export const describeDays = (days: number | null): string | null => {
  if (days === null) return null;
  if (days <= 1) return 'within today';
  return `about ${days} days`;
};

const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

type Said = { tone: 'success' | 'warning'; text: string };

/**
 * What a limit save did to KB work the limit had paused — said after Save, so "saved" is never
 * read as "the paused work runs now" when it does not. `null` = nothing to add (the edit did not
 * lift the KB limit).
 */
export const describeRelease = (
  release: TokenLimitReleaseOutcome,
  kbLimitAfter?: number
): Said | null => {
  if (!release) return null;
  if ('error' in release)
    return { tone: 'warning', text: `${release.error} ${retryAdvice(kbLimitAfter)}` };
  const parts: string[] = [];
  const released = release.releasedOrganizations.length;
  const still = release.stillPaused.length;
  const failed = release.failedOrganizations.length;
  const noticeOnly = release.noticeOnlyOrganizations.length;
  const unreachable = release.unreachableOrganizations.length;
  // BE round 22 (C1): workspaces whose notice the backend marked partial — some of their paused KB
  // work may still wait (a cut scan, or a promote that failed). Some are also released, some in no
  // other list (a notice-only workspace whose scan was cut): never the plain success line.
  const partial = release.partialOrganizations.length;
  // Released work is QUEUED, not run: it waits its turn behind other jobs. The BE counts the
  // conversations of released workspaces (`promotedKbJobs`) apart from those of workspaces whose
  // mine could not be queued (`promotedKbJobsInFailedOrganizations`) — both were queued, so both
  // are said, and the failed workspaces' share is named rather than credited to released ones.
  const conversations = release.promotedKbJobs + release.promotedKbJobsInFailedOrganizations;
  const queued: string[] = [];
  if (conversations > 0) {
    const inFailed = release.promotedKbJobsInFailedOrganizations;
    queued.push(
      plural(conversations, 'parked conversation', 'parked conversations') +
        (inFailed > 0
          ? ` (${
              // All of them in such workspaces: never left to read as the released ones' work
              // (FE audit pass 8, LOW).
              release.promotedKbJobs > 0
                ? `${inFailed.toLocaleString()} of them in`
                : inFailed === 1
                  ? 'in'
                  : 'all in'
            } ${failed === 1 ? 'the workspace' : 'workspaces'} whose ${
              release.failedToQueue === 1 ? 'mine' : 'mines'
            } could not be queued)`
          : '')
    );
  }
  if (release.resumedMines > 0) {
    queued.push(plural(release.resumedMines, 'paused mine', 'paused mines'));
  }
  // A mine an earlier save (or its own resume) already queued is not queued again — but it IS
  // on its way, so a second save must never say nothing was found.
  const said: string[] = [];
  if (queued.length > 0) said.push(`${queued.join(' and ')} queued to continue`);
  if (release.minesAlreadyQueued > 0) {
    said.push(
      `${plural(release.minesAlreadyQueued, 'paused mine', 'paused mines')} already queued to continue`
    );
  }
  if (released > 0) {
    const where = plural(released, 'workspace', 'workspaces');
    if (said.length > 0 || release.failedToQueue > 0 || partial > 0) {
      // With a partial workspace nothing queued may be a promote that FAILED, not nothing parked:
      // "no parked KB work was found" would be untrue — the partial sentence below says it.
      parts.push(`The KB limit no longer pauses ${where}.`);
    } else {
      // A release can find nothing parked (0 and 0) — said as such, never as work that runs.
      parts.push(`The KB limit no longer pauses ${where}; no parked KB work was found to queue.`);
    }
  }
  if (said.length > 0) {
    const sentence = said.join('; ');
    parts.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
  }
  if (release.failedToQueue > 0) {
    // Those workspaces are NOT released: the backend reports them apart (absent ⇒ none named).
    const where = failed > 0 ? ` in ${plural(failed, 'workspace', 'workspaces')}` : '';
    parts.push(
      `Could not queue ${plural(release.failedToQueue, 'paused mine', 'paused mines')}${where} — ${
        release.failedToQueue === 1 ? 'it resumes' : 'they resume'
      } after the reset at ${describeNextReset()}.`
    );
  }
  if (still > 0) {
    parts.push(
      `${plural(still, 'workspace stays', 'workspaces stay')} paused — the KB limit that applies to ${
        still === 1 ? 'it' : 'them'
      } is still under today's KB spend, so ${
        still === 1 ? 'its' : 'their'
      } KB work resumes after the reset at ${describeNextReset()}.`
    );
  }
  if (noticeOnly > 0) {
    // Nothing parked there (e.g. only consolidation was refused), but the bell's notice changed:
    // never "nothing needed releasing" while the bell says released.
    parts.push(
      `The KB limit no longer pauses ${plural(noticeOnly, 'workspace', 'workspaces')} with no parked KB work; ${
        noticeOnly === 1 ? 'its notice was' : 'their notices were'
      } updated.`
    );
  }
  if (unreachable > 0) {
    // Per workspace, never as the whole save: the rest of the release went through (R8 contract).
    const ids = release.unreachableOrganizations.map((id) => `#${id}`).join(', ');
    parts.push(
      // Neutral: the workspace was not read, so whether anything is paused there is not known
      // (FE audit pass 9, NIT). Since BE round 9 the list also holds workspaces whose database
      // answered but whose limit state (AI mode, today's spend, the limits) could not be read.
      // BE round 13: also a workspace with nothing parked whose notice could not be updated.
      `${plural(unreachable, 'workspace', 'workspaces')} (${ids}) could not be reached or checked, or ${
        unreachable === 1 ? 'its notice' : 'their notices'
      } could not be updated, so nothing was released there — any KB work paused there waits for the reset at ${describeNextReset()}.`
    );
  }
  if (partial > 0) {
    const ids = release.partialOrganizations.map((id) => `#${id}`).join(', ');
    parts.push(
      `In ${plural(partial, 'workspace', 'workspaces')} (${ids}) some paused KB work may still wait until the reset at ${describeNextReset()}: not all of it could be found or released at once.`
    );
  }
  if (release.failedToQueue > 0 || unreachable > 0 || partial > 0) {
    parts.push(retryAdvice(kbLimitAfter));
  }
  if (release.truncated) {
    parts.push(
      `Not every paused job could be checked, so some paused KB work may still wait until ${describeNextReset()}.`
    );
  }
  if (parts.length === 0) {
    return {
      tone: 'success',
      text: 'No KB work was paused by the limit, so nothing needed releasing.',
    };
  }
  return {
    tone:
      still > 0 || release.truncated || release.failedToQueue > 0 || unreachable > 0 || partial > 0
        ? 'warning'
        : 'success',
    text: parts.join(' '),
  };
};

/**
 * What a limit save did to the REGULAR limit's notices (BE round 12 `regularRelease`) — never in
 * KB words: the regular limit stops AI drafts, auto-replies and widget answers; it pauses no
 * mining. `null` = nothing to add (no lift, an older backend, or a lift that found no notice).
 * The release only re-words notices: the gate reads the saved limit on every AI call, so where a
 * notice could not be updated it is the NOTICE that lags, not the work.
 */
export const describeRegularRelease = (
  release: RegularLimitReleaseOutcome,
  regularLimitAfter?: number
): Said | null => {
  if (!release) return null;
  // Saving the regular value unchanged sends nothing (neither surface re-sends it, FE pass 13):
  // only a raise, or a value typed into a blank field, re-checks — as for KB. A limit of 0 is
  // "no limit" and cannot be raised (FE audit pass 14, LOW — parity with retryAdvice for KB). No
  // second "check it": the plural paths rewrite only the first, and "it" there is the notices
  // (FE audit pass 15, NIT).
  const how =
    regularLimitAfter === 0
      ? 'the regular limit is now off (0), so there is no higher limit to raise it to, and saving it unchanged does not; if the regular field is blank, typing 0 into it does'
      : 'raising the regular limit, or typing the limit now in force, or 0 (no limit), into a blank regular field; saving it unchanged does not';
  const lagging = `may keep saying AI work is stopped until a later save checks it again — ${how} — or the reset at ${describeNextReset()}`;
  if ('error' in release) {
    return {
      tone: 'warning',
      text: `${release.error} New AI work follows the saved limit; only the regular-limit notice ${lagging}.`,
    };
  }
  const parts: string[] = [];
  const released = release.releasedOrganizations.length;
  const still = release.stillStopped.length;
  const unreachable = release.unreachableOrganizations.length;
  if (released > 0) {
    parts.push(
      `The regular limit no longer stops ${plural(released, 'workspace', 'workspaces')}: AI drafts, auto-replies and widget answers run there for new mail.`
    );
  }
  if (still > 0) {
    parts.push(
      `${plural(still, 'workspace stays', 'workspaces stay')} stopped — the regular limit that applies to ${
        still === 1 ? 'it' : 'them'
      } is still under today's regular spend, so AI drafts, auto-replies and widget answers there wait for the reset at ${describeNextReset()}.`
    );
  }
  if (unreachable > 0) {
    const ids = release.unreachableOrganizations.map((id) => `#${id}`).join(', ');
    // BE round 13: the list also holds workspaces whose notice update (the mark) failed.
    const one = unreachable === 1;
    parts.push(
      `${plural(unreachable, 'workspace', 'workspaces')} (${ids}) could not be checked, or ${
        one ? 'its regular-limit notice' : 'their regular-limit notices'
      } could not be updated; ${one ? 'it was left as it was' : 'they were left as they were'} and ${
        one ? lagging : lagging.replace('checks it', 'checks them')
      }.`
    );
  }
  if (release.truncated) {
    parts.push(
      `Not every regular-limit notice could be checked; any left ${lagging.replace('checks it', 'checks them')}.`
    );
  }
  if (parts.length === 0) return null;
  return {
    tone: still > 0 || unreachable > 0 || release.truncated ? 'warning' : 'success',
    text: parts.join(' '),
  };
};

/** Both releases of one save, KB first: one toast, toned by its worst outcome. */
export const describeSave = (
  outcome: TokenLimitSaveOutcome,
  kbLimitAfter?: number,
  regularLimitAfter?: number
): Said | null => {
  const said = [
    describeRelease(outcome.release, kbLimitAfter),
    describeRegularRelease(outcome.regularRelease, regularLimitAfter),
  ].filter((item): item is Said => item !== null);
  if (said.length === 0) return null;
  return {
    tone: said.some((item) => item.tone === 'warning') ? 'warning' : 'success',
    text: said.map((item) => item.text).join(' '),
  };
};

/**
 * After a SUCCESSFUL limit save: the toast (the save itself, plus what it did to paused KB work
 * and to the regular limit's notices), and a nudge so the bell re-reads its limit notices — the
 * save may have released one.
 */
export const toastLimitSaved = (
  title: string,
  outcome: TokenLimitSaveOutcome,
  kbLimitAfter?: number,
  regularLimitAfter?: number
): void => {
  window.dispatchEvent(new Event(TOKEN_LIMITS_SAVED_EVENT));
  const said = describeSave(outcome, kbLimitAfter, regularLimitAfter);
  if (!said) toast.success(title);
  else if (said.tone === 'warning') toast.warning(title, { description: said.text });
  else toast.success(title, { description: said.text });
};
