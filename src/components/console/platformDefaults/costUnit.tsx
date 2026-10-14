import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';

/**
 * The unit a cost is TYPED in. The server stores cost per 1k tokens, but providers publish prices
 * per 1M — typed per 1k, Haiku is 0.00013 and the zeros are where the typos go (2026-10-14).
 * The factor turns a per-1k value into the typed unit.
 */
export type CostUnit = '1M' | '1k';
const COST_UNIT_FACTOR: Record<CostUnit, number> = { '1M': 1000, '1k': 1 };

/** Drop float noise from a unit conversion (0.00013 × 1000 = 0.13000000000000003). */
const tidy = (value: number): number => Number(value.toPrecision(12));

export const toCostUnit = (per1k: number, unit: CostUnit): number =>
  tidy(per1k * COST_UNIT_FACTOR[unit]);
export const fromCostUnit = (typed: number, unit: CostUnit): number =>
  tidy(typed / COST_UNIT_FACTOR[unit]);

/**
 * A typed cost, or null when the field is blank or not a cost. The field is `type="number"`, so
 * the browser hands over a normalised number ("1e-7" included) or "" for anything it can't read.
 */
export const parseCost = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/** The effective cost (env/default included) in the typed unit, shown when nothing is typed. */
export const costPlaceholder = (value: number | null, unit: CostUnit): string =>
  value !== null ? String(toCostUnit(value, unit)) : 'unset';

/** Re-express typed costs in another unit; text that is not a cost stays as it is. */
export const convertCosts = <Key extends string>(
  costs: Record<Key, string>,
  from: CostUnit,
  to: CostUnit
): Record<Key, string> => {
  const converted = { ...costs };
  (Object.keys(costs) as Key[]).forEach((key) => {
    const typed = parseCost(costs[key]);
    if (typed !== null) converted[key] = String(toCostUnit(fromCostUnit(typed, from), to));
  });
  return converted;
};

export const CostUnitPicker = ({
  unit,
  onChange,
}: {
  unit: CostUnit;
  onChange: (unit: CostUnit) => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Label className="mb-0">Costs typed per</Label>
    <Select
      aria-label="Cost unit"
      value={unit}
      options={[
        { value: '1M', label: '1M tokens' },
        { value: '1k', label: '1k tokens' },
      ]}
      onChange={(value) => onChange(value as CostUnit)}
    />
    <span className="text-xs text-muted-foreground">
      Stored per 1k tokens either way; providers publish prices per 1M.
    </span>
  </div>
);
