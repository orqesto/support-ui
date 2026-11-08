/**
 * The tickets feature (ticket list, kanban, detail, create/edit chrome, ticket threads, the
 * tickets store and services). This file is its only public entry: code outside
 * `src/features/tickets/` imports from `@/features/tickets`, never a deep path (ESLint
 * `boundaries/api-only-features`). Export only what pages or other features use. Files inside
 * the feature import each other directly, never through this index.
 */
export {
  CreateTicketBar,
  CreateTicketFilesSection,
  CreateTicketJiraOption,
  CreateTicketQuote,
} from './components/CreateTicketChrome';
export { NewTicketButton } from './components/NewTicketButton';
export { pickUploadableFiles } from './components/NewTicketFiles';
export { TicketDetail } from './components/TicketDetail';
export { TicketRef } from './components/TicketRef';
export { TicketThreadPicker } from './components/TicketThreadPicker';
export { TicketDeleteDialog, TicketSyncAllDialog } from './components/TicketsJiraDialogs';
export { TicketsKanbanView } from './components/TicketsKanbanView';
export { TicketsViewToggle } from './components/TicketsViewToggle';
export { useTicketOwners } from './components/useTicketOwners';
export { TicketFilterBar } from './components/list/TicketFilterBar';
export { TicketPanel } from './components/list/TicketPanel';
export { TicketRowMenuItems } from './components/list/TicketRowMenuItems';
export { TicketTable } from './components/list/TicketTable';
export { TicketViewPills } from './components/list/TicketViewPills';
export { buildTicketFilterKeys } from './components/list/ticketFilterKeys';
export { PriorityIcon } from './components/list/ticketRowBits';
export { useNewTicketsBar } from './components/list/useNewTicketsBar';
export { useSearchBoxText } from './components/list/useSearchBoxText';
export { useTicketFilterSources } from './components/list/useTicketFilterSources';
export { useTicketJiraActions } from './components/list/useTicketJiraActions';
export { useTicketKeys } from './components/list/useTicketKeys';
export { useTicketListPrefs } from './components/list/useTicketListPrefs';
export { useTicketViews } from './components/list/useTicketViews';
export { useTicketsRealtime } from './hooks/useTicketsRealtime';
export { useTicketsUrlSync } from './hooks/useTicketsUrlSync';
export { ticketApiFilters } from './lib/ticketFilters';
export { viewFiltersOf } from './lib/ticketViews';
export { categoryService } from './services/category.service';
export { threadRowMessage, type ThreadCandidate } from './services/threadCandidates.service';
export { ticketDraftsService } from './services/ticketDrafts.service';
export { ticketRepliesService } from './services/ticketReplies.service';
export {
  fetchTicketViewCounts,
  ticketService,
  type PaginationMeta,
} from './services/ticket.service';
export {
  ticketThreadsService,
  type ThreadTicket,
  type TicketThread,
} from './services/ticketThreads.service';
export {
  THREAD_TICKETS_CHANGED,
  announceThreadTicketsChanged,
} from './services/ticketThreadsEvents';
export {
  defaultFilters,
  ticketsCacheKey,
  useTicketsStore,
  type TicketFilters,
  type TicketOwesFilter,
  type TicketSortBy,
  type TicketSorting,
  type TicketThreadsFilter,
  type TicketUpdatedFilter,
} from './stores/ticketsStore';
