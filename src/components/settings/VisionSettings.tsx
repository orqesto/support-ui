import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import { aiService } from '@/services/ai.service';
import { organizationService } from '@/services/organization.service';
import type { AIModel } from '@/types/aiProviders';

type VisionOption = { value: string; label: string; provider: string };

/**
 * BYO image-analysis (vision) settings: an on/off toggle + a DEDICATED vision model.
 *
 * A BYO org's default chat model may be text-only (DeepSeek / Perplexity / a text Ollama model),
 * so image analysis needs its own vision-capable model. The dropdown only offers models the BE
 * catalog marks `supportsVision` across the org's configured providers. Managed AI uses an
 * optimized vision model automatically — only the toggle applies there. Backed by
 * `GET/PATCH /api/organizations/vision-config`.
 */
export const VisionSettings = () => {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState('');
  const [options, setOptions] = useState<VisionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [cfg, providers] = await Promise.all([
          organizationService.getVisionConfig(),
          aiService.getProviders(),
        ]);
        const enabledProviders = providers.data.enabled ?? [];
        const lists = await Promise.all(
          enabledProviders.map((providerName) =>
            aiService
              .getModels(providerName)
              .then((response) => ({ providerName, models: response.data.chat }))
              .catch(() => ({ providerName, models: [] as AIModel[] }))
          )
        );
        const opts: VisionOption[] = [];
        for (const { providerName, models } of lists) {
          for (const catalogModel of models) {
            if (catalogModel.supportsVision) {
              opts.push({
                value: catalogModel.id,
                label: `${catalogModel.name} · ${providerName}`,
                provider: providerName,
              });
            }
          }
        }
        if (!active) return;
        setEnabled(cfg.enabled);
        setModel(cfg.model ?? '');
        setOptions(opts);
      } catch (error) {
        logger.error('Failed to load vision settings', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const provider = options.find((option) => option.value === model)?.provider;
      // Send explicit null to CLEAR back to "use my default model" (undefined would be JSON-dropped
      // and leave the stale designated model in place).
      await organizationService.updateVisionConfig({
        enabled,
        provider: model ? provider ?? null : null,
        model: model || null,
      });
      setSaved(true);
    } catch (error) {
      logger.error('Failed to save vision settings', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  // "Use my default model" (empty) + discovered vision models. Keep a stale-but-set model visible
  // even if its provider was since disabled, so the user still sees what's configured.
  const selectOptions = [
    { value: '', label: 'Use my default model' },
    ...options.map((option) => ({ value: option.value, label: option.label })),
    ...(model && !options.some((option) => option.value === model)
      ? [{ value: model, label: `${model} · current` }]
      : []),
  ];

  return (
    <div className="p-4 space-y-4 rounded-lg border bg-card">
      <div className="flex gap-4 justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-foreground">Image analysis (Vision)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Let the AI read image attachments (screenshots, photos) on inbound messages. Turn this
            off to skip images entirely.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            setSaved(false);
          }}
        />
      </div>

      {enabled && (
        <div className="space-y-1.5">
          <ReactSelect
            label="Vision model (your own AI keys)"
            value={model}
            onChange={(value) => {
              setModel(value);
              setSaved(false);
            }}
            options={selectOptions}
          />
          <p className="text-xs text-muted-foreground">
            {options.length
              ? 'Pick a vision-capable model from your configured providers, or leave it on your default model. Managed AI uses an optimized vision model automatically.'
              : 'None of your configured providers offers a vision-capable model. Add one (e.g. OpenAI, Anthropic, Amazon Nova, or a vision Ollama model) to analyze images with your own keys.'}
          </p>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </div>
  );
};
