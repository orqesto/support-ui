/** Where a label picker's list stands: still fetching, fetched, or the fetch failed. */
export type LabelsStatus = 'loading' | 'ready' | 'error';

/**
 * What a label picker says when it shows no rows — one source for the ticket and the message
 * header pickers, so they cannot disagree. "No labels yet" is said only after a SUCCESSFUL empty
 * load: before that, or after a failed one, it was false and invited creating a label that exists.
 */
export const labelPickerEmptyText = (
  status: LabelsStatus,
  labelCount: number,
  canCreate: boolean
) => {
  if (status === 'loading') return 'Loading labels…';
  if (status === 'error') return 'Couldn’t load labels.';
  if (labelCount === 0)
    return canCreate ? 'No labels yet — type a name to create one.' : 'No labels yet.';
  return 'No labels match.';
};
