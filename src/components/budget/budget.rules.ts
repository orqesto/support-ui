import type { ExtraView, GiveExtraBody } from '@/services/budgets.service';

/**
 * Formatting and constants shared by the budget components. The API speaks tokens; the screens
 * speak million tokens ("106M"). Moved here from the budget model demo's rules.
 */

/** $ per 1M tokens: Haiku 5.5 list price ($0.10 in / $0.50 out per 1M) at a 92.5% input mix. */
export const PRICE_PER_MILLION = 0.925 * 0.1 + 0.075 * 0.5;

export const MILLION = 1_000_000;

/** Id of the Advanced card on Platform → AI Spend; the group page links to it. */
export const ADVANCED_ANCHOR = 'budget-advanced';

/** Extra amount slider range, million tokens. */
export const EXTRA_MIN = 5;
export const EXTRA_MAX = 200;

/** How long a granted extra lasts: the choice sent to the API. */
export type ExtraEndChoice = GiveExtraBody['end'];
export const END_CHOICES: ReadonlyArray<{ value: ExtraEndChoice; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
];
/** The row shortcut gives the suggested extra for 3 days. */
export const QUICK_EXTRA_END: ExtraEndChoice = 3;

/** An own-bulk-limit slider never tops out below this, million tokens (a group may have no budget). */
export const LIMIT_SLIDER_FLOOR = 50;

/**
 * Top of an own-bulk-limit slider, million tokens: the biggest of the budget, the group's month
 * spend, the workspaces' current limits, twice their month spend and LIMIT_SLIDER_FLOOR, rounded
 * up to 5M. So a group with no budget is not capped at 1M, an existing limit always fits, and a
 * workspace's spend is visible on the bar before a limit below it is saved. Takes tokens.
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
  const tokens = Math.max(
    budget ?? 0,
    groupSpend,
    ...limits.map((limit) => limit ?? 0),
    ...spends.map((spend) => 2 * spend),
    LIMIT_SLIDER_FLOOR * MILLION
  );
  return Math.ceil(tokens / MILLION / 5) * 5;
};

/** Million tokens: "106M", "28.0M". */
export const fmt = (millions: number): string =>
  (Math.abs(millions) >= 100 ? millions.toFixed(0) : millions.toFixed(1)) + 'M';

/** "≈ $0.48" / "≈ $40". */
export const usd = (millions: number): string => {
  const dollars = millions * PRICE_PER_MILLION;
  return '≈ $' + (dollars >= 10 ? dollars.toFixed(0) : dollars.toFixed(2));
};

/** Tokens as "106M". */
export const fmtTokens = (tokens: number): string => fmt(tokens / MILLION);
export const usdTokens = (tokens: number): string => usd(tokens / MILLION);

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

/** Tokens of an extra that are still unused. */
export const extraLeft = (extra: ExtraView | null): number =>
  extra ? Math.max(0, extra.tokens - extra.used) : 0;

export const clampPct = (pct: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, pct));
