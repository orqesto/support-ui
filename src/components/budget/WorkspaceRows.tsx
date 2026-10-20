import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import type { WorkspaceRow } from '@/services/budgets.service';
import { extraLeft, fmtTokens } from './budget.rules';
import { TONE_CLASS } from './StatusText';

export type WorkspaceRowsProps = {
  rows: WorkspaceRow[];
  /** The group's month spend, tokens: the "% of used" share is taken from it. */
  groupTotal: number;
  /** Tokens of organisation-wide extra still unused (0 when none). */
  groupExtraLeft: number;
  /** Id of the one expanded row. */
  openId: number | null;
  onToggleOpen: (organizationId: number) => void;
  /** Rows ticked for a bulk action; omit `onTogglePick` to hide the select boxes. */
  picked?: ReadonlySet<number>;
  onTogglePick?: (organizationId: number, on: boolean) => void;
  /** The panel shown directly under the open row. */
  renderPanel?: (row: WorkspaceRow) => ReactNode;
  /** Give the row's suggested extra for 3 days; omit when the viewer cannot grant. */
  onGiveSuggested?: (row: WorkspaceRow) => void;
};

export const panelIdFor = (organizationId: number) => `budget-panel-${organizationId}`;

/** A paused bulk run with no extra left gets a one-click "Give extra" on its row. */
const needsExtra = (row: WorkspaceRow, groupExtraLeft: number) =>
  row.bulkRunning && extraLeft(row.extra) <= 0 && groupExtraLeft <= 0 && row.status.tone !== 'ok';

export const WorkspaceRows = ({
  rows,
  groupTotal,
  groupExtraLeft,
  openId,
  onToggleOpen,
  picked,
  onTogglePick,
  renderPanel,
  onGiveSuggested,
}: WorkspaceRowsProps) => {
  // Row bars are relative: the biggest workspace fills its bar.
  const biggest = Math.max(1, ...rows.map((row) => row.spend.total + (row.extra?.used ?? 0)));
  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, id: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggleOpen(id);
    }
  };

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.length === 0 && <li className="text-muted-foreground">No workspace matches.</li>}
      {rows.map((row) => {
        const id = row.organizationId;
        const open = id === openId;
        const share = groupTotal > 0 ? Math.round((row.spend.total / groupTotal) * 100) : 0;
        const extraUsed = row.extra?.used ?? 0;
        return (
          <li key={id} data-testid={`budget-row-${id}`}>
            <div className="flex gap-2 items-stretch">
              {onTogglePick && (
                // Its own column with a divider, away from the row's click area: a missed click
                // on the box must not open the workspace.
                <div className="flex items-center px-3 border-r border-border">
                  <Checkbox
                    aria-label={`Select ${row.name}`}
                    checked={picked?.has(id) ?? false}
                    onChange={(event) => onTogglePick(id, event.target.checked)}
                  />
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-controls={open ? panelIdFor(id) : undefined}
                onClick={() => onToggleOpen(id)}
                onKeyDown={(event) => onRowKey(event, id)}
                className={cn(
                  'flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_11em_minmax(0,1.6fr)] gap-3.5 items-center p-3 rounded-lg cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  open && 'bg-accent rounded-b-none'
                )}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{row.name}</div>
                  <div
                    className="flex overflow-hidden mt-1 h-1.5 rounded-full bg-muted"
                    title="Relative to the biggest workspace"
                  >
                    <span
                      className="h-full bg-primary"
                      style={{ width: `${(row.spend.total / biggest) * 100}%` }}
                    />
                    {extraUsed > 0 && (
                      <span
                        className="h-full bg-warning"
                        style={{ width: `${(extraUsed / biggest) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
                <div className="font-mono text-sm">
                  {fmtTokens(row.spend.total)}{' '}
                  <span className="text-muted-foreground">· {share}% of used</span>
                  {row.bulkLimit !== null && (
                    <div className="text-muted-foreground">limit {fmtTokens(row.bulkLimit)}</div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 text-sm">
                  <span
                    className={TONE_CLASS[row.status.tone]}
                    data-testid={`budget-row-status-${id}`}
                  >
                    {row.status.text}
                  </span>
                  {row.liveSpike && (
                    <span className={cn('text-xs', TONE_CLASS.warn)}>
                      Live mail today {fmtTokens(row.liveSpike.today)}, usually{' '}
                      {fmtTokens(row.liveSpike.usual)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {onGiveSuggested && needsExtra(row, groupExtraLeft) && (
              <div className="flex justify-end px-3 pb-2">
                <Button variant="outline" size="sm" onClick={() => onGiveSuggested(row)}>
                  Give +{fmtTokens(row.suggestedExtra)} extra · 3 days
                </Button>
              </div>
            )}
            {open && renderPanel?.(row)}
          </li>
        );
      })}
    </ul>
  );
};
