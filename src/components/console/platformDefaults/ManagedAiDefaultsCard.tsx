import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  useSetPlatformSecret,
  useClearPlatformSecret,
  useUpdatePlatformAi,
} from '@/hooks/usePlatformSettings';
import type { ManagedAiInput, PlatformSettings } from '@/services/platformSettings.service';
import { SecretField } from './SecretField';
import { SourceBadge } from './SourceBadge';

type Ai = PlatformSettings['ai'];
type ModelKey = 'defaultModel' | 'strongModel' | 'visionModel';
type CostKey = 'defaultCostPer1k' | 'strongCostPer1k' | 'visionCostPer1k';

const TIERS: { modelKey: ModelKey; costKey: CostKey; label: string }[] = [
  { modelKey: 'defaultModel', costKey: 'defaultCostPer1k', label: 'Default tier' },
  { modelKey: 'strongModel', costKey: 'strongCostPer1k', label: 'Strong tier' },
  { modelKey: 'visionModel', costKey: 'visionCostPer1k', label: 'Vision tier' },
];

/** Prefill a field only when it's a console (DB) override; else leave blank so the
 *  placeholder shows the effective env/const value the admin would be replacing. */
const prefill = (field: { value: string | number | null; source: string }): string =>
  field.source === 'db' && field.value !== null ? String(field.value) : '';

export const ManagedAiDefaultsCard = ({ ai }: { ai: Ai }) => {
  const [models, setModels] = useState<Record<ModelKey, string>>(() => ({
    defaultModel: prefill(ai.defaultModel),
    strongModel: prefill(ai.strongModel),
    visionModel: prefill(ai.visionModel),
  }));
  const [costs, setCosts] = useState<Record<CostKey, string>>(() => ({
    defaultCostPer1k: prefill(ai.defaultCostPer1k),
    strongCostPer1k: prefill(ai.strongCostPer1k),
    visionCostPer1k: prefill(ai.visionCostPer1k),
  }));

  const update = useUpdatePlatformAi();
  const setSecret = useSetPlatformSecret();
  const clearSecret = useClearPlatformSecret();

  const save = () => {
    const input: ManagedAiInput = {};
    (Object.keys(models) as ModelKey[]).forEach((key) => {
      const trimmed = models[key].trim();
      if (trimmed) input[key] = trimmed;
    });
    (Object.keys(costs) as CostKey[]).forEach((key) => {
      const raw = costs[key].trim();
      if (!raw) return;
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) input[key] = num;
    });
    update.mutate(input);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Bot className="w-5 h-5 text-primary" />
          Managed AI Defaults
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Model and cost-per-1k-token rates the platform uses to serve managed-mode
          workspaces. Leave a field blank to fall back to the environment or the built-in default.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {TIERS.map(({ modelKey, costKey, label }) => (
          <div key={modelKey} className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex gap-2 items-center mb-2">
                <Label className="mb-0">{label} — model</Label>
                <SourceBadge source={ai[modelKey].source} />
              </div>
              <Input
                value={models[modelKey]}
                onChange={(event) =>
                  setModels((prev) => ({ ...prev, [modelKey]: event.target.value }))
                }
                placeholder={ai[modelKey].value ?? ''}
              />
            </div>
            <div>
              <div className="flex gap-2 items-center mb-2">
                <Label className="mb-0">Cost / 1k tokens</Label>
                <SourceBadge source={ai[costKey].source} />
              </div>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={costs[costKey]}
                onChange={(event) =>
                  setCosts((prev) => ({ ...prev, [costKey]: event.target.value }))
                }
                placeholder={ai[costKey].value !== null ? String(ai[costKey].value) : 'unset'}
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <Button onClick={save} isLoading={update.isPending}>
            Save AI defaults
          </Button>
        </div>

        <div className="pt-4 border-t border-border">
          <SecretField
            label="Managed AI API key"
            status={ai.apiKey}
            onSave={(value) => setSecret.mutate({ key: 'ai.openai_api_key', value })}
            onClear={() => clearSecret.mutate('ai.openai_api_key')}
            saving={setSecret.isPending}
            clearing={clearSecret.isPending}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            The base URL stays environment-only and always targets the managed provider endpoint.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
