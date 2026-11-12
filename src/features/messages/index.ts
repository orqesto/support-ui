/**
 * The messages feature: threads list and board, thread detail and composer, filters, bulk
 * actions, custom-API lookup panels in a thread, the similar-messages dialog, and the list chrome
 * (column menu, live badge, view pills, new-items bar). This file is its public entry for UI:
 * code outside `src/features/messages/` imports from `@/features/messages` (or `./shell` for
 * small non-UI pieces), never a deep path (ESLint `boundaries/api-only-features`). Files inside
 * the feature import each other directly, never through this index.
 */
export { ContactsView } from './components/ContactsView';
export { DeleteMessageDialog } from './components/DeleteMessageDialog';
export { MessageDetail } from './components/MessageDetail';
export { MessageListItem } from './components/MessageListItem';
export type { MessagesKanbanHandle } from './components/MessagesKanbanView';
export { MessagesListCaption } from './components/MessagesListCaption';
export { MessagesViewToggle } from './components/MessagesViewToggle';
export { ThreadBubble } from './components/ThreadBubble';
export { BulkActionBar } from './components/bulk/BulkActionBar';
export { BulkConfirmDialog, type BulkConfirmValues } from './components/bulk/BulkConfirmDialog';
export { BULK_MERGE_MAX, BulkMergeDialog } from './components/bulk/BulkMergeDialog';
export { describeResult } from './components/bulk/bulkResultMessage';
export type { ToggleSelected } from './components/bulk/selectMode';
export { useSelectionShortcuts } from './components/bulk/selectionShortcuts';
export { useBulkSelection } from './components/bulk/useBulkSelection';
export { buildContactsApiFilters } from './components/contactsApiFilters';
export { neighbourThread } from './components/detailShortcuts';
export { MessageFilterBar } from './components/filters/MessageFilterBar';
export { SurfaceCount } from './components/filters/SurfaceCount';
export { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from './components/filters/filterSchema';
export { useFilterOptions } from './components/filters/useFilterOptions';
export { OutsideViewMatches } from './components/list/OutsideViewMatches';
export { ThreadTableHeader } from './components/list/ThreadTableHeader';
export {
  primaryViewsOn,
  ThreadPrimaryViews,
  TRIAGE_IDS,
  type TriageId,
  TriageMenu,
} from './components/list/ThreadViews';
export { threadSections } from './components/list/threadSections';
export { ThreadStatusCell } from './components/list/threadTableParts';
export { renderMarkdown, suggestedAnswerToHtml } from './components/messageDetailConstants';
export { quickFilterWouldChange } from './components/quickFilterPatch';
export { refreshForServerEvent, type ServerChangeEvent } from './components/serverEventRefresh';
export { presetToSorting, sortingToPreset } from './components/sortPresets';
export { threadIdForMessage } from './components/threadForMessage';
export { useListPresentation } from './components/useListPresentation';
export { addNoopenerHook } from './shell';
export { PresenceEye } from './presence/PresenceEye';
export { usePresenceWatch } from './presence/usePresenceWatch';
export { usePresenceReport } from './presence/usePresenceReport';
export { VIEWER_ONLY_REPORTER } from './presence/usePresenceReporter';
export { usePresenceSummary } from './presence/usePresenceSummary';
export { usePresenceSummaryStore } from './presence/presenceSummaryStore';
export { useListWritingGuard, useWritingGuard } from './presence/useWritingGuard';
export { scopeJumpUrl } from './hooks/scopeJumpUrl';
export { useConversationNewRefresh } from './hooks/useConversationNewRefresh';
export { useDropTeamFilterWhenTeamsOff } from './hooks/useDropTeamFilterWhenTeamsOff';
export { useIsPhone, useSafeMediaQuery } from './hooks/useIsPhone';
export { useMessagesData } from './hooks/useMessagesData';
export { useThreadTabs, useThreadsPageTabs } from './hooks/useThreadTabs';
export { useMessagesUrlSync } from './hooks/useMessagesUrlSync';
export { useNewThreadsBar } from './hooks/useNewThreadsBar';
export { usePhoneOpensMessageAsPage } from './hooks/usePhoneOpensMessageAsPage';
export { useSharedLinkWorkspace } from './hooks/useSharedLinkWorkspace';
export { useSocketReconnected } from './hooks/useSocketReconnected';
export { useThreadViewCounts } from './hooks/useThreadViewCounts';
export { bulkService } from './services/bulk.service';
export {
  defaultFilters,
  type FilterState,
  messagesCacheKey,
  useMessagesStore,
} from './stores/messagesStore';

// MessagesPage's hooks and parts (F5 split: the page stays thin). The page is a lazy route, so
// these load with it, never with the app shell.
export { DetailSlideOver, SplitDetailPane } from './components/messagesPage/DetailPanels';
export { countActiveFilters, countClearableFilters } from './components/messagesPage/filterCounts';
export { MessagesPageHeader } from './components/messagesPage/MessagesPageHeader';
export { SpamPreviewDialog } from './components/messagesPage/SpamPreviewDialog';
export { ThreadListView } from './components/messagesPage/ThreadListView';
export { useBulkActionRunner } from './hooks/useBulkActionRunner';
export { useDetailPanelBodyLock } from './hooks/useDetailPanelBodyLock';
export { useFilterBarHandlers } from './hooks/useFilterBarHandlers';
export { useLaneCounts } from './hooks/useLaneCounts';
export { useListSelection } from './hooks/useListSelection';
export { useMessagesDisplayMode } from './hooks/useMessagesDisplayMode';
export { useNotifyTriage } from './hooks/useNotifyTriage';
export { useRowReadChanged } from './hooks/useRowReadChanged';
export { useScopeJump } from './hooks/useScopeJump';
export { useMessagesPageThreadActions } from './hooks/useMessagesPageThreadActions';
export { BulkDialogs } from './components/messagesPage/BulkDialogs';
export { ThreadsFilterBar } from './components/messagesPage/ThreadsFilterBar';
export { useBoardAndBulkState } from './hooks/useBoardAndBulkState';
export { useServerEventRouting } from './hooks/useServerEventRouting';
export { detailPanelProps } from './components/messagesPage/detailPanelProps';
export type { MessagesPageAlert } from './hooks/messagesPageAlert';
export { CLOSED_MESSAGES_PAGE_ALERT } from './hooks/messagesPageAlert';
export {
  useConversationUpdateEvents,
  useTicketRoutingStatusEvents,
} from './hooks/useThreadServerEvents';
