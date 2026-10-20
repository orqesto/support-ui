import { useState } from 'react';
import { BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EXTRA_MAX, EXTRA_MIN, MILLION, fmt, usd, type ExtraEndChoice } from './budget.rules';
import { END_SEGMENTS, parseEnd } from './ExtraBox';
import { FieldLabel } from './BulkLimitField';

/**
 * Select / select all / unselect all, and the actions for the selected workspaces (set the same
 * own limit, remove it, give extra). Sizes arrive and leave in tokens.
 */

export type BulkBarProps = {
  selected: number;
  /** The group budget, tokens: the top of the limit slider. */
  budget: number;
  /** How many "Select all" would pick: every workspace matching the search, not only those shown. */
  selectable: number;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  /** Tokens. */
  onSetLimit: (limit: number) => void;
  onRemoveLimit: () => void;
  /** 'suggested' = each workspace gets its own suggested amount. */
  onGiveExtra: (tokens: number | 'suggested', end: ExtraEndChoice) => void;
  /** How many of the selected have extra running: "End extra" shows only then. */
  withExtra: number;
  onEndExtra: () => void;
  /** Show the limit actions (the caller's canEdit.workspaceLimits). Default true. */
  canLimit?: boolean;
  /** Show the extra actions (the caller's canEdit.grant). Default true. */
  canGrant?: boolean;
};

export const BulkBar = ({
  selected,
  budget,
  selectable,
  onSelectAll,
  onUnselectAll,
  onSetLimit,
  onRemoveLimit,
  onGiveExtra,
  withExtra,
  onEndExtra,
  canLimit = true,
  canGrant = true,
}: BulkBarProps) => {
  const top = Math.max(1, Math.round(budget / MILLION));
  const [limitDraft, setLimitDraft] = useState(30);
  const limit = Math.min(limitDraft, top);
  const [eachSuggested, setEachSuggested] = useState(true);
  const [extra, setExtra] = useState(20);
  const [end, setEnd] = useState<ExtraEndChoice>(3);

  return (
    <div className="flex flex-col gap-3" data-testid="budget-bulk">
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
      {selected > 0 && (canLimit || canGrant) && (
        <div className="grid gap-5 p-4 rounded-lg bg-accent grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {canLimit && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Own bulk limit for each</FieldLabel>
              <span className="font-mono text-lg">
                {fmt(limit)} · {Math.round((limit / top) * 100)}% of the budget
              </span>
              <BarSlider
                value={limit}
                min={1}
                max={top}
                step={1}
                onChange={setLimitDraft}
                ariaLabel="Own bulk limit for each selected workspace"
                ariaValueText={`${fmt(limit)} tokens`}
              >
                <BarSegment width={(limit / top) * 100} className="bg-pending" />
              </BarSlider>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onSetLimit(limit * MILLION)}>
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
          )}
          {canGrant && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Extra for bulk work, for each</FieldLabel>
              <Checkbox
                checked={eachSuggested}
                onChange={(event) => setEachSuggested(event.target.checked)}
                label="Each gets what its import still needs"
              />
              <span className="font-mono text-lg">
                {eachSuggested ? 'Suggested for each' : `+${fmt(extra)} ${usd(extra)}`}
              </span>
              <BarSlider
                value={extra}
                min={EXTRA_MIN}
                max={EXTRA_MAX}
                step={5}
                disabled={eachSuggested}
                onChange={setExtra}
                ariaLabel="Extra for each selected workspace, million tokens"
                ariaValueText={`${fmt(extra)} tokens`}
              >
                <BarSegment
                  width={(extra / EXTRA_MAX) * 100}
                  className={eachSuggested ? 'bg-border' : 'bg-warning'}
                />
              </BarSlider>
              <div className="flex flex-wrap gap-2 items-center">
                <SegmentedControl
                  ariaLabel="Bulk extra ends"
                  value={String(end)}
                  onChange={(next) => setEnd(parseEnd(next))}
                  segments={END_SEGMENTS}
                />
                <Button
                  size="sm"
                  onClick={() => onGiveExtra(eachSuggested ? 'suggested' : extra * MILLION, end)}
                >
                  Give extra
                </Button>
                {withExtra > 0 && (
                  <Button variant="outline" size="sm" onClick={onEndExtra}>
                    End extra ({withExtra})
                  </Button>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                Outside the budget; unused extra expires.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
