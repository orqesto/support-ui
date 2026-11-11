import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import { aiService } from '@/services/ai.service';
import { organizationService, type VisionLimit } from '@/services/organization.service';
import type { AIModel } from '@/types/aiProviders';

type VisionOption = { value: string; label: string; provider: string };

/** The backend's defaults (support-service#1489); used until it answers with its own limits. */
const FALLBACK_LIMITS: { maxImagesPerMessage: VisionLimit; minImageKb: VisionLimit } = {
  maxImagesPerMessage: { default: 3, min: 1, max: 10 },
  minImageKb: { default: 20, min: 0, max: 5000 },
};

/** A whole number inside the limit, or null when the field is not one. */
const parseSetting = (raw: string, limit: VisionLimit): number | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= limit.min && value <= limit.max ? value : null;
};

/**
 * BYO image-analysis (vision) settings: an on/off toggle + a DEDICATED vision model.
 *
 * A BYO org's default chat model may be text-only (DeepSeek / Perplexity / a text Ollama model),
 * so image analysis needs its own vision-capable model. The dropdown only offers models the BE
 * catalog marks `supportsVision` across the org's configured providers. Managed AI uses an
 * optimized vision model automatically — only the toggle applies there. Backed by
 * `GET/PATCH /api/organizations/vision-config`.
 *
 * Email photos (support-service#1489): how many of a customer email's photos the AI reads
 * (largest first) and the smallest image it reads, so logos and icons cost nothing.
 */
export const VisionSettings = ({ managed = false }: { managed?: boolean } = {}) => {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState('');
  const [options, setOptions] = useState<VisionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [limits, setLimits] = useState(FALLBACK_LIMITS);
  const [maxImages, setMaxImages] = useState(String(FALLBACK_LIMITS.maxImagesPerMessage.default));
  const [minKb, setMinKb] = useState(String(FALLBACK_LIMITS.minImageKb.default));
  // A backend from before the email-photo settings sends none of them: the section stays hidden.
  const [emailPhotoSettings, setEmailPhotoSettings] = useState(false);
  const [emailPhotos, setEmailPhotos] = useState(false);

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
        if (typeof cfg.maxImagesPerMessage === 'number' && typeof cfg.minImageKb === 'number') {
          setEmailPhotoSettings(true);
          setEmailPhotos(cfg.emailPhotos === true);
          setMaxImages(String(cfg.maxImagesPerMessage));
          setMinKb(String(cfg.minImageKb));
          if (cfg.limits) setLimits(cfg.limits);
        }
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

  const maxImagesValue = parseSetting(maxImages, limits.maxImagesPerMessage);
  const minKbValue = parseSetting(minKb, limits.minImageKb);
  // Only a visible field can block the save; a hidden invalid one is simply not sent.
  const invalid =
    enabled && emailPhotoSettings && emailPhotos && (maxImagesValue === null || minKbValue === null);

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    setSaved(false);
    try {
      const provider = options.find((option) => option.value === model)?.provider;
      // Send explicit null to CLEAR back to "use my default model" (undefined would be JSON-dropped
      // and leave the stale designated model in place).
      await organizationService.updateVisionConfig({
        enabled,
        // Managed AI shows no model picker: leave a model chosen for own keys as it is.
        ...(managed ? {} : { provider: model ? provider ?? null : null, model: model || null }),
        ...(emailPhotoSettings ? { emailPhotos } : {}),
        ...(emailPhotoSettings && maxImagesValue !== null
          ? { maxImagesPerMessage: maxImagesValue }
          : {}),
        ...(emailPhotoSettings && minKbValue !== null ? { minImageKb: minKbValue } : {}),
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
          <h3 className="font-display text-sm font-medium text-foreground">Image analysis (Vision)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Let the AI read the photos and screenshots customers send (email and Telegram), so
            drafts and auto-replies know what is on them. Turn this off to skip images entirely.
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

      {/* Managed AI picks its own vision model: only the switches apply there. */}
      {enabled && !managed && (
        <div className="space-y-1.5">
          <Select
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

      {enabled && emailPhotoSettings && (
        <div className="space-y-2">
          <div className="flex gap-4 justify-between items-start">
            <div>
              <h4 className="text-sm font-medium text-foreground">Read photos in customer emails</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Read when the email arrives, largest first, so the draft and auto-reply know what is
                on them. Signature logos and images that arrive on many conversations are skipped.
                Each photo read is one AI call.
              </p>
            </div>
            <Toggle
              checked={emailPhotos}
              ariaLabel="Read photos in customer emails"
              onChange={(checked) => {
                setEmailPhotos(checked);
                setSaved(false);
              }}
            />
          </div>
          {emailPhotos && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Photos read per email"
              type="number"
              inputMode="numeric"
              min={limits.maxImagesPerMessage.min}
              max={limits.maxImagesPerMessage.max}
              step={1}
              value={maxImages}
              onChange={(event) => {
                setMaxImages(event.target.value);
                setSaved(false);
              }}
              error={
                maxImagesValue === null
                  ? `A whole number from ${limits.maxImagesPerMessage.min} to ${limits.maxImagesPerMessage.max}`
                  : undefined
              }
            />
            <Input
              label="Smallest image read (KB)"
              type="number"
              inputMode="numeric"
              min={limits.minImageKb.min}
              max={limits.minImageKb.max}
              step={1}
              value={minKb}
              onChange={(event) => {
                setMinKb(event.target.value);
                setSaved(false);
              }}
              error={
                minKbValue === null
                  ? `A whole number from ${limits.minImageKb.min} to ${limits.minImageKb.max}`
                  : undefined
              }
            />
          </div>
          )}
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Button onClick={save} disabled={saving || invalid}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
    </div>
  );
};
