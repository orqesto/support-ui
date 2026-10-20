import { useState } from 'react';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  LAST_DAY,
  SINGLE_WORKSPACE_NAME,
  clampKbPct,
  endSingleExtra,
  fmt,
  grantSingleExtra,
  initialSingleState,
  simulateSingleDay,
  singleMonthLine,
  singleStatusLine,
  singleTotals,
  startSingleImport,
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
  TryItButtons,
} from './BudgetModelDemoParts';

/** Budget model demo, "Single workspace" view: a workspace with its own budget. Demo only. */
// ---------------------------------------------------------------------------------------------
// Single workspace
// ---------------------------------------------------------------------------------------------

export const SingleWorkspaceView = () => {
  const [state, setState] = useState(initialSingleState);
  /** Bumped on Reset so the extra box starts from its draft again. */
  const [generation, setGeneration] = useState(0);
  const totals = singleTotals(state);
  const status = singleStatusLine(state);
  const kbWidth = Math.min(100, (state.kbUsed / totals.budget) * 100);
  const liveWidth = Math.min(100 - kbWidth, (state.liveUsed / totals.budget) * 100);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Example workspace · {state.day} Oct 2026 · {LAST_DAY - state.day} days left
      </p>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-8 gap-y-3 items-end">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Workspace</FieldLabel>
              <span className="text-lg font-semibold">{SINGLE_WORKSPACE_NAME}</span>
              <span className="text-sm text-muted-foreground">
                Not in an organisation: it has its own budget.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="budget-demo-single-budget">Monthly budget</FieldLabel>
              <BudgetInput
                id="budget-demo-single-budget"
                value={state.budget}
                step={5}
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
            <BulkLegend on={totals.kbLimitOn} used={state.kbUsed} cap={totals.kbCap} />
            <span>
              <Swatch className="bg-primary" />
              Live mail <span className="font-mono">{fmt(state.liveUsed)}</span>
            </span>
            <span>
              <Swatch className="bg-muted border border-border" />
              Free <span className="font-mono">{fmt(totals.budget - totals.used)}</span>
            </span>
            <BulkLimitLegend on={totals.kbLimitOn} />
            {state.extraUsed > 0 && (
              <span>
                <Swatch className="bg-warning" />
                Extra used, outside the budget{' '}
                <span className="font-mono">{fmt(state.extraUsed)}</span>
              </span>
            )}
          </div>
          <StatusText tone={status.tone} text={status.text} testId="budget-demo-single-status" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            <ExtraBox
              key={generation}
              extra={state.extra}
              extraUsed={state.extraUsed}
              extraDays={state.extraDays}
              initialAmount={20}
              onGrant={(amount, end) => setState((prev) => grantSingleExtra(prev, amount, end))}
              onEnd={() => setState(endSingleExtra)}
            />
            <div className="flex flex-col gap-1.5">
              <FieldLabel>This month</FieldLabel>
              <span className="text-sm text-muted-foreground">{singleMonthLine(state)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 justify-between items-center">
            <span className="text-sm text-muted-foreground">
              A workspace on its own needs no per-workspace limit: its budget already is the limit.
            </span>
            <TryItButtons>
              <Button variant="outline" size="sm" onClick={() => setState(simulateSingleDay)}>
                +1 day
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState((prev) => startSingleImport(prev))}
              >
                Start a 30M KB import
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setState(initialSingleState());
                  setGeneration((count) => count + 1);
                }}
              >
                Reset
              </Button>
            </TryItButtons>
          </div>
          <Log text={state.log} testId="budget-demo-single-log" />
        </CardContent>
      </Card>
    </div>
  );
};
