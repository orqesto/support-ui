import { fmtMoney } from '@/components/budget/budget.rules';
import { getErrorBody } from '@/lib/errorMessages';

/*
 * Free AI starter allowance (owner decision 2026-10-22): a one-time allowance on our AI key for a
 * Free workspace, about 100 messages' worth. It never resets; when it is used up AI pauses and the
 * workspace adds its own AI key (or upgrades).
 *
 * EVERYTHING the frontend knows about the wire shape lives in this file: the parsing of
 * `/api/usage/current` → `ai.starterAllowance`, the refusal code, and the sentences. Adjust here
 * when the backend contract settles.
 *
 * Contract (2026-10-22, backend built in parallel):
 *   `ai.starterAllowance?: { totalMicros, usedMicros, remainingMicros, exhausted }` — present only
 *   on Free on our key. `microsPerMessage` may come with it (on the block or on `ai`); without it
 *   the line shows a percentage. An AI refusal can carry code `FREE_AI_ALLOWANCE_USED`.
 * An older backend sends no field: nothing new is shown.
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

/** The route of the workspace's own AI key settings (Settings › Integrations › AI Providers). */
export const AI_KEY_SETTINGS_PATH = '/settings#integrations/ai-providers';

/** The Free plan's AI line on in-app plan cards and the switch-to-Free dialog. */
export const FREE_PLAN_AI_LINE = 'Your own AI key, with a starter allowance of AI on us';

export const STARTER_USED_ADMIN_TEXT =
  'Your free AI allowance is used — add your own AI key to keep AI running.';
export const STARTER_USED_AGENT_TEXT =
  'Your free AI allowance is used — ask your admin to add your own AI key to keep AI running.';

/** An AI action refused with FREE_AI_ALLOWANCE_USED, where the viewer's role is not known. */
export const STARTER_USED_REFUSAL_TEXT =
  'Your free AI allowance is used — an admin can add your own AI key to keep AI running.';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * The allowance from the `ai` block, or undefined when absent or malformed (an older backend, a
 * shape we do not know). Never throws.
 */
export const parseStarterAllowance = (ai: unknown): StarterAllowance | undefined => {
  if (!ai || typeof ai !== 'object') return undefined;
  const block = (ai as { starterAllowance?: unknown }).starterAllowance;
  if (!block || typeof block !== 'object') return undefined;
  const raw = block as Record<string, unknown>;
  const { totalMicros, usedMicros, remainingMicros } = raw;
  if (!isCount(totalMicros) || totalMicros <= 0) return undefined;
  if (!isCount(usedMicros) || !isCount(remainingMicros)) return undefined;
  const perMessage = raw.microsPerMessage ?? (ai as { microsPerMessage?: unknown }).microsPerMessage;
  return {
    totalMicros,
    usedMicros,
    remainingMicros,
    exhausted: typeof raw.exhausted === 'boolean' ? raw.exhausted : remainingMicros <= 0,
    ...(isCount(perMessage) && perMessage > 0 ? { microsPerMessage: perMessage } : {}),
  };
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
    return `AI starter allowance: about ${left.toLocaleString()} of ${total.toLocaleString()} messages left${money}.`;
  }
  const pct = Math.min(100, Math.round((allowance.remainingMicros / allowance.totalMicros) * 100));
  return `AI starter allowance: about ${pct}% left${money}.`;
};

/** True for an AI refusal made because the starter allowance is used up. */
export const isFreeAiAllowanceUsedError = (err: unknown): boolean =>
  getErrorBody(err)?.code === FREE_AI_ALLOWANCE_USED;
