import { COLUMNS } from '@/components/messages/kanbanColumns';
import { readAppliesTo } from '@/components/messages/filters/filterSchema';
import { searchIsTheOnlyFilter } from '@/hooks/searchIsTheOnlyFilter';
import type { FilterState } from '@/stores/messagesStore';
import { assigneeApiParams } from './assigneeApiParams';
import { legacyAiStateParam } from './legacyAiStateParam';
import { negateApiParam } from './negateApiParam';

/**
 * The thread list's filters as API parameters — the ONE translation. The list fetch and the
 * view-pill counts (`useThreadViewCounts`) both call it, so a pill's count is the total of
 * exactly the request the list makes when that pill is clicked. Moved here unchanged from
 * `useMessagesData`; the `scope=1` opt-in stays with the list fetch.
 */
export const threadApiFilters = (
  currentFilters: FilterState,
  isKanban: boolean
): Record<string, string> => {
  const apiFilters: Record<string, string> = {};

  // SOURCE
  if (currentFilters.messageSourceId && currentFilters.messageSourceId !== 'all') {
    apiFilters.messageSourceId = currentFilters.messageSourceId;
  }

  // RECEIVED — a bucket or an explicit window. The UI clears one when setting the
  // other, so only one of these three is ever populated; the API would honour both
  // (as an intersection) if they were.
  if (currentFilters.ageRange && currentFilters.ageRange !== 'all') {
    apiFilters.ageRange = currentFilters.ageRange;
  }
  if (currentFilters.receivedFrom) apiFilters.receivedFrom = currentFilters.receivedFrom;
  if (currentFilters.receivedTo) apiFilters.receivedTo = currentFilters.receivedTo;

  if (currentFilters.receivedAt && currentFilters.receivedAt !== 'all') {
    apiFilters.receivedAt = currentFilters.receivedAt;
  }

  // LIFECYCLE + QUEUE (new LIST-view dropdowns) — additive params. The BE
  // handles them independently of view/processed; they're mutually exclusive
  // in the FE (picking one resets the other to 'all'). When either is active
  // it fully defines the row set, so we suppress the legacy status→view and
  // threadStatus→processed derivation below (those two dropdowns are replaced
  // by Status+Queue in the list, and their store fields stay at 'all' there).
  // A quick-filter chip in list view IS a kanban column. Applying that column's own
  // `fixedFilters` — the same object MessagesKanbanView spreads into its request — is what
  // guarantees the chip and the board return the same rows. A chip carrying its own copy
  // of the predicate would drift from the column within a release, and the two views would
  // quietly disagree about what "Spam" means.
  const columnId = isKanban ? 'all' : (currentFilters.columnId ?? 'all');
  const activeColumn = columnId !== 'all' ? COLUMNS.find((col) => col.id === columnId) : undefined;
  if (activeColumn) {
    Object.assign(apiFilters, activeColumn.fixedFilters);
  }

  const lifecycle = isKanban || activeColumn ? 'all' : (currentFilters.lifecycle ?? 'all');
  if (lifecycle !== 'all') {
    apiFilters.lifecycle = lifecycle;
  }
  const queue = isKanban || activeColumn ? 'all' : (currentFilters.queue ?? 'all');
  if (queue !== 'all') {
    apiFilters.queue = queue;
  }
  // Read state exists only under the triage queues — nothing writes a
  // `conversation_reads` row for an ordinary inbox thread, so sending `read` with
  // any other queue filters on a column that is empty by construction. The store
  // already drops it (`scopeReadToTriage`); this is the same rule at the request,
  // where the kanban zeroing sits, so a stale persisted filter cannot leak through.
  // NB: `currentFilters`, not the local `queue` above — that one is zeroed whenever a
  // column is active, and a chip-selected triage column is precisely a lens where read
  // state DOES exist.
  const read = isKanban || !readAppliesTo(currentFilters) ? 'all' : (currentFilters.read ?? 'all');
  if (read !== 'all') {
    apiFilters.read = read;
  }
  // An active column also fully defines the set, so the legacy status→view derivation
  // below must not layer a second, conflicting constraint on top of it.
  const lifecycleOrQueueActive = lifecycle !== 'all' || queue !== 'all' || !!activeColumn;

  // THREAD STATUS (kanban lifecycle: open / in_progress / closed)
  const threadStatus = currentFilters.threadStatus ?? 'all';
  if (threadStatus !== 'all' && !lifecycleOrQueueActive) {
    apiFilters.processed = threadStatus;
  }

  // Inbox toolbar checkbox: hide "waiting on customer" so the list shows
  // only items needing agent attention.
  if (currentFilters.excludeAwaitingResponse) {
    apiFilters.excludeAwaitingResponse = 'true';
  }

  const searchIsTheWholeFilter = searchIsTheOnlyFilter({
    search: currentFilters.search,
    threadStatus,
    lifecycleOrQueueActive,
  });

  // STATUS → view param
  // When threadStatus is active, use view=active (not work_queue) so the status
  // restriction from work_queue doesn't block closed threads.
  // Skipped entirely when a lifecycle/queue filter is driving the list.
  const status = currentFilters.status ?? 'all';
  if (lifecycleOrQueueActive) {
    // lifecycle/queue define the set; leave view/showSpam unset so the BE's
    // base (org/dept) scope + the new params are the only status constraints.
  } else if (status === 'all' && searchIsTheWholeFilter) {
    // ⛔ No view at all. A typed search is a request for a NAMED thing, not a browse
    // of the work queue, and `view=work_queue` is a lens: it reaches the BE's view
    // chain, which runs BEFORE the rule that drops the default lens for an explicit
    // search — so the bypass the backend already implements never fires, and the
    // answer comes back narrowed.
    //
    // Measured on a client deploy: searching a customer's address returned "No
    // messages found" over the banner "Showing 0 of 1 — 1 hidden by the current
    // view", while the same search with no `view` returned the thread. An agent
    // reads the first as "this mail never arrived".
    //
    // Only when the agent picked NOTHING. A chosen status, lifecycle, queue or
    // column is a deliberate narrowing and still applies — searching inside
    // "Resolved" must keep meaning that.
  } else if (status === 'all') {
    /**
     * The pill says "All". It must ask for all.
     *
     * It used to send `view=work_queue`, which is a real lens and a narrow one: it pins
     * `status IN (new, open, pending, awaiting_response, client_replied)` and drops spam,
     * suspicious and knowledge-base mail. On a client workspace that rendered
     * `1–50 of 0` beside a kanban showing 2,880 of the same 2,910 threads, because the
     * board applies neither a terminal filter nor a KB one. Two views of one mailbox
     * disagreeing by 2,880 rows, with the narrower one labelled "All".
     *
     * ⛔ NOT `view=all` — the API refuses that with a 400, deliberately, because it used
     * to be accepted and silently narrowed. `view=active&processed=all` is the widening
     * the backend sanctions, and its own 400 body names it.
     *
     * 🪤 `processed=all` was DISCARDED by the backend parser until BE #634: it had no
     * arm in the `processed` chain and fell through to `undefined`, which made it
     * indistinguishable from a typo. Sending it before that shipped would have made this
     * list NARROWER, not wider — `view=active` without the pin skip returns fewer rows
     * than `view=work_queue`. Requires BE >= the release carrying #634 and #635.
     *
     * What this does NOT widen, deliberately: knowledge-base mail stays excluded unless
     * it is live work (BE `NOT_ARCHIVED_KB`), and spam/suspicious keep their own chips.
     * `ListScopeNotice` reports whatever remains hidden, so the list still says when it
     * is a subset.
     */
    apiFilters.view = 'active';
    if (threadStatus === 'all') {
      apiFilters.processed = 'all';
    }
  } else if (status === 'active') {
    apiFilters.view = 'active';
  } else if (status === 'awaiting_response') {
    apiFilters.view = 'awaiting_response';
  } else if (status === 'client_replied') {
    apiFilters.view = 'client_replied';
  } else if (status === 'suspicious') {
    apiFilters.view = 'suspicious';
  } else if (status === 'not_analysed') {
    apiFilters.view = 'not_analysed';
  } else if (status === 'spam') {
    apiFilters.showSpam = 'true';
  } else if (status === 'resolved') {
    apiFilters.view = 'resolved';
  }

  // DEPARTMENT — 'needs_routing' sentinel overrides the view to the dedicated
  // needs_routing queue (org-wide, ignores user dept membership). A real dept id
  // just narrows the existing view to that dept.
  if (currentFilters.departmentId && currentFilters.departmentId !== 'all') {
    if (currentFilters.departmentId === 'needs_routing') {
      apiFilters.view = 'needs_routing';
      delete apiFilters.processed;
    } else {
      apiFilters.departmentId = currentFilters.departmentId;
    }
  }

  // PRIORITY
  if (currentFilters.priority && currentFilters.priority !== 'all') {
    apiFilters.priority = currentFilters.priority;
  }

  // ASSIGNEE — see assigneeApiParams for why 'me' is not an id.
  Object.assign(apiFilters, assigneeApiParams(currentFilters.assigneeId));

  // NEGATION — only for the filters this query is actually sending. In kanban
  // `lifecycle` and `queue` are dropped above, so their inversions go with them.
  const aiState = currentFilters.aiState ?? 'all';
  const negate = negateApiParam(currentFilters.negate, [
    ...(lifecycle !== 'all' ? ['lifecycle'] : []),
    ...(queue !== 'all' ? ['queue'] : []),
    ...(aiState !== 'all' ? ['aiState'] : []),
  ]);
  if (negate) apiFilters.negate = negate;

  // AI STATE — one param now, not six booleans translated from one control. The
  // booleans still exist server-side for their other callers, but they cannot be
  // negated: `aiSuggested=false` means "do not filter", not "not AI-suggested".
  if (aiState !== 'all') {
    apiFilters.aiState = aiState;
    // Send the legacy boolean alongside it, so the filter still works against a
    // backend that predates `aiState` — the frontend ships from main and can be
    // live before the API is. NEVER when inverted: the boolean is a positive test,
    // and a backend old enough to need it drops the negation, so the two would
    // contradict and match nothing. On a backend that has both, the boolean simply
    // repeats what `aiState` already says.
    if (!negate?.includes('aiState')) {
      Object.assign(apiFilters, legacyAiStateParam(aiState));
    }
  }

  // LABEL
  if (currentFilters.labelId && currentFilters.labelId !== 'all') {
    apiFilters.labelId = currentFilters.labelId;
  }

  // LINKED
  const linked = currentFilters.linked ?? 'all';
  if (linked === 'has_ticket') {
    apiFilters.hasTicket = 'true';
  } else if (linked === 'has_jira') {
    apiFilters.hasJiraTicket = 'true';
  }

  if (
    linked !== 'all' &&
    currentFilters.linkedTicketStatus &&
    currentFilters.linkedTicketStatus !== 'all'
  ) {
    apiFilters.linkedTicketStatus = currentFilters.linkedTicketStatus;
  }

  // SLA FILTER — independent flags. BE OR's them when both set.
  if (currentFilters.slaBreached) apiFilters.slaBreached = 'true';
  if (currentFilters.slaAtRisk) apiFilters.slaAtRisk = 'true';

  // ATTACHMENTS — show only convs with at least one attached file.
  if (currentFilters.hasAttachments) apiFilters.hasAttachments = 'true';

  // KNOWLEDGE BASE — only threads mined from a KB source. The not-shown menu's
  // "from the knowledge base" figure jumps here.
  if (currentFilters.showKBOnly) apiFilters.showKBOnly = 'true';

  // SEARCH
  if (currentFilters.search?.trim()) {
    apiFilters.search = currentFilters.search.trim();
  }

  return apiFilters;
};
