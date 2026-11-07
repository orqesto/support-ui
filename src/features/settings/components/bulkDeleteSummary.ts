/**
 * What a bulk delete is about to do, for its confirm (FE audit 2026-09-29, B-H2: "Delete
 * Selected" deleted at once, with no confirmation, and the selection survives a change of
 * facet or search — so it could include rows the admin could not see).
 */
export const bulkDeleteSummary = (
  selected: ReadonlySet<number>,
  visibleIds: readonly number[]
): { total: number; hidden: number; description: string } => {
  const visible = new Set(visibleIds);
  const total = selected.size;
  let hidden = 0;
  for (const id of selected) if (!visible.has(id)) hidden += 1;
  const noun = total === 1 ? 'document' : 'documents';
  const hiddenNote =
    hidden > 0
      ? ` ${hidden} of them ${hidden === 1 ? 'is' : 'are'} not shown by the current filter (selected earlier).`
      : '';
  return {
    total,
    hidden,
    description: `Delete ${total} ${noun}?${hiddenNote} This cannot be undone; their chunks leave the knowledge base.`,
  };
};
