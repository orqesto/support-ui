import { useEffect, useRef, useState } from 'react';
import { BarMarker, BarSegment, BarSlider } from '@/components/ui/BarSlider';
import type { TokenSpend } from '@/services/budgets.service';
import { clampPct, fmtMoney, fmtTokenCount } from './budget.rules';
import { BulkLegend, BulkLimitLegend, Swatch } from './BulkLimitField';
import { useMoney } from './tokenRate';

export const BULK_PCT_DEBOUNCE_MS = 400;

export type BudgetBarProps = {
  /** Micros; null = no budget set (the bar stays empty and cannot be dragged). */
  budget: number | null;
  /** This period's spend, micros: total = bulk + live; extra is outside the budget. */
  spend: { total: number; bulk: number; live: number; extra: number };
  /** Spend of workspaces that have left the group (shown as a note). */
  removedSpend?: number;
  /** Admins' secondary figure: the same spend in tokens, when the API gives it. */
  tokens?: TokenSpend;
  bulkLimitOn: boolean;
  bulkPct: number;
  bulkPctMin: number;
  bulkPctMax: number;
  /** The caller's canEdit.bulk: only then the line can be dragged. */
  canEdit: boolean;
  /**
   * Called 400 ms after the last drag step, with the value clamped to [bulkPctMin, bulkPctMax].
   * May answer whether the save went through: on `false` the line goes back to the saved value
   * (a rejected value must not stay on screen as if it were saved).
   */
  onBulkPctChange?: (pct: number) => void | Promise<boolean>;
  /** Accessible name of the slider. */
  ariaLabel?: string;
};

/**
 * The budget bar: bulk work first from 0 (purple), live mail after it, free after that. The
 * bulk-limit line is compared with the purple part only; live mail may run past it.
 */
export const BudgetBar = ({
  budget,
  spend,
  removedSpend = 0,
  tokens,
  bulkLimitOn,
  bulkPct,
  bulkPctMin,
  bulkPctMax,
  canEdit,
  onBulkPctChange,
  ariaLabel = 'Bulk processing may use at most, percent of the budget',
}: BudgetBarProps) => {
  const money = useMoney();
  const [draft, setDraft] = useState(() => clampPct(bulkPct, bulkPctMin, bulkPctMax));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(clampPct(bulkPct, bulkPctMin, bulkPctMax));
  saved.current = clampPct(bulkPct, bulkPctMin, bulkPctMax);
  const editable = canEdit && bulkLimitOn && budget !== null && budget > 0;

  // The saved value changed (saved, or reloaded): show it.
  useEffect(() => {
    setDraft(clampPct(bulkPct, bulkPctMin, bulkPctMax));
  }, [bulkPct, bulkPctMin, bulkPctMax]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const onDrag = (value: number) => {
    if (!editable) return;
    const next = clampPct(value, bulkPctMin, bulkPctMax);
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const result = onBulkPctChange?.(next);
      if (result)
        void result.then((ok) => {
          if (!ok) setDraft(saved.current);
        });
    }, BULK_PCT_DEBOUNCE_MS);
  };

  const size = budget && budget > 0 ? budget : 0;
  const bulkWidth = size ? Math.min(100, (spend.bulk / size) * 100) : 0;
  const liveWidth = size ? Math.min(100 - bulkWidth, (spend.live / size) * 100) : 0;
  const cap = size ? (size * draft) / 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <BarSlider
        value={draft}
        min={0}
        max={100}
        step={5}
        onChange={onDrag}
        disabled={!editable}
        ariaLabel={ariaLabel}
        ariaValueText={`${draft}% of the budget`}
        markers={bulkLimitOn && size ? <BarMarker at={draft} /> : undefined}
      >
        <BarSegment width={bulkWidth} className="bg-pending" />
        <BarSegment left={bulkWidth} width={liveWidth} className="bg-primary" />
      </BarSlider>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span>
          Used <span className="font-mono">{fmtMoney(spend.total)}</span>
          {tokens && (
            <span className="text-muted-foreground" data-testid="budget-tokens">
              {' '}
              ({fmtTokenCount(tokens.total)} tokens)
            </span>
          )}
          :
        </span>
        <BulkLegend on={bulkLimitOn && size > 0} used={spend.bulk} cap={cap} />
        <span>
          <Swatch className="bg-primary" />
          Live mail <span className="font-mono">{money(spend.live)}</span>
        </span>
        {size > 0 && (
          <span>
            <Swatch className="bg-muted border border-border" />
            Free <span className="font-mono">{money(Math.max(0, size - spend.total))}</span>
          </span>
        )}
        <BulkLimitLegend on={bulkLimitOn && size > 0} />
        {spend.extra > 0 && (
          <span>
            <Swatch className="bg-warning" />
            Extra for bulk work, outside the budget{' '}
            <span className="font-mono">{money(spend.extra)}</span>
          </span>
        )}
        {removedSpend > 0 && (
          <span>
            Includes <span className="font-mono">{money(removedSpend)}</span> spent by removed
            workspaces
          </span>
        )}
      </div>
    </div>
  );
};
