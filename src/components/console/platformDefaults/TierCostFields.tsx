import { useState } from 'react';
import type { ConfigSummaryRow } from '@/components/ui/ConfigCard';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type {
  ManagedAiInput,
  PlatformSettings,
  ResolvedField,
  SplitCostKey,
} from '@/services/platformSettings.service';
import {
  convertCosts,
  costInUnit,
  CostUnitPicker,
  costPlaceholder,
  fromCostUnit,
  parseCost,
  toCostUnit,
  type CostUnit,
} from './costUnit';
import { SourceBadge } from './SourceBadge';

/**
 * The per-tier cost rates of the Managed AI Defaults card.
 *
 * Two shapes, chosen by what the backend sends:
 * - split (input / output, USD per 1M tokens) when the backend reports `splitCostsSupported` —
 *   output costs several times input, so one blended number misprices every tier;
 * - blended (`*CostPer1k`, per 1k TOTAL tokens, typed per 1M or 1k) against an older backend,
 *   exactly as before — the frontend can reach production before the backend does.
 */

type Ai = PlatformSettings['ai'];
export type TierId = 'default' | 'strong' | 'vision';
type CostKey = 'defaultCostPer1k' | 'strongCostPer1k' | 'visionCostPer1k';

const TIER_COST_KEYS: Record<
  TierId,
  { blended: CostKey; input: SplitCostKey; output: SplitCostKey }
> = {
  default: {
    blended: 'defaultCostPer1k',
    input: 'defaultInputPer1M',
    output: 'defaultOutputPer1M',
  },
  strong: { blended: 'strongCostPer1k', input: 'strongInputPer1M', output: 'strongOutputPer1M' },
  vision: { blended: 'visionCostPer1k', input: 'visionInputPer1M', output: 'visionOutputPer1M' },
};
const TIER_IDS = Object.keys(TIER_COST_KEYS) as TierId[];

export const HALF_SPLIT_ERROR = 'Set both input and output, or neither.';

const UNSET_FIELD: ResolvedField<number> = { value: null, source: 'default' };
const splitFieldOf = (ai: Ai, key: SplitCostKey): ResolvedField<number> => ai[key] ?? UNSET_FIELD;

/** Only console (db) values prefill; anything else stays blank so the placeholder shows it. */
const dbValue = (field: ResolvedField<number>): number | null =>
  field.source === 'db' ? field.value : null;

const seedBlended = (ai: Ai, unit: CostUnit = '1k'): Record<CostKey, string> => {
  const seed = (field: ResolvedField<number>): string => {
    const value = dbValue(field);
    return value !== null ? String(toCostUnit(value, unit)) : '';
  };
  return {
    defaultCostPer1k: seed(ai.defaultCostPer1k),
    strongCostPer1k: seed(ai.strongCostPer1k),
    visionCostPer1k: seed(ai.visionCostPer1k),
  };
};

const seedSplit = (ai: Ai): Partial<Record<SplitCostKey, string>> =>
  Object.fromEntries(
    TIER_IDS.flatMap((tier) => [TIER_COST_KEYS[tier].input, TIER_COST_KEYS[tier].output]).map(
      (key) => {
        const value = dbValue(splitFieldOf(ai, key));
        return [key, value !== null ? String(value) : ''];
      }
    )
  );

/** Identity of the STORED rates, for the card's re-seed-on-refetch snapshot. */
export const storedCostSnapshot = (ai: Ai) => [seedBlended(ai), seedSplit(ai)];

/** Whether any rate is a console override (for the card's configured/empty state). */
export const costsConfigured = (ai: Ai): boolean =>
  TIER_IDS.some((tier) => {
    const keys = TIER_COST_KEYS[tier];
    return [ai[keys.blended], splitFieldOf(ai, keys.input), splitFieldOf(ai, keys.output)].some(
      (field) => field.source === 'db'
    );
  });

export const useTierCosts = (ai: Ai) => {
  const split = ai.splitCostsSupported === true;
  const [unit, setUnit] = useState<CostUnit>('1M');
  const [blended, setBlended] = useState<Record<CostKey, string>>(() => seedBlended(ai, '1M'));
  const [splitDraft, setSplitDraft] = useState(() => seedSplit(ai));

  const reseed = () => {
    setBlended(seedBlended(ai, unit));
    setSplitDraft(seedSplit(ai));
  };

  const typed = (key: SplitCostKey): number | null => parseCost(splitDraft[key] ?? '');
  /** Tiers with exactly one of input/output typed — saving them would price half a call. */
  const halfSet = split
    ? TIER_IDS.filter(
        (tier) =>
          (typed(TIER_COST_KEYS[tier].input) === null) !==
          (typed(TIER_COST_KEYS[tier].output) === null)
      )
    : [];

  /** Write the rates into a save payload. */
  const applyTo = (input: ManagedAiInput) => {
    if (!split) {
      (Object.keys(blended) as CostKey[]).forEach((key) => {
        const value = parseCost(blended[key]);
        if (value !== null) input[key] = fromCostUnit(value, unit);
      });
      return;
    }
    TIER_IDS.forEach((tier) => {
      const keys = TIER_COST_KEYS[tier];
      const inputRate = typed(keys.input);
      const outputRate = typed(keys.output);
      if (inputRate !== null && outputRate !== null) {
        // The split pair supersedes the blended rate, which drops out of storage.
        input[keys.input] = inputRate;
        input[keys.output] = outputRate;
        return;
      }
      // The PUT replaces the stored object: a console blended rate this form does not show
      // would otherwise vanish on any save.
      const stored = dbValue(ai[keys.blended]);
      if (stored !== null) input[keys.blended] = stored;
    });
  };

  /** Read-only summary rows, one per tier. */
  const summaryRows = (
    tierLabels: Record<TierId, string>,
    row: (
      label: string,
      field: { value: string | number | null; source: string }
    ) => ConfigSummaryRow
  ): ConfigSummaryRow[] =>
    TIER_IDS.map((tier) => {
      const keys = TIER_COST_KEYS[tier];
      const inField = splitFieldOf(ai, keys.input);
      const outField = splitFieldOf(ai, keys.output);
      if (split && inField.value !== null && outField.value !== null) {
        return row(`${tierLabels[tier]} cost (per 1M tokens)`, {
          value: `in ${inField.value} · out ${outField.value}`,
          source: inField.source,
        });
      }
      return row(`${tierLabels[tier]} cost / ${unit} tokens`, costInUnit(ai[keys.blended], unit));
    });

  const unitPicker = split ? null : (
    <CostUnitPicker
      unit={unit}
      onChange={(next) => {
        setBlended((prev) => convertCosts(prev, unit, next));
        setUnit(next);
      }}
    />
  );

  const renderTier = (tier: TierId, tierLabel: string) => {
    const keys = TIER_COST_KEYS[tier];
    if (!split) {
      return (
        <div>
          <div className="flex gap-2 items-center mb-2">
            <Label className="mb-0">Cost / {unit} tokens</Label>
            <SourceBadge source={ai[keys.blended].source} unsetLabel="Not set" />
          </div>
          <Input
            type="number"
            min={0}
            step="any"
            aria-label={`${tierLabel} — cost per ${unit} tokens`}
            value={blended[keys.blended]}
            onChange={(event) =>
              setBlended((prev) => ({ ...prev, [keys.blended]: event.target.value }))
            }
            placeholder={costPlaceholder(ai[keys.blended].value, unit)}
          />
        </div>
      );
    }
    const splitInput = (key: SplitCostKey, label: string) => {
      const field = splitFieldOf(ai, key);
      return (
        <div>
          <div className="flex gap-2 items-center mb-2">
            <Label className="mb-0">{label} $ / 1M tokens</Label>
            <SourceBadge source={field.source} unsetLabel="Not set" />
          </div>
          <Input
            type="number"
            min={0}
            step="any"
            aria-label={`${tierLabel} — ${label.toLowerCase()} $ per 1M tokens`}
            value={splitDraft[key] ?? ''}
            onChange={(event) => setSplitDraft((prev) => ({ ...prev, [key]: event.target.value }))}
            placeholder={field.value !== null ? String(field.value) : 'unset'}
          />
        </div>
      );
    };
    // Shown while no stored split pair supersedes it, so a blank pair is not read as "free".
    const storedBlended =
      splitFieldOf(ai, keys.input).value !== null && splitFieldOf(ai, keys.output).value !== null
        ? null
        : ai[keys.blended].value;
    return (
      <div>
        <div className="grid gap-3 grid-cols-2">
          {splitInput(keys.input, 'Input')}
          {splitInput(keys.output, 'Output')}
        </div>
        {halfSet.includes(tier) && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {HALF_SPLIT_ERROR}
          </p>
        )}
        {storedBlended !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            Blended rate in use until both are set: {toCostUnit(storedBlended, '1M')} / 1M tokens.
          </p>
        )}
      </div>
    );
  };

  return {
    reseed,
    applyTo,
    /** True while a tier has only one of input/output typed — Save must not run. */
    blocked: halfSet.length > 0,
    summaryRows,
    unitPicker,
    renderTier,
  };
};
