/**
 * The assignee filter's API form.
 *
 * Three values that look alike and behave nothing alike:
 *
 *  - `'me'` is SYMBOLIC. It must never be sent as an id — the API does
 *    `parseInt(assigneeId)`, so 'me' arrives as NaN, which is neither `undefined` nor
 *    `0`, and compiles to `assignee_id = NaN`: a filter that silently matches nothing.
 *    It has its own boolean param, resolved against the caller's id server-side. Kept
 *    symbolic in FilterState deliberately, so a saved view means "mine" for whoever
 *    opens it rather than "user 7's".
 *  - `'unassigned'` becomes `0`, which the API special-cases to `IS NULL`.
 *  - anything else is already a user id.
 *
 * Extracted from useMessagesData so the rule can be tested; the hook's own mapping is
 * one long inline block with no seam.
 */
export const assigneeApiParams = (
  assigneeId: string | undefined
): { assignedToMe?: 'true'; assigneeId?: string } => {
  if (!assigneeId || assigneeId === 'all') return {};
  if (assigneeId === 'me') return { assignedToMe: 'true' };
  if (assigneeId === 'unassigned') return { assigneeId: '0' };
  return { assigneeId };
};
