import { fmtMoney } from '@/components/budget/budget.rules';
import { getErrorBody } from '@/lib/errorMessages';

/*
 * Free AI starter allowance (owner decision 2026-10-22): a one-time allowance on our AI key for a
 * Free workspace, about 100 messages' worth. It never resets; when it is used up AI pauses and the
 * workspace adds its own AI key (or upgrades).
 *
 * EVERYTHING the frontend knows about the wire shape lives in this file: the parsing of
 * `/api/usage/current` → `ai.starterAllowance`, the refusal codes, and the sentences.
 *
 * Backend contract (final, BE release punch list 2026-10-22):
 * - `ai.starterAllowance: { totalMicros, usedMicros, remainingMicros, exhausted } | null` — null
 *   when the workspace is not on Free. Sent for an own-key Free workspace too, where nothing is
 *   paused: `exhausted` alone is NOT "AI is paused".
 * - Used up on our key: `ai.paused=true`, `ai.reason='free_allowance_used'`, `ai.message` = the
 *   server's sentence.
 * - The allowance is `STARTER_ALLOWANCE_MESSAGES` (100) × the platform's microsPerMessage, and the
 *   response carries no microsPerMessage: one message = totalMicros / 100. A `microsPerMessage`
 *   on the block or on `ai` (not sent today) wins if a later backend adds it.
 * - Refusal codes: `FREE_AI_ALLOWANCE_USED` (translation 402 + stream error, AI test call 429),
 *   `AI_NOT_IN_PLAN`, `AI_BUDGET_PAUSED`, `AI_PAUSED`; `AI_USAGE_LIMIT_EXCEEDED` was the old
 *   translation code (older backend, kept for one release).
 * An older backend sends no field: nothing new is shown.
 *
 * Two allowances (BE #1112, owner decision 2026-10-23 #1): the live-mail one above and a second,
 * one-time allowance for knowledge-base processing and history import:
 * - `ai.kbStarterAllowance`: the same shape or null (no messages figure: a percentage).
 * - `ai.kbPaused` + `ai.kbMessage`: the KB allowance is used up on our key. History import and KB
 *   building continue without our AI; live mail keeps its own allowance (`paused` stays false).
 * - `ai.unavailableReason: 'admin_not_verified' | 'own_key_required' | null`: a Free workspace with
 *   no AI at all; both allowances are then null (they are sent only while it runs on our AI).
 * - Refusal codes `FREE_KB_ALLOWANCE_USED` (gate verdict) and `AI_ADMIN_NOT_VERIFIED` (403 from
 *   translation and enhance-ticket). The words are ours (server sentences stay English, M7).
 */

export type StarterAllowance = {
  totalMicros: number;
  usedMicros: number;
  remainingMicros: number;
  exhausted: boolean;
  /** Money one message carries (micros); absent ⇒ the line shows a percentage. */
  microsPerMessage?: number;
};

/** The refusal code of an AI call made after the allowance is used up. */
export const FREE_AI_ALLOWANCE_USED = 'FREE_AI_ALLOWANCE_USED';

/** The refusal code of a bulk / knowledge-base AI call after the KB allowance is used up. */
export const FREE_KB_ALLOWANCE_USED = 'FREE_KB_ALLOWANCE_USED';

/** 403: a key-less Free workspace whose admins have not verified their email address. */
export const AI_ADMIN_NOT_VERIFIED = 'AI_ADMIN_NOT_VERIFIED';

/** `ai.reason` when the allowance is used up on our key. */
export const FREE_ALLOWANCE_REASON = 'free_allowance_used';

/** Messages in the allowance (backend `STARTER_ALLOWANCE_MESSAGES`). */
export const STARTER_ALLOWANCE_MESSAGES = 100;

/**
 * Codes of an AI refusal: AI pauses, mail and agents keep working. None of them may raise the
 * app-wide subscription gate on a 402 (api-client).
 */
export const AI_REFUSAL_CODES: readonly string[] = [
  FREE_AI_ALLOWANCE_USED,
  FREE_KB_ALLOWANCE_USED,
  AI_ADMIN_NOT_VERIFIED,
  'AI_NOT_IN_PLAN',
  'AI_BUDGET_PAUSED',
  'AI_PAUSED',
  // Older backend's translation code; drop one release after the starter allowance ships.
  'AI_USAGE_LIMIT_EXCEEDED',
];

/** The route of the workspace's own AI key settings (Settings › Integrations › AI Providers). */
export const AI_KEY_SETTINGS_PATH = '/settings#integrations/ai-providers';

/** The Free plan's AI line on in-app plan cards and the switch-to-Free dialog. */
export const FREE_PLAN_AI_LINE = 'Your own AI key, with a starter allowance of AI on us';

export const STARTER_USED_ADMIN_TEXT =
  'Your free AI allowance is used — add your own AI key to keep AI running.';
export const STARTER_USED_AGENT_TEXT =
  'Your free AI allowance is used — ask your admin to add your own AI key to keep AI running.';

export const KB_USED_ADMIN_TEXT =
  'Your free AI allowance for the knowledge base and history import is used. Add your own AI key to process more history. AI for new mail keeps running.';
export const KB_USED_AGENT_TEXT =
  'The free AI allowance for the knowledge base and history import is used. AI for new mail keeps running. Ask your admin to add your own AI key.';

/** Why a Free workspace has no AI at all (`ai.unavailableReason`). */
export type AiUnavailableReason = 'admin_not_verified' | 'own_key_required';

export const ADMIN_NOT_VERIFIED_ADMIN_TEXT =
  'Verify your email address to use the free AI allowance — or add your own AI key.';
export const ADMIN_NOT_VERIFIED_AGENT_TEXT =
  'AI is off until a workspace admin verifies their email address or adds an AI key.';
export const OWN_KEY_REQUIRED_ADMIN_TEXT = 'Add your own AI key to use AI.';
export const OWN_KEY_REQUIRED_AGENT_TEXT = 'AI is off until a workspace admin adds an AI key.';

/** The sentence for `ai.unavailableReason`; undefined for no (or an unknown) reason. */
export const unavailableText = (
  reason: string | null | undefined,
  isAdmin: boolean
): string | undefined => {
  switch (reason) {
    case 'admin_not_verified':
      return isAdmin ? ADMIN_NOT_VERIFIED_ADMIN_TEXT : ADMIN_NOT_VERIFIED_AGENT_TEXT;
    case 'own_key_required':
      return isAdmin ? OWN_KEY_REQUIRED_ADMIN_TEXT : OWN_KEY_REQUIRED_AGENT_TEXT;
    default:
      return undefined;
  }
};

/** `ai.unavailableReason` when it is one we know; anything else (older backend) ⇒ undefined. */
export const parseUnavailableReason = (ai: unknown): AiUnavailableReason | undefined => {
  const value =
    ai && typeof ai === 'object'
      ? (ai as { unavailableReason?: unknown }).unavailableReason
      : undefined;
  return value === 'admin_not_verified' || value === 'own_key_required' ? value : undefined;
};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * The allowance from the `ai` block, or undefined when absent or malformed (an older backend, a
 * shape we do not know). Never throws.
 */
const parseAllowanceBlock = (
  block: unknown
): Omit<StarterAllowance, 'microsPerMessage'> | undefined => {
  if (!block || typeof block !== 'object') return undefined;
  const raw = block as Record<string, unknown>;
  const { totalMicros, usedMicros, remainingMicros } = raw;
  if (!isCount(totalMicros) || totalMicros <= 0) return undefined;
  if (!isCount(usedMicros) || !isCount(remainingMicros)) return undefined;
  return {
    totalMicros,
    usedMicros,
    remainingMicros,
    exhausted: typeof raw.exhausted === 'boolean' ? raw.exhausted : remainingMicros <= 0,
  };
};

/**
 * The knowledge-base allowance (`ai.kbStarterAllowance`), or undefined when null, absent or
 * malformed. It carries no messages figure: its line shows a percentage.
 */
export const parseKbStarterAllowance = (ai: unknown): StarterAllowance | undefined => {
  if (!ai || typeof ai !== 'object') return undefined;
  return parseAllowanceBlock((ai as { kbStarterAllowance?: unknown }).kbStarterAllowance);
};

export const parseStarterAllowance = (ai: unknown): StarterAllowance | undefined => {
  if (!ai || typeof ai !== 'object') return undefined;
  const block = (ai as { starterAllowance?: unknown }).starterAllowance;
  const parsed = parseAllowanceBlock(block);
  if (!parsed) return undefined;
  const raw = block as Record<string, unknown>;
  const { totalMicros } = parsed;
  const sent = raw.microsPerMessage ?? (ai as { microsPerMessage?: unknown }).microsPerMessage;
  // The response carries none today: the allowance is 100 messages, so one is a hundredth of it.
  const perMessage = isCount(sent) && sent > 0 ? sent : totalMicros / STARTER_ALLOWANCE_MESSAGES;
  return { ...parsed, microsPerMessage: perMessage };
};

/**
 * "AI starter allowance: about 63 of 100 messages left." Agents read messages only; admins also
 * read the money. Without microsPerMessage: "about 63% left".
 */
export const starterAllowanceLine = (allowance: StarterAllowance, isAdmin: boolean): string => {
  const money = isAdmin
    ? ` (${fmtMoney(allowance.exhausted ? 0 : allowance.remainingMicros)} of ${fmtMoney(allowance.totalMicros).replace(/^≈ /, '')} left)`
    : '';
  if (allowance.exhausted || allowance.remainingMicros <= 0) {
    return `AI starter allowance: used up${money}.`;
  }
  const perMessage = allowance.microsPerMessage;
  if (perMessage) {
    const total = Math.max(1, Math.round(allowance.totalMicros / perMessage));
    const left = Math.min(total, Math.round(allowance.remainingMicros / perMessage));
    // Under half a message left is not "about 0": some allowance still remains.
    if (left < 1) {
      return `AI starter allowance: less than 1 of ${total.toLocaleString()} messages left${money}.`;
    }
    return `AI starter allowance: about ${left.toLocaleString()} of ${total.toLocaleString()} messages left${money}.`;
  }
  const pct = Math.min(100, Math.round((allowance.remainingMicros / allowance.totalMicros) * 100));
  return `AI starter allowance: about ${pct}% left${money}.`;
};

/**
 * "Knowledge base and history import allowance: about 63% left." Admins also read the money.
 */
export const kbAllowanceLine = (allowance: StarterAllowance, isAdmin: boolean): string => {
  const money = isAdmin
    ? ` (${fmtMoney(allowance.exhausted ? 0 : allowance.remainingMicros)} of ${fmtMoney(allowance.totalMicros).replace(/^≈ /, '')} left)`
    : '';
  const label = 'AI allowance for the knowledge base and history import';
  if (allowance.exhausted || allowance.remainingMicros <= 0) return `${label}: used up${money}.`;
  const pct = Math.min(100, Math.round((allowance.remainingMicros / allowance.totalMicros) * 100));
  if (pct < 1) return `${label}: less than 1% left${money}.`;
  return `${label}: about ${pct}% left${money}.`;
};

/** AI is paused because the allowance is used up on our key (never for an own-key Free workspace). */
export const isStarterPaused = (ai: { paused?: boolean; reason?: string | null } | undefined) =>
  ai?.paused === true && ai.reason === FREE_ALLOWANCE_REASON;

/** True for an AI refusal made because the starter allowance is used up. */
export const isFreeAiAllowanceUsedError = (err: unknown): boolean =>
  getErrorBody(err)?.code === FREE_AI_ALLOWANCE_USED;

/**
 * The sentence for an AI action refused with one of AI_REFUSAL_CODES (compose polish / generate,
 * enhance-ticket, translation — a 402 or a 429 alike: the CODE decides, never the status).
 * Agents read sentences that offer nothing they cannot do ("ask your admin"); admins read the
 * server's sentence (money-free by contract) or the fixed admin one. undefined ⇒ not an AI refusal:
 * the caller keeps its own handling.
 */
export const aiRefusalText = (err: unknown, isAdmin: boolean): string | undefined => {
  const body = getErrorBody(err) as
    | { code?: unknown; error?: unknown; message?: unknown }
    | undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  if (!code || !AI_REFUSAL_CODES.includes(code)) return undefined;
  const serverText =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : undefined;
  switch (code) {
    case FREE_AI_ALLOWANCE_USED:
      return isAdmin ? (serverText ?? STARTER_USED_ADMIN_TEXT) : STARTER_USED_AGENT_TEXT;
    // Our words for the two newer codes (M7: the server's sentences stay English).
    case FREE_KB_ALLOWANCE_USED:
      return isAdmin ? KB_USED_ADMIN_TEXT : KB_USED_AGENT_TEXT;
    case AI_ADMIN_NOT_VERIFIED:
      return isAdmin ? ADMIN_NOT_VERIFIED_ADMIN_TEXT : ADMIN_NOT_VERIFIED_AGENT_TEXT;
    case 'AI_NOT_IN_PLAN':
      return isAdmin
        ? (serverText ?? 'AI is not included in your plan. Upgrade, or connect your own AI key.')
        : 'AI is not included in your plan. Ask your admin to upgrade or connect your own AI key.';
    default:
      // AI_BUDGET_PAUSED, AI_PAUSED, the old AI_USAGE_LIMIT_EXCEEDED: the server's budget sentence
      // can offer buying ("Buying more messages or upgrading adds to it"), so agents get this one.
      return isAdmin
        ? (serverText ?? 'AI is paused for now.')
        : 'AI is paused for this workspace right now. Ask your admin if you need it.';
  }
};
