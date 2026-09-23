import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { integrationsService, type Integration } from '@/services/integrations.service';

/** The backend's ceiling (aiProviderCostRatesController) — catches a per-1K or per-token slip. */
const MAX_RATE_PER_1M = 10_000;

type Rates = { inputCostPer1M: number | null; outputCostPer1M: number | null };

const toDraft = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

/**
 * Parse the two fields into a savable pair, or say why not. Both empty clears the rates; one
 * empty is refused — a cost needs both legs, and half a pair would price one leg of every call.
 */
export const parseRates = (
  input: string,
  output: string
): { rates: Rates } | { error: string } => {
  const inText = input.trim().replace(',', '.');
  const outText = output.trim().replace(',', '.');
  if (inText === '' && outText === '') return { rates: { inputCostPer1M: null, outputCostPer1M: null } };
  if (inText === '' || outText === '') return { error: 'Set both the input and the output rate, or clear both.' };
  const inRate = Number(inText);
  const outRate = Number(outText);
  const valid = (rate: number) => Number.isFinite(rate) && rate >= 0 && rate <= MAX_RATE_PER_1M;
  if (!valid(inRate) || !valid(outRate)) {
    return { error: `Rates must be numbers between 0 and ${MAX_RATE_PER_1M.toLocaleString()}.` };
  }
  return { rates: { inputCostPer1M: inRate, outputCostPer1M: outRate } };
};

const ProviderRateRow = ({
  integration,
  onSaved,
}: {
  integration: Integration;
  onSaved: (id: number, rates: Rates) => void;
}) => {
  const [input, setInput] = useState(toDraft(integration.inputCostPer1M));
  const [output, setOutput] = useState(toDraft(integration.outputCostPer1M));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // A reload (or another admin's save arriving) replaces the stored pair — show that, not a
  // draft typed against the old one.
  useEffect(() => {
    setInput(toDraft(integration.inputCostPer1M));
    setOutput(toDraft(integration.outputCostPer1M));
  }, [integration.inputCostPer1M, integration.outputCostPer1M]);

  const save = async () => {
    const parsed = parseRates(input, output);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await integrationsService.updateAiCostRates(integration.id, parsed.rates);
      if (!res.success || !res.data) throw new Error('Save failed');
      onSaved(integration.id, {
        inputCostPer1M: res.data.inputCostPer1M,
        outputCostPer1M: res.data.outputCostPer1M,
      });
      setSaved(true);
    } catch (err) {
      logger.error('Failed to save AI provider cost rates:', err);
      // A 4xx reason (a rate the server refused) is the admin's to act on; say it.
      setError(getApiErrorMessage(err) ?? 'Could not save the rates. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    setSaved(false);
    setError(null);
  };

  return (
    <div className="grid gap-3 items-end sm:grid-cols-[1fr_9rem_9rem_auto]">
      <div className="text-sm">
        <span className="font-medium text-foreground">{integration.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{integration.type}</span>
      </div>
      <Input
        label="Input · USD / 1M"
        inputMode="decimal"
        placeholder="list price"
        value={input}
        onChange={edit(setInput)}
        aria-label={`${integration.name} input cost per 1M tokens`}
      />
      <Input
        label="Output · USD / 1M"
        inputMode="decimal"
        placeholder="list price"
        value={output}
        onChange={edit(setOutput)}
        aria-label={`${integration.name} output cost per 1M tokens`}
      />
      <div className="flex gap-2 items-center">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
      {error && <p className="text-xs text-destructive sm:col-span-4">{error}</p>}
    </div>
  );
};

/**
 * What this workspace pays each of its own AI providers. The platform's AI-spend estimate prices
 * this workspace's own-key usage at these rates; without them it uses the model's published list
 * price, and a model with no list price stays unpriced.
 */
export const ProviderCostRatesCard = ({
  integrations,
  onSaved,
}: {
  integrations: Integration[];
  onSaved: (id: number, rates: Rates) => void;
}) => {
  if (integrations.length === 0) return null;
  return (
    <div className="p-4 space-y-4 rounded-lg border bg-card">
      <div>
        <h3 className="font-display text-sm font-medium text-foreground">Cost rates</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          What you pay each provider, in US dollars per 1 million tokens — input and output
          separately, as providers bill them. Used for AI spend estimates, and applied to every
          model the provider serves (including image analysis). Leave both empty to use each
          model&apos;s published list price, where one is known.
        </p>
      </div>
      {integrations.map((integration) => (
        <ProviderRateRow key={integration.id} integration={integration} onSaved={onSaved} />
      ))}
    </div>
  );
};
