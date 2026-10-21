import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import { Toggle } from '@/components/ui/Toggle';
import type {
  CanEdit,
  ExtraTarget,
  GroupDetail,
  GroupUpdate,
  WorkspaceRow,
} from '@/services/budgets.service';
import { BudgetBar } from './BudgetBar';
import { BulkBar } from './BulkBar';
import { BulkLimitField, FieldLabel } from './BulkLimitField';
import { ExtraBox } from './ExtraBox';
import { RequestExtraBox, type RequestTarget } from './RequestExtraBox';
import { StatusText } from './StatusText';
import { WorkspaceRows, panelIdFor } from './WorkspaceRows';
import {
  ADVANCED_ANCHOR,
  MILLION,
  QUICK_EXTRA_END,
  extraEndsText,
  extraLeft,
  fmt,
  fmtTokens,
  limitSliderTop,
  usdTokens,
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
  /** `limit` null removes the workspaces' own bulk limit. Tokens. */
  onSetLimits?: (organizationIds: number[], limit: number | null) => void;
  onGiveExtra?: (targets: ExtraTarget[], tokens: number | 'suggested', end: ExtraEndChoice) => void;
  onEndExtra?: (grantIds: number[]) => void;
  /**
   * Organisation mode: ask the platform admin for extra (null = the whole organisation). Answers
   * whether it was sent. Nobody but the platform admin gives extra, so there is no Give / End
   * control in this mode.
   */
  onRequestExtra?: (
    organizationId: number | null,
    tokens: number,
    reason: string | undefined
  ) => void | Promise<boolean>;
};

/** Million tokens typed by a person → tokens; '' = no budget; NaN = not a number. */
const parseMillions = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? Math.round(value * MILLION) : Number.NaN;
};

const millionsText = (tokens: number | null) =>
  tokens === null ? '' : String(Math.round((tokens / MILLION) * 10) / 10);

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
  const [draft, setDraft] = useState(() => millionsText(detail.budget));
  const [overriding, setOverriding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Monthly budget</FieldLabel>
        <span className="font-mono text-lg" data-testid="budget-readonly">
          {detail.budget === null
            ? 'No budget set'
            : `${fmtTokens(detail.budget)} ${usdTokens(detail.budget)} / month`}
        </span>
      </div>
    );

  // The budget is not the group's own: hosted plans' sum, or the self-hosted standalone default.
  const inherited = detail.budgetSource === 'plans' || detail.budgetSource === 'default';
  if (inherited && !overriding)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Monthly budget</FieldLabel>
        <div className="flex flex-wrap gap-2.5 items-center">
          <span className="font-mono text-lg">
            {`${detail.budgetSource === 'plans' ? 'From plans' : 'Default for standalone workspaces'}: ${
              detail.budget === null ? '—' : fmtTokens(detail.budget)
            }`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOverriding(true)}>
            Override
          </Button>
        </div>
      </div>
    );

  const save = () => {
    const budget = parseMillions(draft);
    if (Number.isNaN(budget)) {
      setError('Type a number of million tokens above 0, or leave it empty for no budget.');
      return;
    }
    setError(null);
    void onUpdate?.({ budget });
  };
  const saved = millionsText(detail.budget);
  const changed = draft.trim() !== saved || (inherited && overriding);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={inputId}>Monthly budget</FieldLabel>
      <div className="flex flex-wrap gap-2.5 items-center">
        <Input
          id={inputId}
          type="number"
          min={0}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
          className="w-28 font-mono text-lg"
        />
        <span className="text-sm text-muted-foreground">million tokens</span>
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
}: {
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
      Math.max(1, Math.round((row.bulkLimit ?? row.spend.bulk + 10 * MILLION) / MILLION))
    )
  );
  const savedM = row.bulkLimit === null ? null : Math.round(row.bulkLimit / MILLION);

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
                label="At most per month"
              />
              <span className="font-mono text-lg">
                {!limitOn
                  ? 'No own limit · only the organisation bulk limit applies'
                  : detail.budget
                    ? `${fmt(draft)} · ${Math.round(((draft * MILLION) / detail.budget) * 100)}% of the budget`
                    : fmt(draft)}
              </span>
              <BarSlider
                value={draft}
                min={1}
                max={top}
                step={1}
                disabled={!limitOn}
                onChange={setDraft}
                ariaLabel={`Limit for ${row.name}`}
                ariaValueText={`${fmt(draft)} tokens`}
                markers={
                  detail.bulkLimitOn && detail.budget ? (
                    <BarMarker
                      at={Math.min(100, (detail.budget * detail.bulkPct) / (top * MILLION))}
                      variant="tick"
                      title="Organisation: bulk limit"
                    />
                  ) : undefined
                }
              >
                <BarSegment
                  width={Math.min(100, (row.spend.bulk / MILLION / top) * 100)}
                  className="bg-pending"
                />
              </BarSlider>
              {limitOn && draft !== savedM && (
                <div>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onSetLimits?.([row.organizationId], draft * MILLION)}
                  >
                    Set limit
                  </Button>
                </div>
              )}
            </>
          ) : (
            <span className="font-mono text-lg">
              {row.bulkLimit === null ? 'No own limit' : `At most ${fmtTokens(row.bulkLimit)}`}
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
            onGive={(tokens, end) => onGiveExtra?.([target], tokens, end)}
            onEnd={() => row.extra && onEndExtra?.(row.extra.grantIds)}
          />
        ) : (
          row.extra && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Extra for bulk work</FieldLabel>
              <span className="font-mono text-lg">+{fmtTokens(row.extra.tokens)}</span>
              <span className="text-sm text-muted-foreground">
                {fmtTokens(row.extra.used)} used · {extraEndsText(row.extra.endsAt)}
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
}: BudgetGroupViewProps) => {
  // Only the platform admin gives extra, and the budget is never set from the organisation console
  // (its PUT takes no budget): there the platform admin, too, gets neither control.
  const canEdit: CanEdit =
    mode === 'organisation' ? { ...apiCanEdit, grant: false, budget: false } : apiCanEdit;
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
    5 * MILLION,
    rows.filter((row) => row.bulkRunning).reduce((sum, row) => sum + row.suggestedExtra, 0)
  );

  const requestTargets: RequestTarget[] = [
    { organizationId: null, label: 'Whole organisation', suggestion: suggestedForGroup },
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
          <BudgetBar
            budget={detail.budget}
            spend={detail.spend}
            removedSpend={detail.removedSpend.total}
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
          {detail.kind === 'alliance' &&
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
                    onGive={(tokens, end) =>
                      onGiveExtra?.([{ allianceId: detail.id, organizationId: null }], tokens, end)
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
                  Extra for the whole organisation: +{fmtTokens(detail.groupExtra.tokens)},{' '}
                  {fmtTokens(extraLeft(detail.groupExtra))} left ·{' '}
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
                onRequest={(tokens, reason, organizationId) =>
                  onRequestExtra(organizationId, tokens, reason)
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
              budget={detail.budget}
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
              onGiveExtra={(tokens, end) =>
                onGiveExtra?.(
                  pickedIds.map((id) => targetOf(id)),
                  tokens,
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
