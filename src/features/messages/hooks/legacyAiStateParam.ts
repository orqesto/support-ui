/**
 * The AI-state filter as the boolean the API understood before `aiState` existed.
 *
 * The frontend deploys from `main` and is live the moment it merges; the backend ships
 * through staging first. In the gap between the two, a request carrying only `aiState`
 * reaches an API that has never heard of it and drops it — the filter would look applied
 * and return everything. Sending the old boolean as well keeps it working through the
 * skew, and costs nothing once both sides have landed: the boolean tests exactly what
 * `aiState` tests, so a backend with both applies the same condition twice.
 *
 * Not sent when the filter is INVERTED. The boolean is a positive test and has no "not"
 * form — an API old enough to need it is old enough to drop `negate`, so the pair would
 * read "is X and is not X" and match nothing.
 *
 * Delete this the release after the `aiState` backend is in production everywhere.
 */
export const legacyAiStateParam = (aiState: string): Record<string, string> => {
  switch (aiState) {
    case 'needs_review':
      return { needsHumanReview: 'true' };
    case 'needs_info':
      return { showNeedsInfo: 'true' };
    case 'ai_suggested':
      return { aiSuggested: 'true' };
    case 'bot_handled':
      return { botHandled: 'true' };
    case 'lead':
      return { isLead: 'true' };
    case 'contradiction':
      return { hasContradiction: 'true' };
    default:
      return {};
  }
};
