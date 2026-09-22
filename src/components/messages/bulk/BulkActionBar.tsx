/**
 * The bar that appears once threads are selected.
 *
 * Which actions it offers is the owner's rule (D2): an action that fits NONE of the selection is
 * not shown at all, one that fits some shows how many ("12 of 15"), one that fits all shows
 * plain. The counts come from the server's preview, so the bar can never offer something the
 * server would refuse.
 */
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ACTION_LABEL, BULK_ACTIONS, type BulkAction, type BulkPreview } from './bulkActions';

type Props = {
  selectedCount: number;
  previews: Partial<Record<BulkAction, BulkPreview>>;
  loading: boolean;
  onPick: (action: BulkAction) => void;
  onClear: () => void;
};

export const BulkActionBar = ({ selectedCount, previews, loading, onPick, onClear }: Props) => {
  if (selectedCount === 0) return null;

  // An action with no preview is one the server refused to describe — usually a permission this
  // agent does not hold. Not shown, rather than shown and then refused.
  const offered = BULK_ACTIONS.map((action) => ({ action, preview: previews[action] })).filter(
    (entry): entry is { action: BulkAction; preview: BulkPreview } =>
      entry.preview !== undefined && entry.preview.eligible.length > 0
  );

  return (
    <div
      className="flex sticky bottom-0 z-20 flex-wrap gap-2 items-center px-3 py-2 rounded-lg border shadow-lg border-border bg-background"
      role="region"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-semibold">
        {selectedCount} selected
      </span>

      <div className="flex flex-wrap flex-1 gap-1.5 items-center">
        {loading && offered.length === 0 ? (
          <span className="text-xs text-muted-foreground">Checking what can be done…</span>
        ) : offered.length === 0 ? (
          // Deliberately explicit: an empty bar would read as "nothing happened".
          <span className="text-xs text-muted-foreground">
            Nothing can be done to this selection
          </span>
        ) : (
          offered.map(({ action, preview }) => {
            const eligible = preview.eligible.length;
            const partial = eligible < selectedCount;
            return (
              <Button
                key={action}
                size="sm"
                variant={action === 'spam' ? 'outline' : 'secondary'}
                onClick={() => onPick(action)}
                title={
                  partial
                    ? `${eligible} of the ${selectedCount} selected can take this action`
                    : undefined
                }
              >
                {ACTION_LABEL[action]}
                {partial && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {eligible} of {selectedCount}
                  </span>
                )}
              </Button>
            );
          })
        )}
      </div>

      <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
};
