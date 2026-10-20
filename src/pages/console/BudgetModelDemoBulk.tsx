import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { type ExtraEnd } from './budgetModelDemo.rules';
import { END_SEGMENTS, FieldLabel } from './BudgetModelDemoParts';

/**
 * Budget model demo: select / select all / unselect all, and the actions for the selected
 * workspaces (set the same own limit, remove it, give extra). Demo only: no calls, no saving.
 */

type BulkBarProps = {
  selected: number;
  /** How many "Select all" would pick: every workspace matching the search, not only those shown. */
  selectable: number;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onSetLimit: (limit: number) => void;
  onRemoveLimit: () => void;
  /** null = each workspace gets its own suggested amount. */
  onGiveExtra: (amount: number | null, end: ExtraEnd) => void;
};

/** A positive number of million tokens, or null for an empty or invalid field. */
const parseMillions = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};

export const BulkBar = ({
  selected,
  selectable,
  onSelectAll,
  onUnselectAll,
  onSetLimit,
  onRemoveLimit,
  onGiveExtra,
}: BulkBarProps) => {
  const [limitText, setLimitText] = useState('30');
  const [extraText, setExtraText] = useState('');
  const [end, setEnd] = useState<ExtraEnd>(1);
  const limit = parseMillions(limitText);

  return (
    <div className="flex flex-col gap-3" data-testid="budget-demo-bulk">
      <div className="flex flex-wrap gap-2.5 items-center">
        <span className="text-sm text-muted-foreground">
          {selected > 0 ? `${selected} selected` : 'Select workspaces to change them together'}
        </span>
        {selected < selectable && (
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            Select all {selectable}
          </Button>
        )}
        {selected > 0 && (
          <Button variant="ghost" size="sm" onClick={onUnselectAll}>
            Unselect all
          </Button>
        )}
      </div>
      {selected > 0 && (
        <div className="grid gap-4 p-4 rounded-lg bg-accent grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="budget-demo-bulk-limit">Own bulk limit, million tokens</FieldLabel>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                id="budget-demo-bulk-limit"
                type="number"
                min={1}
                value={limitText}
                onChange={(event) => setLimitText(event.target.value)}
                className="w-24"
                size="sm"
              />
              <Button
                size="sm"
                disabled={limit === null}
                onClick={() => limit !== null && onSetLimit(limit)}
              >
                Set limit
              </Button>
              <Button variant="outline" size="sm" onClick={onRemoveLimit}>
                Remove limit
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              The same limit on each; it caps their bulk work only.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="budget-demo-bulk-extra">
              Extra for bulk work, million tokens
            </FieldLabel>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                id="budget-demo-bulk-extra"
                type="number"
                min={1}
                placeholder="suggested"
                value={extraText}
                onChange={(event) => setExtraText(event.target.value)}
                className="w-28"
                size="sm"
              />
              <SegmentedControl
                ariaLabel="Bulk extra ends"
                value={String(end)}
                onChange={(next) => setEnd(Number(next) as ExtraEnd)}
                segments={END_SEGMENTS}
              />
              <Button size="sm" onClick={() => onGiveExtra(parseMillions(extraText), end)}>
                Give extra
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              Empty = each gets what its import still needs. Outside the budget; unused expires.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
