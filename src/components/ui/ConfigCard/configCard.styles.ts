import type { ConfigCardState } from './configCard.types';

/**
 * State is carried by colour as well as wording, so which of the three conditions a
 * card is in reads at a glance: success for config that is live, warning for a draft
 * that is not yet stored.
 */
export const STATUS_BADGE_VARIANT: Record<ConfigCardState, 'secondary' | 'success' | 'warning'> = {
  empty: 'secondary',
  stored: 'success',
  editing: 'warning',
};

export const STATUS_LABEL: Record<ConfigCardState, string> = {
  empty: 'Not set',
  stored: 'In use',
  editing: 'Unsaved',
};

export const getConfigSummaryClasses = () => 'grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm';

export const getConfigEmptyNoteClasses = () =>
  'rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground';

export const getConfigActionsClasses = () =>
  'flex flex-wrap gap-2 items-center pt-4 border-t border-border';
