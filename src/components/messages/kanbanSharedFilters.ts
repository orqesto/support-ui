import { legacyAiStateParam } from '@/hooks/legacyAiStateParam';
import { negateApiParam } from '@/hooks/negateApiParam';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The filters every kanban column sends, before the column adds its own `fixedFilters`.
 *
 * Extracted from `MessagesKanbanView` so the translation from the filter bar to API params
 * can be pinned by a test. The board has no test of its own — it is a 1,000-line DnD surface —
 * and this is the one function in it whose output is a contract with the backend.
 */
export function buildSharedFilters(filters: FilterState): Record<string, string> {
  const api: Record<string, string> = {};
  if (filters.messageSourceId && filters.messageSourceId !== 'all')
    api.messageSourceId = filters.messageSourceId;
  if (filters.receivedAt && filters.receivedAt !== 'all') api.receivedAt = filters.receivedAt;
  /**
   * The department picker's `needs_routing` sentinel is not a department. In the list it
   * becomes `view=needs_routing`; the board cannot do that, because each column pins its own
   * `lifecycle`/`view` and a second `view` would replace it.
   *
   * ⛔ It used to be DROPPED here — the comment said "a future needs_routing column" and the
   * board relied on the column's fixedFilters, i.e. on nothing. The chip read "Needs routing"
   * while every column showed the whole department set: a filter that visibly does nothing,
   * which is worse than not offering it.
   *
   * `queue=needs_routing` is the backend's additive form of the same lens: it ANDs with each
   * column's lifecycle (`messageFilters.ts`, the queue block) and lifts the department scope
   * (`buildMessageQueryConditions` skips the dept filter for that queue, so the mark is
   * org-wide here exactly as it is on the Needs Routing page). `needs_routing` is a MARK on an
   * ordinary thread, not a lane, so the narrowed board keeps the thread in whichever work
   * column it belongs to — see `routingMark.test.ts`.
   */
  if (filters.departmentId === 'needs_routing') {
    api.queue = 'needs_routing';
  } else if (filters.departmentId && filters.departmentId !== 'all') {
    api.departmentId = filters.departmentId;
  }
  if (filters.priority && filters.priority !== 'all') api.priority = filters.priority;
  if (filters.assigneeId && filters.assigneeId !== 'all')
    api.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
  // One param, so it can be inverted — the booleans it replaces had no "not" to send.
  if (filters.aiState && filters.aiState !== 'all') {
    api.aiState = filters.aiState;
    // Only aiState: the board hard-sets its own lifecycle per column and uses `view`
    // for the queue axis, so an inversion of either could not reach a card here.
    const negate = negateApiParam(filters.negate, ['aiState']);
    if (negate) api.negate = negate;
    // The legacy boolean as a fallback for an older API — see the note in
    // useMessagesData. Dropped when inverting, where the two would contradict.
    else Object.assign(api, legacyAiStateParam(filters.aiState));
  }
  // The Received filter is offered on the board and was never sent from it — the token
  // sat there looking applied while every column ignored it.
  if (filters.ageRange && filters.ageRange !== 'all') api.ageRange = filters.ageRange;
  if (filters.receivedFrom) api.receivedFrom = filters.receivedFrom;
  if (filters.receivedTo) api.receivedTo = filters.receivedTo;
  if (filters.labelId && filters.labelId !== 'all') api.labelId = filters.labelId;
  // SLA toggles — same params the list view sends; every column spreads these.
  if (filters.slaBreached) api.slaBreached = 'true';
  if (filters.slaAtRisk) api.slaAtRisk = 'true';
  if (filters.hasAttachments) api.hasAttachments = 'true';
  if (filters.linked === 'has_ticket') api.hasTicket = 'true';
  else if (filters.linked === 'has_jira') api.hasJiraTicket = 'true';
  if (filters.threadStatus && filters.threadStatus !== 'all')
    api.processed = filters.threadStatus as string;
  if (filters.search?.trim()) api.search = filters.search.trim();
  return api;
}
