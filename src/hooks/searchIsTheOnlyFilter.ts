/**
 * Is the text the agent typed the ONLY thing narrowing this list?
 *
 * Extracted from `useMessagesData` so the rule has a name and a test of its own. It decides
 * whether the request carries a default lens (`view=work_queue`) or none at all.
 *
 * A typed search is a request for a NAMED thing, not a browse of the work queue. The
 * backend already implements that rule — it drops the default status and knowledge-base
 * exclusions when a search is present — but `view` reaches an EARLIER branch of its filter
 * chain, so sending the default lens means the bypass never fires and the answer comes back
 * narrowed.
 *
 * Measured on a client deploy before this existed: searching a customer's address rendered
 * "No messages found" above the banner "Showing 0 of 1 — 1 hidden by the current view". The
 * same search with no `view` returned the thread. An agent reads the first as "this mail
 * never arrived", which is the incident the backend rule was written to end.
 *
 * ⛔ False as soon as the agent picks anything. A status, lifecycle, queue or quick-filter
 * column is a deliberate narrowing: searching inside "Resolved" must keep meaning that.
 */
export const searchIsTheOnlyFilter = (input: {
  search?: string | null;
  /** The kanban-style status dropdown ('all' when untouched). */
  threadStatus?: string | null;
  /** A lifecycle/queue dropdown or a quick-filter column is driving the list. */
  lifecycleOrQueueActive: boolean;
}): boolean =>
  !!input.search?.trim() &&
  (input.threadStatus ?? 'all') === 'all' &&
  !input.lifecycleOrQueueActive;
