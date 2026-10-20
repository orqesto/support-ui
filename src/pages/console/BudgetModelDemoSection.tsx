import { useState, type KeyboardEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/utils';
import {
  LAST_DAY,
  addWorkspace,
  clampKbPct,
  defaultLimitFor,
  endOrgExtra,
  endOrgWideExtra,
  fmt,
  grantExtraMany,
  grantOrgExtra,
  grantOrgWideExtra,
  initialOrgState,
  orgStatusLine,
  orgTotals,
  removeWorkspace,
  setLimitMany,
  setWorkspaceLimit,
  simulateOrgDay,
  sortByUse,
  suggestedExtra,
  suggestedOrgExtra,
  usd,
  workspaceStatus,
  type DemoWorkspace,
  type ExtraEnd,
  type OrgTotals,
} from './budgetModelDemo.rules';
import {
  BudgetInput,
  BulkLegend,
  BulkLimitField,
  BulkLimitLegend,
  ExtraBox,
  FieldLabel,
  Log,
  StatusText,
  Swatch,
  TONE_CLASS,
  TryItButtons,
} from './BudgetModelDemoParts';
import { BulkBar } from './BudgetModelDemoBulk';
import { SingleWorkspaceView } from './BudgetModelDemoSingle';

/**
 * "Budget model (demo)": a clickable demo of a PROPOSED AI budget model, for the team to try.
 * Static example numbers, no backend calls, nothing is saved — all state lives in this component
 * and the pure rules in `budgetModelDemo.rules.ts`.
 *
 * ⛔ Sliders must stay draggable: rows and panels are keyed by workspace id only, and the
 * `BarSlider` inputs are never keyed by a value, so a re-render during a drag updates the same
 * input element instead of replacing it.
 */

const TOP_ROWS = 8;

// ---------------------------------------------------------------------------------------------
// Organisation (many workspaces)
// ---------------------------------------------------------------------------------------------

type PanelProps = {
  ws: DemoWorkspace;
  totals: OrgTotals;
  onLimit: (limit: number | null) => void;
  onGrant: (amount: number, end: ExtraEnd) => void;
  onEndExtra: () => void;
  onRemove: () => void;
  onClose: () => void;
};

const WorkspacePanel = ({
  ws,
  totals,
  onLimit,
  onGrant,
  onEndExtra,
  onRemove,
  onClose,
}: PanelProps) => {
  const budget = totals.budget;
  const sliderValue = ws.limit ?? defaultLimitFor(ws, budget);
  const help =
    ws.limit === null
      ? 'The purple part is its bulk spend this month; the grey tick is the organisation bulk limit.'
      : ws.kbUsed >= ws.limit
        ? 'Below what its bulk work already used: its bulk work stops now; live mail continues.'
        : `${fmt(ws.limit - ws.kbUsed)} left for its bulk work.`;
  return (
    <div
      id={`budget-demo-panel-${ws.id}`}
      className="flex flex-col gap-4 px-4 pt-1.5 pb-4 rounded-b-lg bg-accent"
    >
      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Limit this workspace's bulk processing</FieldLabel>
          <Toggle
            checked={ws.limit !== null}
            onChange={(on) => onLimit(on ? sliderValue : null)}
            label="At most per month"
          />
          <span className="font-mono text-lg">
            {ws.limit !== null
              ? `${fmt(ws.limit)} · ${Math.round((ws.limit / budget) * 100)}% of the budget`
              : 'No own limit · only the organisation bulk limit applies'}
          </span>
          <BarSlider
            value={Math.min(sliderValue, Math.round(budget))}
            min={0}
            max={Math.round(budget)}
            step={1}
            disabled={ws.limit === null}
            onChange={(value) => onLimit(value)}
            ariaLabel={`Limit for ${ws.name}`}
            ariaValueText={`${fmt(sliderValue)} tokens`}
            markers={
              totals.kbLimitOn ? (
                <BarMarker at={totals.kbPct} variant="tick" title="Organisation: bulk limit" />
              ) : undefined
            }
          >
            <BarSegment width={(ws.kbUsed / budget) * 100} className="bg-pending" />
          </BarSlider>
          <span className="text-sm text-muted-foreground">{help}</span>
          <span className="text-sm text-muted-foreground">
            The limit caps its bulk work only; its live mail continues.
          </span>
        </div>
        <ExtraBox
          extra={ws.extra}
          extraUsed={ws.extraUsed}
          extraDays={ws.extraDays}
          suggestion={suggestedExtra(ws)}
          initialAmount={suggestedExtra(ws)}
          onGrant={onGrant}
          onEnd={onEndExtra}
        />
      </div>
      <div className="flex flex-wrap gap-2.5 justify-between items-center">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove workspace
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};

/** The row shortcut gives the suggested extra for 3 days. */
const QUICK_EXTRA_END: ExtraEnd = 1;

const OrganisationView = () => {
  const [state, setState] = useState(initialOrgState);
  const [selected, setSelected] = useState<string | null>(null);
  /** Rows ticked for a bulk action (a separate thing from the one expanded row). */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const totals = orgTotals(state);
  const status = orgStatusLine(totals);
  const kbWidth = Math.min(100, (totals.kbTotal / totals.budget) * 100);
  const liveWidth = Math.min(
    100 - kbWidth,
    ((totals.total - totals.kbTotal) / totals.budget) * 100
  );
  const extraSpent = state.workspaces.reduce((sum, ws) => sum + ws.extraUsed, 0);

  const needle = query.trim().toLowerCase();
  let list = sortByUse(state.workspaces);
  if (needle) list = list.filter((ws) => ws.name.toLowerCase().includes(needle));
  const shown = needle || showAll ? list : list.slice(0, TOP_ROWS);
  const selectedWs = selected ? state.workspaces.find((ws) => ws.id === selected) : undefined;
  const rows = selectedWs && !shown.includes(selectedWs) ? [...shown, selectedWs] : shown;
  // Row bars are relative: the biggest workspace fills its bar.
  const biggest = Math.max(0.001, ...state.workspaces.map((ws) => ws.used + ws.extraUsed));

  /** A paused import with no extra left gets a one-click "Give extra" on its row. */
  const needsExtra = (ws: DemoWorkspace) =>
    ws.importing &&
    ws.extra - ws.extraUsed <= 0 &&
    totals.orgExtraLeft <= 0 &&
    (totals.kbPaused || totals.allStopped || (ws.limit !== null && ws.kbUsed >= ws.limit));

  const update = (id: string, change: (prev: typeof state) => typeof state) =>
    setState((prev) => (prev.workspaces.some((ws) => ws.id === id) ? change(prev) : prev));

  /** Bumped on Reset so the organisation extra box starts from its draft again. */
  const [generation, setGeneration] = useState(0);
  const [orgExtraOpen, setOrgExtraOpen] = useState(false);
  // A removed workspace drops out of the selection.
  const pickedIds = state.workspaces.filter((ws) => picked.has(ws.id)).map((ws) => ws.id);
  const togglePick = (id: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleRow = (id: string) => setSelected((current) => (current === id ? null : id));
  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleRow(id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Example organisation · {state.workspaces.length} workspaces · {state.day} Oct 2026 ·{' '}
        {LAST_DAY - state.day} days left
      </p>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-8 gap-y-3 items-end">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="budget-demo-org-budget">Monthly budget</FieldLabel>
              <BudgetInput
                id="budget-demo-org-budget"
                value={state.budget}
                step={10}
                onChange={(budget) => setState((prev) => ({ ...prev, budget }))}
              />
            </div>
            <BulkLimitField
              on={totals.kbLimitOn}
              pct={totals.kbPct}
              cap={totals.kbCap}
              onToggle={(kbLimitOn) => setState((prev) => ({ ...prev, kbLimitOn }))}
            />
          </div>
          <BarSlider
            value={state.kbPct}
            min={0}
            max={100}
            step={5}
            onChange={(value) => setState((prev) => ({ ...prev, kbPct: clampKbPct(value) }))}
            disabled={!totals.kbLimitOn}
            ariaLabel="Bulk processing may use at most, percent of the budget"
            ariaValueText={`${totals.kbPct}% of the budget`}
            markers={totals.kbLimitOn ? <BarMarker at={totals.kbPct} /> : undefined}
          >
            {/* Bulk work first, from 0: the end of the purple part is what the line is compared
                with. Live mail follows and may run past the line. */}
            <BarSegment width={kbWidth} className="bg-pending" />
            <BarSegment left={kbWidth} width={liveWidth} className="bg-primary" />
          </BarSlider>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span>
              Used <span className="font-mono">{fmt(totals.total)}</span> ({usd(totals.total)}):
            </span>
            <BulkLegend on={totals.kbLimitOn} used={totals.kbTotal} cap={totals.kbCap} />
            <span>
              <Swatch className="bg-primary" />
              Live mail <span className="font-mono">{fmt(totals.total - totals.kbTotal)}</span>
            </span>
            <span>
              <Swatch className="bg-muted border border-border" />
              Free <span className="font-mono">{fmt(totals.budget - totals.total)}</span>
            </span>
            <BulkLimitLegend on={totals.kbLimitOn} />
            {extraSpent > 0 && (
              <span>
                <Swatch className="bg-warning" />
                Extra for bulk work, outside the budget{' '}
                <span className="font-mono">{fmt(extraSpent)}</span>
              </span>
            )}
            {state.spentRemoved > 0 && (
              <span>
                Includes <span className="font-mono">{fmt(state.spentRemoved)}</span> spent by
                removed workspaces
              </span>
            )}
          </div>
          <StatusText tone={status.tone} text={status.text} testId="budget-demo-org-status" />
          {state.orgExtra > 0 || orgExtraOpen ? (
            <div className="flex flex-col gap-1.5 max-w-md">
              <ExtraBox
                key={generation}
                title="Extra for the whole organisation (bulk work)"
                extra={state.orgExtra}
                extraUsed={state.orgExtraUsed}
                extraDays={state.orgExtraDays}
                suggestion={suggestedOrgExtra(state)}
                initialAmount={suggestedOrgExtra(state)}
                onGrant={(amount, end) => setState((prev) => grantOrgWideExtra(prev, amount, end))}
                onEnd={() => setState((prev) => endOrgWideExtra(prev))}
              />
              <span className="text-sm text-muted-foreground">
                Any workspace&apos;s paused import uses it, after its own extra. No need to open a
                workspace.
              </span>
            </div>
          ) : (
            <div>
              <Button variant="outline" size="sm" onClick={() => setOrgExtraOpen(true)}>
                Give extra to the whole organisation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2.5 justify-between items-center">
            <h3 className="font-display text-base font-semibold">Workspaces</h3>
            <Input
              type="search"
              placeholder="Search"
              aria-label="Search workspaces"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full sm:w-56"
              size="sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Bars compare workspaces with each other (the biggest one is full); the % is each
            one&apos;s share of what the organisation used.
          </p>
          <BulkBar
            selected={pickedIds.length}
            selectable={list.length}
            onSelectAll={() => setPicked(new Set(list.map((ws) => ws.id)))}
            onUnselectAll={() => setPicked(new Set())}
            onSetLimit={(limit) => setState((prev) => setLimitMany(prev, pickedIds, limit))}
            onRemoveLimit={() => setState((prev) => setLimitMany(prev, pickedIds, null))}
            onGiveExtra={(amount, end) =>
              setState((prev) => grantExtraMany(prev, pickedIds, amount, end))
            }
          />
          <ul className="flex flex-col gap-0.5">
            {rows.length === 0 && <li className="text-muted-foreground">No workspace matches.</li>}
            {rows.map((ws) => {
              const open = ws.id === selected;
              const row = workspaceStatus(ws, totals);
              const share = totals.total > 0 ? Math.round((ws.used / totals.total) * 100) : 0;
              return (
                <li key={ws.id} data-testid={`budget-demo-row-${ws.id}`}>
                  <div className="flex gap-1 items-center">
                    <div className="pl-2">
                      <Checkbox
                        aria-label={`Select ${ws.name}`}
                        checked={picked.has(ws.id)}
                        onChange={(event) => togglePick(ws.id, event.target.checked)}
                      />
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      aria-controls={open ? `budget-demo-panel-${ws.id}` : undefined}
                      onClick={() => toggleRow(ws.id)}
                      onKeyDown={(event) => onRowKey(event, ws.id)}
                      className={cn(
                        'flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_11em_minmax(0,1.6fr)] gap-3.5 items-center p-3 rounded-lg cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        open && 'bg-accent rounded-b-none'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{ws.name}</div>
                        <div
                          className="flex overflow-hidden mt-1 h-1.5 rounded-full bg-muted"
                          title="Relative to the biggest workspace"
                        >
                          <span
                            className="h-full bg-primary"
                            style={{ width: `${(ws.used / biggest) * 100}%` }}
                          />
                          {ws.extraUsed > 0 && (
                            <span
                              className="h-full bg-warning"
                              style={{ width: `${(ws.extraUsed / biggest) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-sm">
                        {fmt(ws.used)}{' '}
                        <span className="text-muted-foreground">· {share}% of used</span>
                        {ws.limit !== null && (
                          <div className="text-muted-foreground">limit {fmt(ws.limit)}</div>
                        )}
                      </div>
                      <div
                        className={cn('text-sm', TONE_CLASS[row.tone])}
                        data-testid={`budget-demo-row-status-${ws.id}`}
                      >
                        {row.text}
                      </div>
                    </div>
                  </div>
                  {needsExtra(ws) && (
                    <div className="flex justify-end px-3 pb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update(ws.id, (prev) =>
                            grantOrgExtra(prev, ws.id, suggestedExtra(ws), QUICK_EXTRA_END)
                          )
                        }
                      >
                        Give +{fmt(suggestedExtra(ws))} extra · 3 days
                      </Button>
                    </div>
                  )}
                  {open && (
                    <WorkspacePanel
                      key={ws.id}
                      ws={ws}
                      totals={totals}
                      onLimit={(limit) =>
                        update(ws.id, (prev) => setWorkspaceLimit(prev, ws.id, limit))
                      }
                      onGrant={(amount, end) =>
                        update(ws.id, (prev) => grantOrgExtra(prev, ws.id, amount, end))
                      }
                      onEndExtra={() => update(ws.id, (prev) => endOrgExtra(prev, ws.id))}
                      onRemove={() => {
                        update(ws.id, (prev) => removeWorkspace(prev, ws.id));
                        setSelected(null);
                      }}
                      onClose={() => setSelected(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2.5 justify-between items-center">
            {!needle && list.length > TOP_ROWS ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((all) => !all)}>
                {showAll ? `Show top ${TOP_ROWS}` : `Show all ${list.length}`}
              </Button>
            ) : (
              <span />
            )}
            <TryItButtons>
              <Button variant="outline" size="sm" onClick={() => setState(simulateOrgDay)}>
                +1 day
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const added = addWorkspace(state);
                  setState(added.state);
                  setSelected(added.id);
                }}
              >
                Add a workspace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setState(initialOrgState());
                  setPicked(new Set());
                  setSelected(null);
                  setShowAll(false);
                  setGeneration((current) => current + 1);
                  setOrgExtraOpen(false);
                }}
              >
                Reset
              </Button>
            </TryItButtons>
          </div>
          <Log text={state.log} testId="budget-demo-org-log" />
        </CardContent>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

type DemoTab = 'organisation' | 'single';
const DEMO_TABS: Array<{ id: DemoTab; label: string }> = [
  { id: 'organisation', label: 'Organisation (many workspaces)' },
  { id: 'single', label: 'Single workspace' },
];

export const BudgetModelDemoSection = () => {
  const [tab, setTab] = useState<DemoTab>('organisation');
  return (
    <section
      aria-labelledby="budget-model-demo-title"
      className="flex flex-col gap-4 pt-6 mt-2 border-t border-border"
    >
      <div className="flex flex-col gap-1">
        <h2 id="budget-model-demo-title" className="font-display text-lg font-semibold">
          Budget model (demo)
        </h2>
        <p className="text-sm text-muted-foreground">
          A proposed way to budget AI per month: one budget, live mail takes what it needs, bulk
          processing (knowledge base) up to an optional limit, extra for big imports outside the
          budget.
        </p>
      </div>
      <Alert variant="warning" className="py-2.5 text-sm font-medium">
        Demo · proposed budget model · example numbers, nothing is saved
      </Alert>
      <Tabs variant="simple" tabs={DEMO_TABS} activeTab={tab} onTabChange={setTab}>
        {/* Both views stay mounted so switching tabs keeps each simulation where it was. */}
        <div hidden={tab !== 'organisation'} data-testid="budget-demo-view-organisation">
          <OrganisationView />
        </div>
        <div hidden={tab !== 'single'} data-testid="budget-demo-view-single">
          <SingleWorkspaceView />
        </div>
      </Tabs>
    </section>
  );
};
