import { useState } from 'react';
import { BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { ExtraView } from '@/services/budgets.service';
import {
  END_CHOICES,
  EXTRA_MAX,
  EXTRA_MIN,
  MILLION,
  extraEndsText,
  fmt,
  fmtTokens,
  grantEndsText,
  usd,
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
  /** Tokens: a "Suggested" button sets the amount to it. */
  suggestion?: number;
  /** Tokens: where the amount slider starts. */
  initialAmount: number;
  onGive: (tokens: number | 'suggested', end: ExtraEndChoice) => void;
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
  const clampM = (tokens: number) =>
    Math.min(EXTRA_MAX, Math.max(EXTRA_MIN, Math.round(tokens / MILLION)));
  const [amount, setAmount] = useState(() => clampM(initialAmount));
  const [end, setEnd] = useState<ExtraEndChoice>(3);

  if (extra)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{title}</FieldLabel>
        <div className="flex flex-wrap gap-2.5 items-baseline">
          <span className="font-mono text-lg">+{fmtTokens(extra.tokens)}</span>
          <span className="text-sm text-muted-foreground">
            {fmtTokens(extra.used)} used · {extraEndsText(extra.endsAt)}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Outside the monthly budget. Unused tokens expire.
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
        +{fmt(amount)} {usd(amount)}
      </span>
      <BarSlider
        value={amount}
        min={EXTRA_MIN}
        max={EXTRA_MAX}
        step={5}
        onChange={setAmount}
        ariaLabel="Extra amount, million tokens"
        ariaValueText={`${fmt(amount)} tokens`}
      >
        <BarSegment width={(amount / EXTRA_MAX) * 100} className="bg-warning" />
      </BarSlider>
      <div className="flex flex-wrap gap-2.5 justify-between items-center">
        <SegmentedControl
          ariaLabel="Extra ends"
          value={String(end)}
          onChange={(next) => setEnd(parseEnd(next))}
          segments={END_SEGMENTS}
        />
        {suggestion !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => setAmount(clampM(suggestion))}>
            Suggested {fmtTokens(suggestion)}
          </Button>
        )}
      </div>
      <div>
        <Button size="sm" disabled={busy} onClick={() => onGive(amount * MILLION, end)}>
          Give +{fmt(amount)} · ends {grantEndsText(end)}
        </Button>
      </div>
    </div>
  );
};
