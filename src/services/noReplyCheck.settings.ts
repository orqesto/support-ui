import { isRecord } from '@/lib/isRecord';
import { readBounded, sourceOf } from './boundedFieldRead';
import type { BoundedField } from './resolvedField';

/**
 * "No reply needed" (`ai.no_reply_check`, backend noReplyCheckSetting.ts): an email that only
 * thanks or confirms gets no AI draft. Two whole-number limits and the model's wording, as GET
 * answers and PUT takes them, and the GET reader.
 */
export const NO_REPLY_CHECK_NUMBERS = ['ownTextMaxChars', 'inlineLogoMaxBytes'] as const;
export type NoReplyCheckNumber = (typeof NO_REPLY_CHECK_NUMBERS)[number];
/**
 * Times in milliseconds (backend #1613): how long a keyword rule's reply to a short thank-you waits
 * for the AI's verdict, the longest it waits in total, and the time limit of the follow-up question
 * when the AI leaves its answer out. Optional: a backend before #1613 does not send them.
 */
export const NO_REPLY_CHECK_TIMES = [
  'keywordReplyDeferMs',
  'keywordReplyMaxWaitMs',
  'repairTimeoutMs',
] as const;
export type NoReplyCheckTime = (typeof NO_REPLY_CHECK_TIMES)[number];
/** A wording with its source and allowed length. */
export type NoReplyInstructions = {
  value: string;
  source: BoundedField['source'];
  minLength: number;
  maxLength: number;
};
/** GET `drafts.noReplyCheck`. */
export type NoReplyCheckSettings = Record<NoReplyCheckNumber, BoundedField> &
  Partial<Record<NoReplyCheckTime, BoundedField>> & {
    instructions: NoReplyInstructions;
    /** The follow-up question's wording (backend #1613); absent on an older backend. */
    repairInstructions?: NoReplyInstructions;
  };
/**
 * PUT `noReplyCheck`: any non-empty subset; the server merges it over the saved row. `null`
 * removes a saved field — back to the default, which then follows later releases.
 */
export type NoReplyCheckInput = Partial<
  Record<NoReplyCheckNumber | NoReplyCheckTime, number | null>
> & {
  instructions?: string | null;
  repairInstructions?: string | null;
};

const readWording = (wording: unknown): NoReplyInstructions | undefined =>
  isRecord(wording) &&
  typeof wording.value === 'string' &&
  typeof wording.minLength === 'number' &&
  typeof wording.maxLength === 'number'
    ? {
        value: wording.value,
        source: sourceOf(wording.source),
        minLength: wording.minLength,
        maxLength: wording.maxLength,
      }
    : undefined;

/**
 * GET `drafts.noReplyCheck`: both limits and the wording well-formed — or absent (older backend).
 * The times and the follow-up wording are kept only when well-formed; an older backend sends none.
 */
export const readNoReplyCheck = (raw: unknown): NoReplyCheckSettings | undefined => {
  if (!isRecord(raw)) return undefined;
  // One rule with every console reader: a source this build does not know reads as 'default'
  // (readBounded); the backend sends only db / env / default.
  const numbers = NO_REPLY_CHECK_NUMBERS.map((key) => [key, readBounded(raw[key])] as const);
  const instructions = readWording(raw.instructions);
  if (!numbers.every(([, field]) => field) || !instructions) return undefined;
  const times = NO_REPLY_CHECK_TIMES.map((key) => [key, readBounded(raw[key])] as const).filter(
    (entry): entry is readonly [NoReplyCheckTime, BoundedField] => entry[1] !== undefined
  );
  const repairInstructions = readWording(raw.repairInstructions);
  return {
    ...Object.fromEntries(numbers),
    ...Object.fromEntries(times),
    instructions,
    ...(repairInstructions ? { repairInstructions } : {}),
  } as NoReplyCheckSettings;
};
