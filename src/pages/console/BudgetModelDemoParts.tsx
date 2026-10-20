import { type ReactNode } from 'react';
import { BulkBar as RealBulkBar } from '@/components/budget/BulkBar';
import {
  BulkLegend as RealBulkLegend,
  BulkLimitField as RealBulkLimitField,
} from '@/components/budget/BulkLimitField';
import { ExtraBox as RealExtraBox } from '@/components/budget/ExtraBox';
import { MILLION, type ExtraEndChoice } from '@/components/budget/budget.rules';
import { Input } from '@/components/ui/Input';
import { usd, type ExtraEnd } from './budgetModelDemo.rules';

/**
 * Small shared pieces of the budget model demo (both views). Demo only: no calls, no saving.
 * The reusable parts live in `components/budget/`; the thin wrappers below keep the demo's
 * million-token units and its 0/1/2 "ends" choice.
 */

export { BulkLimitLegend, FieldLabel, Swatch } from '@/components/budget/BulkLimitField';
export { StatusText, TONE_CLASS } from '@/components/budget/StatusText';

const END_CHOICES: ExtraEndChoice[] = ['today', 3, 7];
const toEnd = (choice: ExtraEndChoice): ExtraEnd => END_CHOICES.indexOf(choice) as ExtraEnd;

export const BulkLimitField = (props: {
  on: boolean;
  pct: number;
  cap: number;
  onToggle: (on: boolean) => void;
}) => <RealBulkLimitField {...props} cap={props.cap * MILLION} />;

export const BulkLegend = (props: { on: boolean; used: number; cap: number }) => (
  <RealBulkLegend on={props.on} used={props.used * MILLION} cap={props.cap * MILLION} />
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

export type ExtraBoxProps = {
  title?: string;
  extra: number;
  extraUsed: number;
  extraDays: number;
  suggestion?: number;
  initialAmount: number;
  onGrant: (amount: number, end: ExtraEnd) => void;
  onEnd: () => void;
};

/** Demo wrapper: million tokens in, million tokens out. */
export const ExtraBox = ({
  extra,
  extraUsed,
  extraDays,
  suggestion,
  initialAmount,
  onGrant,
  ...rest
}: ExtraBoxProps) => (
  <RealExtraBox
    {...rest}
    extra={
      extra > 0
        ? {
            id: 0,
            grantIds: [],
            tokens: extra * MILLION,
            used: extraUsed * MILLION,
            endsAt: new Date(Date.now() + extraDays * 86_400_000).toISOString(),
          }
        : null
    }
    suggestion={suggestion === undefined ? undefined : suggestion * MILLION}
    initialAmount={initialAmount * MILLION}
    onGive={(tokens, end) => onGrant(Number(tokens) / MILLION, toEnd(end))}
  />
);

type DemoBulkBarProps = Omit<
  React.ComponentProps<typeof RealBulkBar>,
  'budget' | 'onSetLimit' | 'onGiveExtra'
> & {
  /** Million tokens. */
  budget: number;
  onSetLimit: (limit: number) => void;
  /** null = each workspace gets its own suggested amount. */
  onGiveExtra: (amount: number | null, end: ExtraEnd) => void;
};

export const BulkBar = ({ budget, onSetLimit, onGiveExtra, ...rest }: DemoBulkBarProps) => (
  <RealBulkBar
    {...rest}
    budget={budget * MILLION}
    onSetLimit={(tokens) => onSetLimit(tokens / MILLION)}
    onGiveExtra={(tokens, end) =>
      onGiveExtra(tokens === 'suggested' ? null : tokens / MILLION, toEnd(end))
    }
  />
);
