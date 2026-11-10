/**
 * The subscription feature (plan and billing cards, AI budgets, pricing cards, the subscription
 * gate). This file is its only public entry: code outside `src/features/subscription/` imports from
 * `@/features/subscription`, never a deep path (ESLint `boundaries/api-only-features`). Export only
 * what pages or other features use.
 */
export { ActiveSubscriptionsTable } from './components/ActiveSubscriptionsTable';
export { AddPaymentMethodDialog } from './components/AddPaymentMethodDialog';
export { AgingReport } from './components/AgingReport';
export { AiPausedBanner } from './components/AiPausedBanner';
export { AiUnavailableNotice } from './components/AiUnavailableNotice';
export { AnomalyAlertsList } from './components/AnomalyAlertsList';
export { BillingOverviewCards } from './components/BillingOverviewCards';
export { BudgetBar } from './components/BudgetBar';
export { BudgetField } from './components/BudgetField';
export { BudgetGroupView } from './components/BudgetGroupView';
export { BulkLimitField, FieldLabel } from './components/BulkLimitField';
export { CheckoutSessionForm } from './components/CheckoutSessionForm';
export { ExtraBox } from './components/ExtraBox';
export { FreePlanActiveCard } from './components/FreePlanActiveCard';
export { KbPausedBanner } from './components/KbPausedBanner';
export { KeepActiveDialog } from './components/KeepActiveDialog';
export { MessagePackOfferCard } from './components/MessagePackOfferCard';
export { aiSourceFrom, MessagesSummary, TRIAL_SENTENCE } from './components/MessagesSummary';
export { PastDueCard } from './components/PastDueCard';
export { PlanLimitsCard } from './components/PlanLimitsCard';
export { PlanOverLimitNote } from './components/PlanOverLimitNote';
export {
  BasePlanCard,
  EnterprisePlanCard,
  historyImportAiNote,
  type Plan,
  planHasManagedAi,
} from './components/PricingPlanCard';
export { RequestExtraBox } from './components/RequestExtraBox';
export { StarterAllowanceLine } from './components/StarterAllowanceLine';
export { StatusText } from './components/StatusText';
export { SubscriptionGateOverlay } from './components/SubscriptionGateOverlay';
export { type UsageItem, UsageTile } from './components/UsageTile';
export { type AiStatus, loadAiKeyState, loadAiStatus } from './components/aiStatus';
export { billingDateLine } from './components/billingDateLine';
export {
  ADVANCED_ANCHOR,
  dollarsText,
  dollarsToMicros,
  type ExtraEndChoice,
  extraEndsText,
  fmtMoney,
  fmtTokenCount,
  parseDollars,
} from './components/budget.rules';
export {
  cancelConfirmText,
  cancelledToast,
  MOVES_TO_FREE_SENTENCE,
  PAST_DUE_AGENT_TEXT,
  PAST_DUE_TEXT,
} from './components/cancelCopy';
export { isOverPlan } from './components/keepActive';
export { describeUsagePeriod } from './components/usagePeriodCopy';
export { useAiRefusalText } from './components/useAiRefusalText';
export { useMessagePackReturn } from './components/useMessagePackReturn';
export {
  useAllianceBudget,
  useApplyMigration,
  useBudgetGroup,
  useBudgetGroups,
  useBudgetMigration,
  useBudgetState,
  useDeclineRequest,
  useEndExtra,
  useGiveExtra,
  useMyAiUsage,
  useRequestAllianceExtra,
  useRequestMyExtra,
  useSetAllianceMode,
  useSetAllianceWorkspaceLimits,
  useSetGroupMode,
  useSetWorkspaceLimits,
  useUpdateAllianceBudget,
  useUpdateBudgetGroup,
  useUpdateBudgetSettings,
  useUpdateMyBudget,
} from './hooks/useBudgets';
export {
  type BudgetMigration,
  type BudgetSettingsView,
  type BudgetsInactive,
  type BudgetState,
  type BudgetStateResult,
  type ExtraView,
  type FreeAllowanceView,
  type GroupDetail,
  type GroupListParams,
  type GroupPage,
  type GroupSummary,
  type MigrationBasis,
  type MigrationOverrides,
  type MigrationRow,
  parseFreeAllowanceView,
  type RequestRow,
  type SettingsUpdate,
  type WorkspaceBudgetUpdate,
  type WorkspaceRow,
  type WorkspaceUsage,
} from './services/budgets.service';
export {
  aiRefusalText,
  FREE_AI_ALLOWANCE_USED,
  FREE_SWITCH_DESCRIPTION,
  kbAllowanceLine,
  type StarterAllowance,
  starterAllowanceLine,
} from './components/starterAllowance';
