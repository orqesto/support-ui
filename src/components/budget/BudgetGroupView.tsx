import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import { Toggle } from '@/components/ui/Toggle';
import { Select } from '@/components/ui/Select';
import type {
  CanEdit,
  ExtraTarget,
  GroupDetail,
  GroupUpdate,
  OrganisationMode,
  WorkspaceRow,
} from '@/services/budgets.service';
import { BudgetBar } from './BudgetBar';
import { BulkBar } from './BulkBar';
import { BulkLimitField, FieldLabel } from './BulkLimitField';
import { ExtraBox } from './ExtraBox';
import { SeparateGroupExtra } from './SeparateGroupExtra';
import { RequestExtraBox, type RequestTarget } from './RequestExtraBox';
import { StatusText } from './StatusText';
import { WorkspaceRows, panelIdFor } from './WorkspaceRows';
import {
  ADVANCED_ANCHOR,
  MICROS_PER_USD,
  QUICK_EXTRA_END,
  dollarsText,
  extraEndsText,
  extraLeft,
  fmtMoney,
  limitSliderTop,
  parseDollars,
  type ExtraEndChoice,
} from './budget.rules';

/**
 * The body of one budget group (an organisation or a standalone workspace): budget, bulk limit,
 * the bar, the status line, organisation-wide extra and the workspace list. Shared by the
 * platform console (mode 'platform') and the organisation console (mode 'organisation'); what can
 * be changed is decided by `canEdit` from the API, never by the mode.
 */

const TOP_ROWS = 8;

export type BudgetGroupViewProps = {
  detail: GroupDetail;
  canEdit: CanEdit;
  mode: 'platform' | 'organisation';
  /** Hosted: a budget can come from the plans, so an override can be dropped again. */
  plansAvailable?: boolean;
  /** A write is on its way: buttons that start another one are disabled. */
  busy?: boolean;
  /** May answer whether the save went through (the bulk line goes back on `false`). */
  onUpdate?: (body: GroupUpdate) => void | Promise<boolean>;
  /** `limit` null removes the workspaces' own bulk limit. Micros. */
  onSetLimits?: (organizationIds: number[], limit: number | null) => void;
  onGiveExtra?: (
    targets: ExtraTarget[],
    amountMicros: number | 'suggested',
    end: ExtraEndChoice
  ) => void;
  onEndExtra?: (grantIds: number[]) => void;
  /**
   * Organisation mode: ask the platform admin for extra (null = the whole organisation). Answers
   * whether it was sent. Nobody but the platform admin gives extra, so there is no Give / End
   * control in this mode.
   */
  onRequestExtra?: (
    organizationId: number | null,
    amountMicros: number,
    reason: string | undefined
  ) => void | Promise<boolean>;
  /** Change the organisation's AI mode (shown when the API says `canEdit.mode`). Answers whether it was saved. */
  onSetMode?: (mode: OrganisationMode) => void | Promise<boolean>;
  /** Where a workspace's own budget page is (the platform console); omit where there is none. */
  workspacePath?: (organizationId: number) => string;
};

const MODE_OPTIONS: Array<{ value: OrganisationMode; label: string }> = [
  { value: 'separate', label: 'Separate: every workspace has its own AI budget' },
  { value: 'shared', label: 'Shared: one AI budget for the whole organisation' },
];

/**
 * An organisation's AI mode (separate / shared). Read-only text unless `canEdit`; a change applies
 * from the next reset, so a pending one is shown under the select.
 */
export const ModeField = ({
  mode,
  canEdit,
  busy,
  onSetMode,
}: {
  mode: NonNullable<GroupDetail['mode']>;
  canEdit: boolean;
  busy?: boolean;
  onSetMode?: (mode: OrganisationMode) => void | Promise<boolean>;
}) => {
  const label = (value: OrganisationMode) =>
    MODE_OPTIONS.find((option) => option.value === value)?.label ?? value;
  return (
    <div className="flex flex-col gap-1.5 max-w-md" data-testid="budget-mode">
      {canEdit ? (
        <Select
          id="budget-mode-select"
          label="How workspaces share AI"
          // A queued change is what the admin chose last: showing it lets them pick the mode in
          // force again, which the backend takes as "cancel the queued change".
          value={mode.next?.mode ?? mode.current}
          disabled={busy}
          onChange={(next: string) => {
            if (next !== (mode.next?.mode ?? mode.current)) void onSetMode?.(next as OrganisationMode);
          }}
          options={MODE_OPTIONS}
        />
      ) : (
        <>
          <FieldLabel>How workspaces share AI</FieldLabel>
          <span className="text-sm">{label(mode.current)}</span>
        </>
      )}
      {mode.next && (
        <span className="text-sm text-warning" data-testid="budget-mode-next">
          Changes to {mode.next.mode} on {new Date(mode.next.from).toLocaleDateString(undefined, { timeZone: 'UTC' })} (the
          next reset). Choose {mode.current} again to cancel it.
        </span>
      )}
    </div>
  );
};

export const BudgetField = ({
  detail,
  canEdit,
  plansAvailable,
  busy,
  onUpdate,
}: {
  detail: Pick<GroupDetail, 'key' | 'budget' | 'budgetSource'>;
  canEdit: boolean;
  plansAvailable: boolean;
  busy?: boolean;
  onUpdate?: (body: GroupUpdate) => void | Promise<boolean>;
}) => {
  const inputId = `budget-${detail.key}`;
  const [draft, setDraft] = useState(() => dollarsText(detail.budget));
  const [overriding, setOverriding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Budget per billing period</FieldLabel>
        <span className="font-mono text-lg" data-testid="budget-readonly">
          {detail.budget === null
            ? 'No budget set'
            : `${fmtMoney(detail.budget)} / billing period`}
        </span>
      </div>
    );

  // The budget is not the group's own: hosted plans' sum, or the self-hosted standalone default.
  const inherited = detail.budgetSource === 'plans' || detail.budgetSource === 'default';
  if (inherited && !overriding)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Budget per billing period</FieldLabel>
        <div className="flex flex-wrap gap-2.5 items-center">
          <span className="font-mono text-lg">
            {`${detail.budgetSource === 'plans' ? 'From plans' : 'Default for standalone workspaces'}: ${
              detail.budget === null ? '—' : fmtMoney(detail.budget)
            }`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOverriding(true)}>
            Override
          </Button>
        </div>
      </div>
    );

  const save = () => {
    const budget = parseDollars(draft);
    if (Number.isNaN(budget)) {
      setError('Type an amount in dollars above 0, or leave it empty for no budget.');
      return;
    }
    setError(null);
    void onUpdate?.({ budget });
  };
  const saved = dollarsText(detail.budget);
  const changed = draft.trim() !== saved || (inherited && overriding);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={inputId}>Budget per billing period</FieldLabel>
      <div className="flex flex-wrap gap-2.5 items-center">
        <Input
          id={inputId}
          type="number"
          min={0}
          step="0.01"
          aria-label="Budget per billing period, dollars"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
          className="w-28 font-mono text-lg"
        />
        <span className="text-sm text-muted-foreground">US dollars per billing period</span>
        {changed && (
          <Button size="sm" disabled={busy} onClick={save}>
            Save budget
          </Button>
        )}
        {plansAvailable && (detail.budgetSource === 'override' || overriding) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setOverriding(false);
              if (detail.budgetSource === 'override') void onUpdate?.({ budget: null });
            }}
          >
            Use the plans
          </Button>
        )}
      </div>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
};

const WorkspacePanel = ({
  row,
  detail,
  canEdit,
  busy,
  target,
  onSetLimits,
  onGiveExtra,
  onEndExtra,
  onClose,
  separate,
}: {
  /** A `separate` organisation: the workspace has its own group, whose bulk % the row does not carry. */
  separate: boolean;
  row: WorkspaceRow;
  detail: GroupDetail;
  canEdit: CanEdit;
  busy?: boolean;
  target: ExtraTarget;
  onSetLimits?: BudgetGroupViewProps['onSetLimits'];
  onGiveExtra?: BudgetGroupViewProps['onGiveExtra'];
  onEndExtra?: BudgetGroupViewProps['onEndExtra'];
  onClose: () => void;
}) => {
  const top = limitSliderTop({
    budget: detail.budget,
    groupSpend: detail.spend.total,
    limits: [row.bulkLimit],
    spends: [row.spend.total],
  });
  const [limitOn, setLimitOn] = useState(row.bulkLimit !== null);
  const [draft, setDraft] = useState(() =>
    Math.min(
      top,
      Math.max(
        1,
        Math.round((row.bulkLimit ?? row.spend.bulk + 5 * MICROS_PER_USD) / MICROS_PER_USD)
      )
    )
  );
  const savedDollars = row.bulkLimit === null ? null : Math.round(row.bulkLimit / MICROS_PER_USD);
  // A workspace of a separate organisation is rated against its OWN budget.
  const rowBudget = row.budget ?? detail.budget;

  return (
    <div
      id={panelIdFor(row.organizationId)}
      className="flex flex-col gap-4 px-4 pt-1.5 pb-4 rounded-b-lg bg-accent"
    >
      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Limit this workspace&apos;s bulk processing</FieldLabel>
          {canEdit.workspaceLimits ? (
            <>
              <Toggle
                checked={limitOn}
                disabled={busy}
                onChange={(on) => {
                  setLimitOn(on);
                  if (!on && row.bulkLimit !== null) onSetLimits?.([row.organizationId], null);
                }}
                label="At most per billing period"
              />
              <span className="font-mono text-lg">
                {!limitOn
                  ? 'No own limit · only the organisation bulk limit applies'
                  : rowBudget
                    ? `${fmtMoney(draft * MICROS_PER_USD)} · ${Math.round(((draft * MICROS_PER_USD) / rowBudget) * 100)}% of the budget`
                    : fmtMoney(draft * MICROS_PER_USD)}
              </span>
              <BarSlider
                value={draft}
                min={1}
                max={top}
                step={1}
                disabled={!limitOn}
                onChange={setDraft}
                ariaLabel={`Limit for ${row.name}, dollars`}
                ariaValueText={fmtMoney(draft * MICROS_PER_USD)}
                markers={
                  !separate && detail.bulkLimitOn && rowBudget ? (
                    <BarMarker
                      at={Math.min(100, (rowBudget * detail.bulkPct) / (top * MICROS_PER_USD))}
                      variant="tick"
                      title="Organisation: bulk limit"
                    />
                  ) : undefined
                }
              >
                <BarSegment
                  width={Math.min(100, (row.spend.bulk / MICROS_PER_USD / top) * 100)}
                  className="bg-pending"
                />
              </BarSlider>
              {limitOn && draft !== savedDollars && (
                <div>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onSetLimits?.([row.organizationId], draft * MICROS_PER_USD)}
                  >
                    Set limit
                  </Button>
                </div>
              )}
            </>
          ) : (
            <span className="font-mono text-lg">
              {row.bulkLimit === null ? 'No own limit' : `At most ${fmtMoney(row.bulkLimit)}`}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            The limit caps its bulk work only; its live mail continues.
          </span>
        </div>
        {canEdit.grant ? (
          <ExtraBox
            key={`extra-${row.organizationId}`}
            extra={row.extra}
            suggestion={row.suggestedExtra}
            initialAmount={row.suggestedExtra}
            busy={busy}
            onGive={(amountMicros, end) => onGiveExtra?.([target], amountMicros, end)}
            onEnd={() => row.extra && onEndExtra?.(row.extra.grantIds)}
          />
        ) : (
          row.extra && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Extra for bulk work</FieldLabel>
              <span className="font-mono text-lg">{fmtMoney(row.extra.amountMicros)}</span>
              <span className="text-sm text-muted-foreground">
                {fmtMoney(row.extra.usedMicros)} used · {extraEndsText(row.extra.endsAt)}
              </span>
            </div>
          )
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};

export const BudgetGroupView = ({
  detail,
  canEdit: apiCanEdit,
  mode,
  plansAvailable = false,
  busy,
  onUpdate,
  onSetLimits,
  onGiveExtra,
  onEndExtra,
  onRequestExtra,
  onSetMode,
  workspacePath,
}: BudgetGroupViewProps) => {
  // Only the platform admin gives extra, and the budget is never set from the organisation console
  // (its PUT takes no budget): there the platform admin, too, gets neither control.
  // A `separate` organisation (the default) has no budget, bulk line or extra of its own: the
  // backend refuses those writes (400), each workspace has them. Only the rows stay editable.
  const separate = detail.kind === 'alliance' && detail.mode?.current === 'separate';
  const baseCanEdit: CanEdit =
    mode === 'organisation' ? { ...apiCanEdit, grant: false, budget: false } : apiCanEdit;
  const canEdit: CanEdit = separate ? { ...baseCanEdit, budget: false, bulk: false } : baseCanEdit;
  const [requestOpen, setRequestOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [groupExtraOpen, setGroupExtraOpen] = useState(false);

  const allianceId = detail.kind === 'alliance' ? detail.id : null;
  const targetOf = (organizationId: number): ExtraTarget => ({ allianceId, organizationId });
  const cap = detail.budget && detail.bulkLimitOn ? (detail.budget * detail.bulkPct) / 100 : 0;

  const needle = query.trim().toLowerCase();
  const rows = [...detail.rows].sort((left, right) => right.spend.total - left.spend.total);
  const list = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
  const shown = needle || showAll ? list : list.slice(0, TOP_ROWS);
  const openRow = openId === null ? undefined : rows.find((row) => row.organizationId === openId);
  const visible = openRow && !shown.includes(openRow) ? [...shown, openRow] : shown;
  // A workspace that left the group drops out of the selection.
  const pickedRows = rows.filter((row) => picked.has(row.organizationId));
  const pickedIds = pickedRows.map((row) => row.organizationId);
  const canPick = canEdit.workspaceLimits || canEdit.grant;
  const suggestedForGroup = Math.max(
    5 * MICROS_PER_USD,
    rows.filter((row) => row.bulkRunning).reduce((sum, row) => sum + row.suggestedExtra, 0)
  );

  // "% of the budget" in the bulk bar: a separate organisation's workspaces each have their own
  // budget, so it is shown only when every picked workspace has the same one.
  const pickedBudgets = new Set(pickedRows.map((row) => row.budget));
  const bulkBarBudget = separate
    ? pickedBudgets.size === 1
      ? ([...pickedBudgets][0] ?? null)
      : null
    : detail.budget;

  const requestTargets: RequestTarget[] = [
    ...(separate
      ? []
      : [{ organizationId: null, label: 'Whole organisation', suggestion: suggestedForGroup }]),
    ...rows.map((row) => ({
      organizationId: row.organizationId,
      label: row.name,
      suggestion: row.suggestedExtra,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-8 gap-y-3 items-end">
            <BudgetField
              key={`${detail.key}-${detail.budget}-${detail.budgetSource}`}
              detail={detail}
              canEdit={canEdit.budget}
              plansAvailable={plansAvailable}
              busy={busy}
              onUpdate={onUpdate}
            />
            <BulkLimitField
              on={detail.bulkLimitOn}
              pct={detail.bulkPct}
              cap={cap}
              canEdit={canEdit.bulk && !busy}
              onToggle={(bulkLimitOn) => onUpdate?.({ bulkLimitOn })}
            />
          </div>
          {detail.mode && (
            <ModeField
              mode={detail.mode}
              canEdit={canEdit.mode && Boolean(onSetMode)}
              busy={busy}
              onSetMode={onSetMode}
            />
          )}
          <BudgetBar
            budget={detail.budget}
            spend={detail.spend}
            removedSpend={detail.removedSpend.total}
            tokens={detail.tokens}
            bulkLimitOn={detail.bulkLimitOn}
            bulkPct={detail.bulkPct}
            bulkPctMin={detail.bulkPctMin}
            bulkPctMax={detail.bulkPctMax}
            canEdit={canEdit.bulk}
            onBulkPctChange={(bulkPct) => onUpdate?.({ bulkPct })}
          />
          <StatusText
            tone={detail.status.tone}
            text={detail.status.text}
            testId="budget-group-status"
          />
          {separate && (
            <p className="text-sm text-muted-foreground" data-testid="budget-separate-note">
              Each workspace has its own AI allowance.{' '}
              {workspacePath
                ? "To change one, click the workspace's name in the list to open its own budget page."
                : "Change it on the workspace's row."}{' '}
              The figures above are the sum of the workspaces.
            </p>
          )}
          {separate && detail.groupExtra && (
            <SeparateGroupExtra
              extra={detail.groupExtra}
              busy={busy}
              onEnd={canEdit.grant ? onEndExtra : undefined}
            />
          )}
          {detail.kind === 'alliance' &&
            !separate &&
            (canEdit.grant ? (
              detail.groupExtra || groupExtraOpen ? (
                <div className="flex flex-col gap-1.5 max-w-md">
                  <ExtraBox
                    key={`group-extra-${detail.key}`}
                    title="Extra for the whole organisation (bulk work)"
                    extra={detail.groupExtra}
                    suggestion={suggestedForGroup}
                    initialAmount={suggestedForGroup}
                    busy={busy}
                    onGive={(amountMicros, end) =>
                      onGiveExtra?.(
                        [{ allianceId: detail.id, organizationId: null }],
                        amountMicros,
                        end
                      )
                    }
                    onEnd={() => detail.groupExtra && onEndExtra?.(detail.groupExtra.grantIds)}
                  />
                  <span className="text-sm text-muted-foreground">
                    Any workspace&apos;s paused import uses it, after its own extra. No need to open
                    a workspace.
                  </span>
                </div>
              ) : (
                <div>
                  <Button variant="outline" size="sm" onClick={() => setGroupExtraOpen(true)}>
                    Give extra to the whole organisation
                  </Button>
                </div>
              )
            ) : (
              detail.groupExtra && (
                <p className="text-sm text-muted-foreground">
                  Extra for the whole organisation: {fmtMoney(detail.groupExtra.amountMicros)},{' '}
                  {fmtMoney(extraLeft(detail.groupExtra))} left ·{' '}
                  {extraEndsText(detail.groupExtra.endsAt)}
                </p>
              )
            ))}
          {mode === 'organisation' &&
            onRequestExtra &&
            (requestOpen ? (
              <RequestExtraBox
                targets={requestTargets}
                initialAmount={suggestedForGroup}
                busy={busy}
                onRequest={(amountMicros, reason, organizationId) =>
                  onRequestExtra(organizationId, amountMicros, reason)
                }
              />
            ) : (
              <div>
                <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
                  Request extra
                </Button>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2.5 justify-between items-center">
            <h3 className="font-display text-base font-semibold">Workspaces</h3>
            <SearchInput
              placeholder="Search workspaces"
              value={query}
              onChange={setQuery}
              className="w-full sm:w-56"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Bars compare workspaces with each other (the biggest one is full); the % is each
            one&apos;s share of what the {mode === 'platform' ? 'group' : 'organisation'} used.
          </p>
          {canPick && (
            <BulkBar
              selected={pickedIds.length}
              budget={bulkBarBudget}
              top={limitSliderTop({
                budget: detail.budget,
                groupSpend: detail.spend.total,
                limits: pickedRows.map((row) => row.bulkLimit),
                spends: pickedRows.map((row) => row.spend.total),
              })}
              busy={busy}
              selectable={list.length}
              onSelectAll={() => setPicked(new Set(list.map((row) => row.organizationId)))}
              onUnselectAll={() => setPicked(new Set())}
              onSetLimit={(limit) => onSetLimits?.(pickedIds, limit)}
              onRemoveLimit={() => onSetLimits?.(pickedIds, null)}
              onGiveExtra={(amountMicros, end) =>
                onGiveExtra?.(
                  pickedIds.map((id) => targetOf(id)),
                  amountMicros,
                  end
                )
              }
              withExtra={pickedRows.filter((row) => row.extra).length}
              onEndExtra={() =>
                onEndExtra?.(pickedRows.flatMap((row) => row.extra?.grantIds ?? []))
              }
              canLimit={canEdit.workspaceLimits}
              canGrant={canEdit.grant}
            />
          )}
          <WorkspaceRows
            rows={visible}
            groupTotal={detail.spend.total}
            workspacePath={separate ? workspacePath : undefined}
            openId={openId}
            onToggleOpen={(id) => setOpenId((current) => (current === id ? null : id))}
            busy={busy}
            picked={canPick ? picked : undefined}
            onTogglePick={
              canPick
                ? (id, on) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (on) next.add(id);
                      else next.delete(id);
                      return next;
                    })
                : undefined
            }
            renderPanel={(row) => (
              <WorkspacePanel
                key={row.organizationId}
                row={row}
                detail={detail}
                canEdit={canEdit}
                busy={busy}
                target={targetOf(row.organizationId)}
                onSetLimits={onSetLimits}
                onGiveExtra={onGiveExtra}
                onEndExtra={onEndExtra}
                onClose={() => setOpenId(null)}
                separate={separate}
              />
            )}
            onGiveSuggested={
              canEdit.grant
                ? (row) =>
                    onGiveExtra?.(
                      [targetOf(row.organizationId)],
                      row.suggestedExtra,
                      QUICK_EXTRA_END
                    )
                : undefined
            }
          />
          <div className="flex flex-wrap gap-2.5 justify-between items-center">
            {!needle && list.length > TOP_ROWS ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((all) => !all)}>
                {showAll ? `Show top ${TOP_ROWS}` : `Show all ${list.length}`}
              </Button>
            ) : (
              <span />
            )}
            {mode === 'platform' && (
              <Link
                to={`/console/platform/ai-spend#${ADVANCED_ANCHOR}`}
                className="text-sm text-primary hover:underline"
              >
                Advanced
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
