import { useState } from 'react';
import { BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { ExtraView } from '@/services/budgets.service';
import {
  END_CHOICES,
  EXTRA_MAX,
  EXTRA_MIN,
  EXTRA_STEP,
  MICROS_PER_USD,
  extraEndsText,
  fmtMoney,
  grantEndsText,
  type ExtraEndChoice,
} from './budget.rules';
import { FieldLabel } from './BulkLimitField';

export const END_SEGMENTS = END_CHOICES.map(({ value, label }) => ({
  value: String(value),
  label,
}));

export const parseEnd = (value: string): ExtraEndChoice =>
  value === 'today' ? 'today' : value === '7' ? 7 : 3;

export type ExtraBoxProps = {
  /** Defaults to "Extra for bulk work". */
  title?: string;
  /** The active extra of this scope, or null: "End now" shows only when there is one. */
  extra: ExtraView | null;
  /** Micros: a "Suggested" button sets the amount to it. */
  suggestion?: number;
  /** Micros: where the amount slider starts. */
  initialAmount: number;
  /** Micros of money (the API's `amountMicros`). */
  onGive: (amountMicros: number | 'suggested', end: ExtraEndChoice) => void;
  onEnd: () => void;
  /** Disables the buttons while a request runs. */
  busy?: boolean;
};

export const ExtraBox = ({
  title = 'Extra for bulk work',
  extra,
  suggestion,
  initialAmount,
  onGive,
  onEnd,
  busy,
}: ExtraBoxProps) => {
  // The slider reaches at least the requested / suggested amount, so it is given exactly (the
  // backend has no upper bound; EXTRA_MAX is only the usual top of the slider).
  const ceil5 = (micros: number) => Math.ceil(micros / MICROS_PER_USD / 5) * 5;
  const top = Math.max(EXTRA_MAX, ceil5(initialAmount), ceil5(suggestion ?? 0));
  const atLeastMin = (micros: number) => Math.max(EXTRA_MIN * MICROS_PER_USD, micros);
  /** Micros: kept exact when seeded from a request or a suggestion. */
  const [amountMicros, setAmountMicros] = useState(() => atLeastMin(initialAmount));
  const amount = amountMicros / MICROS_PER_USD;
  const [end, setEnd] = useState<ExtraEndChoice>(3);

  if (extra)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{title}</FieldLabel>
        <div className="flex flex-wrap gap-2.5 items-baseline">
          <span className="font-mono text-lg">{fmtMoney(extra.amountMicros)}</span>
          <span className="text-sm text-muted-foreground">
            {fmtMoney(extra.usedMicros)} used · {extraEndsText(extra.endsAt)}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Outside the monthly budget. Unused extra expires.
        </span>
        <div>
          <Button variant="outline" size="sm" disabled={busy} onClick={onEnd}>
            End now
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{title}</FieldLabel>
      <span className="font-mono text-lg">
        {fmtMoney(amountMicros)}
      </span>
      <BarSlider
        value={amount}
        min={EXTRA_MIN}
        max={top}
        step={EXTRA_STEP}
        onChange={(dollars) => setAmountMicros(Math.round(dollars * MICROS_PER_USD))}
        ariaLabel="Extra amount, dollars"
        ariaValueText={fmtMoney(amountMicros)}
      >
        <BarSegment width={(amount / top) * 100} className="bg-warning" />
      </BarSlider>
      <div className="flex flex-wrap gap-2.5 justify-between items-center">
        <SegmentedControl
          ariaLabel="Extra ends"
          value={String(end)}
          onChange={(next) => setEnd(parseEnd(next))}
          segments={END_SEGMENTS}
        />
        {suggestion !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => setAmountMicros(atLeastMin(suggestion))}>
            Suggested {fmtMoney(suggestion)}
          </Button>
        )}
      </div>
      <div>
        <Button size="sm" disabled={busy} onClick={() => onGive(amountMicros, end)}>
          Give {fmtMoney(amountMicros)} · ends {grantEndsText(end)}
        </Button>
      </div>
    </div>
  );
};
