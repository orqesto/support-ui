import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { GroupDetail, GroupUpdate } from '@/services/budgets.service';
import {
  dollarsText,
  fmtMoney,
  fmtTokenCount,
  microsToTokens,
  parseDollars,
  parseTokens,
  tokensToMicros,
} from './budget.rules';
import { FieldLabel } from './BulkLimitField';
import { useMoney, useTokenRate } from './tokenRate';

/**
 * The budget per billing period. Kept in dollars; it can be typed in tokens (owner, 2026-10-26),
 * converted at this period's price per token of the budget on screen (`TokenRateProvider`), with
 * the other unit shown under it. With no usage yet there is no price: dollars only.
 */
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
  const money = useMoney();
  const inputId = `budget-${detail.key}`;
  const rate = useTokenRate();
  const [unit, setUnit] = useState<'tokens' | 'usd'>(rate ? 'tokens' : 'usd');
  const textFor = (micros: number | null, inUnit: 'tokens' | 'usd') =>
    micros === null
      ? ''
      : inUnit === 'tokens' && rate
        ? fmtTokenCount(microsToTokens(micros, rate))
        : dollarsText(micros);
  const [draft, setDraft] = useState(() => textFor(detail.budget, unit));
  /** The draft in micros: null = none, NaN = not a positive amount. */
  const draftMicros = (): number | null => {
    if (unit === 'usd' || !rate) return parseDollars(draft);
    const tokens = parseTokens(draft);
    return tokens === null || Number.isNaN(tokens) ? tokens : tokensToMicros(tokens, rate);
  };
  const [overriding, setOverriding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit)
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Budget per billing period</FieldLabel>
        <span className="font-mono text-lg" data-testid="budget-readonly">
          {detail.budget === null ? 'No budget set' : `${money(detail.budget)} / billing period`}
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
              detail.budget === null ? '—' : money(detail.budget)
            }`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOverriding(true)}>
            Override
          </Button>
        </div>
      </div>
    );

  const save = () => {
    const budget = draftMicros();
    if (Number.isNaN(budget)) {
      setError(
        unit === 'tokens'
          ? 'Type a number of tokens above 0 (e.g. 50M or 500K), or leave it empty for no budget.'
          : 'Type an amount in dollars above 0, or leave it empty for no budget.'
      );
      return;
    }
    setError(null);
    void onUpdate?.({ budget });
  };
  const saved = textFor(detail.budget, unit);
  const parsed = draftMicros();
  const changed = draft.trim() !== saved || (inherited && overriding);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={inputId}>Budget per billing period</FieldLabel>
      <div className="flex flex-wrap gap-2.5 items-center">
        <Input
          id={inputId}
          type={unit === 'usd' ? 'number' : 'text'}
          min={unit === 'usd' ? 0 : undefined}
          step={unit === 'usd' ? '0.01' : undefined}
          aria-label={`Budget per billing period, ${unit === 'usd' ? 'dollars' : 'tokens'}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
          className="w-28 font-mono text-lg"
        />
        {rate ? (
          <Select
            aria-label="Budget unit"
            size="sm"
            className="w-32"
            value={unit}
            onChange={(next) => {
              const nextUnit = next === 'usd' ? 'usd' : 'tokens';
              const micros = draftMicros();
              setUnit(nextUnit);
              setDraft(
                textFor(micros === null || Number.isNaN(micros) ? detail.budget : micros, nextUnit)
              );
              setError(null);
            }}
            options={[
              { value: 'tokens', label: 'Tokens' },
              { value: 'usd', label: 'US dollars' },
            ]}
          />
        ) : null}
        <span className="text-sm text-muted-foreground">
          {unit === 'tokens' ? 'tokens per billing period' : 'US dollars per billing period'}
        </span>
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
      {rate && parsed !== null && !Number.isNaN(parsed) && (
        <span className="text-sm text-muted-foreground" data-testid="budget-other-unit">
          {unit === 'tokens'
            ? `${fmtMoney(parsed)} at this period's price per token`
            : `≈ ${fmtTokenCount(microsToTokens(parsed, rate))} tokens at this period's price`}
        </span>
      )}
      {!rate && (
        <span className="text-sm text-muted-foreground">
          Tokens can be used once this period has AI usage to price them.
        </span>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
};
