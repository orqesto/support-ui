import { useState, type KeyboardEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/utils';
import {
  LAST_DAY,
  addWorkspace,
  reserveEdge,
  reserveFromEdge,
  defaultLimitFor,
  endOrgExtra,
  fmt,
  grantOrgExtra,
  initialOrgState,
  orgStatusLine,
  orgTotals,
  removeWorkspace,
  setWorkspaceLimit,
  simulateOrgDay,
  sortByUse,
  suggestedExtra,
  usd,
  workspaceStatus,
  type DemoWorkspace,
  type ExtraEnd,
  type OrgTotals,
} from './budgetModelDemo.rules';
import {
  BudgetInput,
  ExtraBox,
  FieldLabel,
  Log,
  STRIPES,
  StatusText,
  Swatch,
  TONE_CLASS,
  TryItButtons,
} from './BudgetModelDemoParts';
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
      ? 'The blue part is what it used this month; the grey tick is where the organisation knowledge base stops.'
      : ws.used >= ws.limit
        ? 'Below what it already used: its knowledge base stops now; live mail continues.'
        : `${fmt(ws.limit - ws.used)} left for this workspace.`;
  return (
    <div
      id={`budget-demo-panel-${ws.id}`}
      className="flex flex-col gap-4 px-4 pt-1.5 pb-4 rounded-b-lg bg-accent"
    >
      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Limit this workspace</FieldLabel>
          <Toggle
            checked={ws.limit !== null}
            onChange={(on) => onLimit(on ? sliderValue : null)}
            label="At most per month"
          />
          <span className="font-mono text-lg">
            {ws.limit !== null
              ? `${fmt(ws.limit)} · ${Math.round((ws.limit / budget) * 100)}% of the budget`
              : 'No own limit · shares the whole budget'}
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
              <BarMarker
                at={reserveEdge(totals.reservePct)}
                variant="tick"
                title="Organisation: knowledge base stops here"
              />
            }
          >
            <BarSegment width={(ws.used / budget) * 100} className="bg-primary" />
          </BarSlider>
          <span className="text-sm text-muted-foreground">{help}</span>
          <span className="text-sm text-muted-foreground">
            The limit caps its knowledge base only; its live mail continues.
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

const OrganisationView = () => {
  const [state, setState] = useState(initialOrgState);
  const [selected, setSelected] = useState<string | null>(null);
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

  const update = (id: string, change: (prev: typeof state) => typeof state) =>
    setState((prev) => (prev.workspaces.some((ws) => ws.id === id) ? change(prev) : prev));

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
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Kept free for live mail · drag the edge of the striped part</FieldLabel>
              <span className="font-mono text-lg">
                {totals.reservePct}% · {fmt(totals.reserve)} · the knowledge base stops when only
                this is left
              </span>
            </div>
          </div>
          <BarSlider
            value={reserveEdge(state.reservePct)}
            min={0}
            max={100}
            step={5}
            onChange={(value) =>
              setState((prev) => ({ ...prev, reservePct: reserveFromEdge(value) }))
            }
            ariaLabel="Kept free for live mail: where it starts on the budget bar"
            ariaValueText={`${totals.reservePct}% of the budget kept free for live mail`}
            markers={<BarMarker at={reserveEdge(totals.reservePct)} />}
          >
            <BarSegment width={kbWidth} className="bg-pending" />
            <BarSegment left={kbWidth} width={liveWidth} className="bg-primary" />
            <BarSegment width={totals.reservePct} fromRight style={STRIPES} />
          </BarSlider>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span>
              Used <span className="font-mono">{fmt(totals.total)}</span> ({usd(totals.total)}):
            </span>
            <span>
              <Swatch className="bg-pending" />
              Knowledge base <span className="font-mono">{fmt(totals.kbTotal)}</span>
            </span>
            <span>
              <Swatch className="bg-primary" />
              Live mail <span className="font-mono">{fmt(totals.total - totals.kbTotal)}</span>
            </span>
            <span>
              <Swatch className="!w-0.5 bg-foreground" />
              Knowledge base stops here
            </span>
            <span>
              <Swatch className="bg-success" />
              Kept free for live mail
            </span>
            {extraSpent > 0 && (
              <span>
                <Swatch className="bg-warning" />
                Extra for the knowledge base, outside the budget{' '}
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
          <ul className="flex flex-col gap-0.5">
            {rows.length === 0 && <li className="text-muted-foreground">No workspace matches.</li>}
            {rows.map((ws) => {
              const open = ws.id === selected;
              const row = workspaceStatus(ws, totals);
              const share = totals.total > 0 ? Math.round((ws.used / totals.total) * 100) : 0;
              return (
                <li key={ws.id} data-testid={`budget-demo-row-${ws.id}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    aria-controls={open ? `budget-demo-panel-${ws.id}` : undefined}
                    onClick={() => toggleRow(ws.id)}
                    onKeyDown={(event) => onRowKey(event, ws.id)}
                    className={cn(
                      'grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_11em_minmax(0,1.6fr)] gap-3.5 items-center p-3 rounded-lg cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
                  setSelected(null);
                  setShowAll(false);
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
          A proposed way to budget AI per month: live mail first, the knowledge base up to a line,
          extra for big imports outside the budget.
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
