/**
 * The knowledge-base feature (KB list, entry drawer, decisions, consolidation cases, quality
 * review, auto actions, engine activity, questions, documentation and the KB services). This
 * file is its only public entry: code outside `src/features/kb/` imports from `@/features/kb`,
 * never a deep path (ESLint `boundaries/api-only-features`). Export only what pages or other
 * features use. Files inside the feature import each other directly, never through this index.
 */
export { ConfluenceCatalogSection } from './components/ConfluenceCatalogSection';
export { KBDeleteDialog } from './components/KBDeleteDialog';
export { KBEntryCard } from './components/KBEntryCard';
export { KBEntryDetail } from './components/KBEntryDetail';
export { KBTableView } from './components/KBTableView';
export { bulkModeFor, KbBulkDecisionBar } from './components/KbBulkDecisionBar';
export { summarizeKbMerge } from './components/KbConsolidationReview';
export { KbDecisionDialog } from './components/KbDecisionDialog';
export { KbExportButton } from './components/KbExportButton';
export { KbFindingBanner } from './components/KbFindingBanner';
export { kbIdMatchHint, KbIdMatchHint } from './components/KbIdMatchHint';
export { KbSplitCaseHint, kbSplitCaseText } from './components/KbSplitCaseHint';
export { KbCaseActionConfirmText } from './components/KbCaseActionConfirmText';
export { CANNOT_DECIDE } from './components/KbPendingDecisionBadge';
export { KB_FILTER_STATUS_LABEL } from './components/KbStatusFilter';
export {
  isNewStatus,
  KB_STATUS_IGNORED_NOTICE,
  KbStatusIgnoredNotice,
} from './components/KbStatusIgnoredNotice';
export { KbEngineActivity } from './components/activity/KbEngineActivity';
export { KbAutoActionsButton } from './components/autoActions/KbAutoActionsButton';
export { KbAutoActionsPanel } from './components/autoActions/KbAutoActionsPanel';
export { AUTO_ACTIONS_HREF } from './components/autoActions/kbAutoActionCopy';
export { confirmKbDelete, makeKbRestoreDeleted } from './components/kbRestoreDeleted';
export { KbMoreFilters } from './components/page/KbMoreFilters';
export {
  KbDecideNotice,
  KbEngineOffNotice,
  KbQuestionsView,
  KbStillLearning,
} from './components/page/KbPageStates';
export { type KbListType, KbPageToolbar } from './components/page/KbPageToolbar';
export { useKbTeams } from './components/page/KbTeamFilter';
export {
  entryFailureAlert,
  kbExportFilters,
  type KbPageView,
  kbPageViewFromSearch,
  kbQuestionFromSearch,
  kbQuestionsTeamFromSearch,
  kbSearchForView,
  liveDefaultStatus,
} from './components/page/kbPageView';
export { useKbDecideLink } from './components/page/useKbDecideLink';
export { useKbEngineSummary } from './components/page/useKbEngineSummary';
export { useKbPageView } from './components/page/useKbPageView';
export { isOlderThan7d } from './components/questions/useKbQuestions';
export { CASE_ACTION_TITLES, LEFT_PAGE, runCaseAction } from './components/runCaseAction';
export { useKbAutoRestore } from './components/useKbAutoRestore';
export { useKbUnhide } from './components/useKbUnhide';
export {
  resetAutoActionsAvailability,
  useAutoActionsAvailable,
} from './hooks/useAutoActionsAvailable';
export { useKbAutoChangedSupport } from './hooks/useKbAutoChangedSupport';
export { useKbBulkDecisions } from './hooks/useKbBulkDecisions';
export { useKbEntryParam } from './hooks/useKbEntryParam';
export { useKbFindingFilter } from './hooks/useKbFindingFilter';
export { useKbStatusParam } from './hooks/useKbStatusParam';
export { useKbCaseOriginals } from './hooks/useKbCaseOriginals';
export { isCaseRow, unmergeConsequence } from './lib/kbConsolidation';
export type { KbFilterStatus } from './lib/kbFilterStatus';
export { kbFindingFromSearch, kbFindingHref, withoutKbFinding } from './lib/kbFinding';
export { summarizeKbQuality } from './lib/kbQuality';
export {
  type Documentation,
  type DocumentationProgress,
  documentationService,
  type DocumentType,
} from './services/documentation.service';
export {
  type KBEntry,
  type KbFinding,
  type KbIdMatch,
  type KbMiningForecast,
  type KbPendingDecision,
  type KbSplitCase,
  kbService,
  kbSourceParam,
  normaliseIdMatch,
  normaliseSplitCase,
  type PaginationMeta,
} from './services/kb.service';
export type { KbConsolidationRunState } from './services/kbConsolidation.service';
export type { KbEngineSummary, KbQuestion } from './services/kbEngine.types';
