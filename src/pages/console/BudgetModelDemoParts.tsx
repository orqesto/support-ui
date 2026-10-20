import { useState, type CSSProperties, type ReactNode } from 'react';
import { BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/utils';
import {
  EXTRA_END_LABELS,
  EXTRA_MAX,
  EXTRA_MIN,
  extraEndsText,
  fmt,
  grantEndsText,
  usd,
  type ExtraEnd,
  type Tone,
} from './budgetModelDemo.rules';

/** Small shared pieces of the budget model demo (both views). Demo only: no calls, no saving. */

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
};
export const END_SEGMENTS = EXTRA_END_LABELS.map((label, index) => ({
  value: String(index),
  label,
}));

export const FieldLabel = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) =>
  htmlFor ? (
    <label
      htmlFor={htmlFor}
      className="font-display text-xs tracking-wider uppercase text-muted-foreground"
    >
      {children}
    </label>
  ) : (
    <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
      {children}
    </span>
  );

export const Swatch = ({ className, style }: { className: string; style?: CSSProperties }) => (
  <span
    aria-hidden="true"
    className={cn('inline-block mr-1.5 w-2.5 h-2.5 rounded-sm align-[-1px]', className)}
    style={style}
  />
);

export const StatusText = ({
  tone,
  text,
  testId,
}: {
  tone: Tone;
  text: string;
  testId?: string;
}) => (
  <p data-testid={testId} data-tone={tone} className={cn('text-sm font-medium', TONE_CLASS[tone])}>
    {text}
  </p>
);

export const BudgetInput = ({
  id,
  value,
  step,
  onChange,
}: {
  id: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) => (
  <div className="flex flex-wrap gap-2.5 items-center">
    <Input
      id={id}
      type="number"
      min={1}
      step={step}
      value={value || ''}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="w-28 font-mono text-lg"
    />
    <span className="text-sm text-muted-foreground">million tokens</span>
    <span className="font-mono text-sm text-muted-foreground">
      {usd(Math.max(1, value || 1))} / month
    </span>
  </div>
);

export const TryItButtons = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-2 items-center">
    <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
      Try it
    </span>
    {children}
  </div>
);

export const Log = ({ text, testId }: { text: string; testId: string }) => (
  <p
    data-testid={testId}
    aria-live="polite"
    className="text-sm text-muted-foreground min-h-[1.5em]"
  >
    {text}
  </p>
);

// ---------------------------------------------------------------------------------------------
// Extra for bulk work (shared by both views)
// ---------------------------------------------------------------------------------------------

export type ExtraBoxProps = {
  /** Defaults to "Extra for bulk work". */
  title?: string;
  extra: number;
  extraUsed: number;
  extraDays: number;
  /** Shown as a "Suggested" button in the organisation view. */
  suggestion?: number;
  initialAmount: number;
  onGrant: (amount: number, end: ExtraEnd) => void;
  onEnd: () => void;
};

export const ExtraBox = ({
  title = 'Extra for bulk work',
  extra,
  extraUsed,
  extraDays,
  suggestion,
  initialAmount,
  onGrant,
  onEnd,
}: ExtraBoxProps) => {
  const [amount, setAmount] = useState(initialAmount);
  const [end, setEnd] = useState<ExtraEnd>(1);

  if (extra > 0)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{title}</FieldLabel>
        <div className="flex flex-wrap gap-2.5 items-baseline">
          <span className="font-mono text-lg">+{fmt(extra)}</span>
          <span className="text-sm text-muted-foreground">
            {fmt(extraUsed)} used · {extraEndsText(extraDays)}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Outside the monthly budget. Unused tokens expire.
        </span>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (suggestion !== undefined) setAmount(suggestion);
              onEnd();
            }}
          >
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
          onChange={(next) => setEnd(Number(next) as ExtraEnd)}
          segments={END_SEGMENTS}
        />
        {suggestion !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => setAmount(suggestion)}>
            Suggested {fmt(suggestion)}
          </Button>
        )}
      </div>
      <div>
        <Button size="sm" onClick={() => onGrant(amount, end)}>
          Give +{fmt(amount)} · ends {grantEndsText(end)}
        </Button>
      </div>
    </div>
  );
};

/** The bulk limit header, both views: on/off, its value, and the warning while it is off. */
export const BulkLimitField = ({
  on,
  pct,
  cap,
  onToggle,
}: {
  on: boolean;
  pct: number;
  cap: number;
  onToggle: (on: boolean) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel>Bulk processing (knowledge base, imports, re-mines)</FieldLabel>
    <Toggle checked={on} onChange={onToggle} label="Limit it · drag the line on the bar" />
    {on ? (
      <span className="font-mono text-lg">
        At most {pct}% · {fmt(cap)} · counts bulk spend only
      </span>
    ) : (
      <span className="text-sm text-warning">
        No limit: bulk work shares the whole budget, so a big import can stop live mail.
      </span>
    )}
  </div>
);

/** The bulk part of the legend, both views. */
export const BulkLegend = ({ on, used, cap }: { on: boolean; used: number; cap: number }) => (
  <>
    <span>
      <Swatch className="bg-pending" />
      Bulk processing <span className="font-mono">{fmt(used)}</span>
      {on && (
        <>
          {' '}
          of <span className="font-mono">{fmt(cap)}</span>
        </>
      )}
    </span>
  </>
);

/** The limit line in the legend, shown only while the bulk limit is on. */
export const BulkLimitLegend = ({ on }: { on: boolean }) =>
  on ? (
    <span>
      <Swatch className="!w-0.5 bg-foreground" />
      Bulk limit (compared with the purple part only)
    </span>
  ) : null;
