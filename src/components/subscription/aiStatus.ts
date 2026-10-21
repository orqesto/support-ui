import { fmtMoney } from '@/components/budget/budget.rules';

/** Why the API says AI is stopped (`/api/usage/current` → `ai.reason`). */
export type AiPauseReason =
  | 'not_in_plan'
  | 'server_ceiling'
  | 'budget_used'
  | 'bulk_share_used'
  | 'workspace_bulk_limit';

/** `ai` block of `GET /api/usage/current`. Optional on the wire: an older backend sends none. */
export type AiStatus = {
  currency: 'USD';
  /** The money budgets are switched on; false ⇒ the figures are null. */
  active: boolean;
  usedMicros: number | null;
  budgetMicros: number | null;
  /** Live AI is stopped. */
  paused: boolean;
  /** Only history import / KB building are stopped. */
  bulkPaused: boolean;
  reason: AiPauseReason | null;
  /** The reason as a sentence, from the API. */
  message: string | null;
  resetsAt: string | null;
};

/** The words an admin may see: "≈ $4.20 of ≈ $5.00". Null when the API gave no figures. */
export const adminMoneyDetail = (ai: AiStatus): string | null =>
  ai.usedMicros !== null && ai.budgetMicros !== null
    ? `${fmtMoney(ai.usedMicros)} of ${fmtMoney(ai.budgetMicros)}`
    : null;

/**
 * An own-key workspace has no AI allowance of ours: budgets are on, nothing is paused and there
 * is no budget for it. (Before budgets are applied `active` is false: nothing to say yet.)
 */
export const runsOnOwnKey = (ai: AiStatus | undefined): boolean =>
  !!ai && ai.active && ai.budgetMicros === null && !ai.paused;
