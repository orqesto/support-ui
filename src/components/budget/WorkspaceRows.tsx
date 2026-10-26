import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import type { WorkspaceRow } from '@/services/budgets.service';
import { END_CHOICES, QUICK_EXTRA_END, fmtMoney, fmtTokenCount } from './budget.rules';
import { TONE_CLASS } from './StatusText';
import { useMoney } from './tokenRate';

export type WorkspaceRowsProps = {
  rows: WorkspaceRow[];
  /** The group's period spend, micros: the "% of used" share is taken from it. */
  groupTotal: number;
  /** Id of the one expanded row. */
  openId: number | null;
  onToggleOpen: (organizationId: number) => void;
  /** Rows ticked for a bulk action; omit `onTogglePick` to hide the select boxes. */
  picked?: ReadonlySet<number>;
  onTogglePick?: (organizationId: number, on: boolean) => void;
  /** The panel shown directly under the open row. */
  renderPanel?: (row: WorkspaceRow) => ReactNode;
  /**
   * Give the row's suggested extra (for QUICK_EXTRA_END); omit when the viewer cannot grant. Shown
   * only on a row the API marks `bulkPaused` (its bulk work is stopped and no extra is left).
   */
  onGiveSuggested?: (row: WorkspaceRow) => void;
  /** Where a workspace's own budget page is; when given, its name links there. */
  workspacePath?: (organizationId: number) => string;
  /** A write is on its way: the one-click give is disabled (no double give on a double click). */
  busy?: boolean;
};

export const panelIdFor = (organizationId: number) => `budget-panel-${organizationId}`;

/** "3 days": the label of the row shortcut's end choice. */
const QUICK_EXTRA_LABEL =
  END_CHOICES.find((choice) => choice.value === QUICK_EXTRA_END)?.label ?? '3 days';

export const WorkspaceRows = ({
  rows,
  groupTotal,
  openId,
  onToggleOpen,
  picked,
  onTogglePick,
  renderPanel,
  onGiveSuggested,
  busy = false,
  workspacePath,
}: WorkspaceRowsProps) => {
  const money = useMoney();
  // Row bars are relative: the biggest workspace fills its bar.
  const biggest = Math.max(1, ...rows.map((row) => row.spend.total + (row.extra?.usedMicros ?? 0)));
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
        const extraUsed = row.extra?.usedMicros ?? 0;
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
                  <div className="font-semibold truncate">
                    {workspacePath ? (
                      <Link
                        to={workspacePath(id)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                  </div>
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
                  {fmtMoney(row.spend.total)}{' '}
                  <span className="text-muted-foreground">· {share}% of used</span>
                  {row.budget !== null && (
                    <div className="text-muted-foreground">of its {money(row.budget)}</div>
                  )}
                  {row.bulkLimit !== null && (
                    <div className="text-muted-foreground">limit {money(row.bulkLimit)}</div>
                  )}
                  <div
                    className="text-xs text-muted-foreground"
                    data-testid={`budget-row-tokens-${id}`}
                  >
                    {fmtTokenCount(row.tokens.total)} tokens
                  </div>
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
                      Live mail today {money(row.liveSpike.today)}, usually{' '}
                      {money(row.liveSpike.usual)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {onGiveSuggested && row.bulkPaused && (
              <div className="flex justify-end px-3 pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onGiveSuggested(row)}
                >
                  Give {money(row.suggestedExtra)} extra · {QUICK_EXTRA_LABEL}
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
