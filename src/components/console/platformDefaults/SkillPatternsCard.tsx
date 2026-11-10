import { useState } from 'react';
import { Regex } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformRouting } from '@/hooks/usePlatformSettings';
import type { PlatformSettings } from '@/services/platformSettings.service';
import {
  SKILL_PATTERN_CAP_FIELDS,
  SKILL_PATTERN_CAP_SPECS,
  specFieldError,
  type PlatformRoutingInput,
  type SkillPatternCapField,
} from '@/services/routingSettings';
import { ROUTING_NOT_DEPLOYED } from './RoutingProposalsCard';
import { SkillPatternCatalogue } from './SkillPatternCatalogue';
import { SourceBadge } from './SourceBadge';

/** The three caps: Save sends only the changed ones through PATCH /settings/routing. */
const PatternCaps = ({ caps }: { caps: NonNullable<PlatformSettings['skillPatternCaps']> }) => {
  const save = useUpdatePlatformRouting();
  const [draft, setDraft] = useState<Partial<Record<SkillPatternCapField, string>>>({});
  const errors: Partial<Record<SkillPatternCapField, string>> = {};
  const changed: PlatformRoutingInput = {};
  for (const name of SKILL_PATTERN_CAP_FIELDS) {
    const text = draft[name];
    if (text === undefined) continue;
    const error = specFieldError(SKILL_PATTERN_CAP_SPECS[name], text);
    if (error) errors[name] = error;
    else if (Number(text) !== caps[name].value) changed[name] = Number(text);
  }
  const hasErrors = Object.keys(errors).length > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Limits on save. Lowering one never deletes saved patterns; the next save of that value must
        fit.
      </p>
      {SKILL_PATTERN_CAP_FIELDS.map((name) => {
        const spec = SKILL_PATTERN_CAP_SPECS[name];
        return (
          <div key={name} className="space-y-1">
            <div className="flex gap-3 items-end">
              <div className="flex-1 min-w-0">
                <Input
                  type="number"
                  label={spec.label}
                  min={spec.min}
                  max={spec.max}
                  step={1}
                  value={draft[name] ?? String(caps[name].value)}
                  error={errors[name]}
                  onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                />
              </div>
              <SourceBadge source={caps[name].source} />
            </div>
            <p className="text-xs text-muted-foreground">
              {spec.help} Default {spec.defaultValue}; allowed {spec.min} to {spec.max}.
            </p>
          </div>
        );
      })}
      <Button
        disabled={save.isPending || hasErrors || Object.keys(changed).length === 0}
        onClick={() => save.mutate(changed, { onSuccess: () => setDraft({}) })}
      >
        Save pattern limits
      </Button>
    </div>
  );
};

/**
 * Platform Defaults → Skill routing patterns (BE 2026-11-09): the pattern caps and the catalogue
 * of ready-made patterns workspaces can tick. Each half says on its own when this backend does
 * not have it yet, so an older backend never hides the other half.
 */
export const SkillPatternsCard = ({ caps }: { caps: PlatformSettings['skillPatternCaps'] }) => (
  <Card data-config-card="Skill routing patterns">
    <CardHeader>
      <CardTitle className="flex gap-2 items-center text-xl">
        <Regex className="w-5 h-5" />
        Skill routing patterns
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      {caps ? (
        <PatternCaps caps={caps} />
      ) : (
        <p className="text-sm text-muted-foreground">{ROUTING_NOT_DEPLOYED}</p>
      )}
      <SkillPatternCatalogue />
    </CardContent>
  </Card>
);
