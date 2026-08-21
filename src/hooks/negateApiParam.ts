/**
 * The `negate` param, narrowed to the filters this query is actually sending.
 *
 * Negation is a modifier: it names filters rather than carrying a value of its own, and
 * an entry naming a filter the query does not carry does nothing server-side. Sending it
 * anyway is not harmless — it lands in the URL, so a link claims an inversion the list
 * never applied, and the kanban board (which drops `lifecycle` and `queue` outright)
 * would advertise two of them on every request.
 *
 * Extracted from the query builder for the same reason as `assigneeApiParams`: this is
 * the rule with a wrong answer available, and it is worth testing without a hook around
 * it.
 */
export const negateApiParam = (
  negate: string | undefined,
  /** The negatable filters this particular query carries a value for. */
  inPlay: readonly string[]
): string | undefined => {
  const kept = [
    ...new Set(
      (negate ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '' && inPlay.includes(entry))
    ),
  ];
  return kept.length > 0 ? kept.join(',') : undefined;
};
