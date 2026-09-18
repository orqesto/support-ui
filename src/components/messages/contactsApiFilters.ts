import { assigneeApiParams } from '@/hooks/assigneeApiParams';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The filters the Contacts view sends.
 *
 * Extracted from `MessagesPage` for the same reason `buildSharedFilters` was extracted from
 * the board: it is the one part of that JSX whose output is a contract with the backend, and
 * as an inline IIFE inside a 1,000-line page it could not be pinned by a test. It was in fact
 * carrying the same defect the board had — `'me'` sent as though it were a user id — and
 * nothing could have caught it.
 *
 * Behaviour is unchanged from the inline version except for that assignee rule.
 */
export function buildContactsApiFilters(filters: FilterState): Record<string, string> {
  const filterObj: Record<string, string> = {};
  const status = filters.status ?? 'all';
  if (status === 'all') filterObj.view = 'work_queue';
  else if (status === 'active') filterObj.view = 'active';
  else if (status === 'awaiting_response') filterObj.awaitingCustomerResponse = 'true';
  else if (status === 'client_replied') filterObj.customerResponded = 'true';
  else if (status === 'suspicious') filterObj.view = 'suspicious';
  else if (status === 'not_analysed') filterObj.view = 'not_analysed';
  else if (status === 'resolved') filterObj.view = 'resolved';
  if (filters.threadStatus && filters.threadStatus !== 'all')
    filterObj.processed = filters.threadStatus as string;
  if (filters.messageSourceId && filters.messageSourceId !== 'all')
    filterObj.messageSourceId = filters.messageSourceId;
  if (filters.receivedAt && filters.receivedAt !== 'all')
    filterObj.receivedAt = filters.receivedAt;
  if (filters.departmentId && filters.departmentId !== 'all') {
    if (filters.departmentId === 'needs_routing') {
      filterObj.view = 'needs_routing';
    } else {
      filterObj.departmentId = filters.departmentId;
    }
  }
  /**
   * ⛔ Through the helper. `'me'` is SYMBOLIC and must never be sent as an id: the API
   * does `parseInt`, so it arrived as NaN and the predicate became `assignee_id = NaN`.
   * Contacts runs the same query builder server-side and passes the caller's `userId`
   * (`messageContactController`), so the boolean resolves here exactly as in the list.
   */
  Object.assign(filterObj, assigneeApiParams(filters.assigneeId));
  if (filters.aiState === 'lead') filterObj.isLead = 'true';
  if (filters.aiState === 'needs_review') filterObj.needsHumanReview = 'true';
  if (filters.aiState === 'needs_info') filterObj.showNeedsInfo = 'true';
  if (filters.aiState === 'ai_suggested') filterObj.aiSuggested = 'true';
  if (filters.aiState === 'bot_handled') filterObj.botHandled = 'true';
  if (filters.aiState === 'contradiction') filterObj.hasContradiction = 'true';
  if (filters.linked === 'has_ticket') filterObj.hasTicket = 'true';
  if (filters.linked === 'has_jira') filterObj.hasJiraTicket = 'true';
  if (filters.priority && filters.priority !== 'all') filterObj.priority = filters.priority;
  if (filters.labelId && filters.labelId !== 'all') filterObj.labelId = filters.labelId;
  if (filters.search?.trim()) filterObj.search = filters.search.trim();
  return filterObj;
}
