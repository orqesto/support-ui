import type { ExtraView, GiveExtraBody } from '@/services/budgets.service';

/**
 * Formatting and constants shared by the budget components. The API speaks money in integer
 * micro-dollars (1 USD = 1,000,000); the screens speak dollars ("≈ $12.40"). Tokens appear only as
 * the admins' secondary figure ("106M tokens") where the API gives them.
 */

/** Micro-dollars in one dollar. */
export const MICROS_PER_USD = 1_000_000;

/** Id of the Advanced card on Platform → AI Spend; the group page links to it. */
export const ADVANCED_ANCHOR = 'budget-advanced';

/** Extra amount slider range, dollars (step $1). */
export const EXTRA_MIN = 1;
export const EXTRA_MAX = 100;
export const EXTRA_STEP = 1;

/** How long a granted extra lasts: the choice sent to the API. */
export type ExtraEndChoice = GiveExtraBody['end'];
export const END_CHOICES: ReadonlyArray<{ value: ExtraEndChoice; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
];
/** The row shortcut gives the suggested extra for 3 days. */
export const QUICK_EXTRA_END: ExtraEndChoice = 3;

/** An own-bulk-limit slider never tops out below this, dollars (a group may have no budget). */
export const LIMIT_SLIDER_FLOOR = 10;

/**
 * Top of an own-bulk-limit slider, dollars: the biggest of the budget, the group's month
 * spend, the workspaces' current limits, twice their month spend and LIMIT_SLIDER_FLOOR, rounded
 * up to $5. So a group with no budget is not capped at 1M, an existing limit always fits, and a
 * workspace's spend is visible on the bar before a limit below it is saved. Takes micros, answers dollars.
 */
export const limitSliderTop = ({
  budget,
  groupSpend = 0,
  limits = [],
  spends = [],
}: {
  budget: number | null;
  groupSpend?: number;
  limits?: ReadonlyArray<number | null>;
  spends?: ReadonlyArray<number>;
}): number => {
  const micros = Math.max(
    budget ?? 0,
    groupSpend,
    ...limits.map((limit) => limit ?? 0),
    ...spends.map((spend) => 2 * spend),
    LIMIT_SLIDER_FLOOR * MICROS_PER_USD
  );
  return Math.ceil(micros / MICROS_PER_USD / 5) * 5;
};

/**
 * Money from micro-dollars: "≈ $12.40" (2 decimals). A positive amount under one cent is
 * "<$0.01", never "≈ $0.00" (it was spent). Thousands are grouped: "≈ $1,234.50".
 */
export const fmtMoney = (micros: number): string => {
  if (micros > 0 && micros < 10_000) return '<$0.01';
  const dollars = micros / MICROS_PER_USD;
  const text = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `≈ ${dollars < 0 ? '-' : ''}$${text}`;
};

/** Whole dollars from micros, for an input or slider: 12_400_000 -> 12.4. */
export const microsToDollars = (micros: number): number => micros / MICROS_PER_USD;

/** Dollars typed by a person -> micros (whole cents of a cent: rounded to a micro). */
export const dollarsToMicros = (dollars: number): number => Math.round(dollars * MICROS_PER_USD);

/** Input text for an amount in micros: "" for none, "12.4" for $12.40. */
export const dollarsText = (micros: number | null): string =>
  micros === null ? '' : String(Math.round(microsToDollars(micros) * 100) / 100);

/**
 * Dollars typed by a person -> micros. '' = null (none); NaN = not a positive number. Under one
 * micro (e.g. "0.0000001") is not a positive amount.
 */
export const parseDollars = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  const micros = dollarsToMicros(value);
  return micros > 0 ? micros : Number.NaN;
};

/** Whole tokens as "106M" / "1.2M" / "850K": the admins' secondary figure. */
export const fmtTokenCount = (tokens: number): string => {
  const abs = Math.abs(tokens);
  if (abs >= 1_000_000)
    return (abs >= 100_000_000 ? (tokens / 1e6).toFixed(0) : (tokens / 1e6).toFixed(1)) + 'M';
  if (abs >= 1_000) return (tokens / 1_000).toFixed(0) + 'K';
  return String(tokens);
};

export const grantEndsText = (end: ExtraEndChoice): string =>
  end === 'today' ? 'today' : `in ${end} days`;

/** Whole UTC calendar days from `now` to `endsAt` (0 = ends today). */
export const extraDaysLeft = (endsAt: string, now: number = Date.now()): number => {
  const day = (time: number) => Math.floor(time / 86_400_000);
  return Math.max(0, day(new Date(endsAt).getTime()) - day(now));
};

/** "ends in 3 d" / "ends today" for a running extra. */
export const extraEndsText = (endsAt: string, now?: number): string => {
  const days = extraDaysLeft(endsAt, now);
  return `ends ${days ? `in ${days} d` : 'today'}`;
};

/** Micros of an extra that are still unused. */
export const extraLeft = (extra: ExtraView | null): number =>
  extra ? Math.max(0, extra.amountMicros - extra.usedMicros) : 0;

export const clampPct = (pct: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, pct));
