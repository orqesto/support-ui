import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformRouting } from '@/hooks/usePlatformSettings';
import type { PlatformSettings } from '@/services/platformSettings.service';
import {
  ROUTING_SETTING_FIELDS,
  ROUTING_SETTING_SPECS,
  routingFieldError,
  type PlatformRoutingInput,
  type RoutingSettingField,
} from '@/services/routingSettings';
import { SourceBadge } from './SourceBadge';

export const ROUTING_NOT_DEPLOYED =
  'This server does not have these settings yet — they arrive with the next backend release.';

const TITLE = (
  <CardTitle className="flex gap-2 items-center text-xl">
    <GitBranch className="w-5 h-5" />
    Routing proposals
  </CardTitle>
);

/**
 * Platform Defaults → Routing proposals (spec 2026-10-14 §5): the seven thresholds behind routing
 * proposals, the re-route window, archiving and Balanced/Aggressive auto-accept. Save sends only
 * the fields that changed (the backend takes any non-empty subset); each value is checked against
 * the backend's range first. There is no reset: the backend has no way to clear a saved value,
 * so the default is shown beside each field for retyping.
 */
export const RoutingProposalsCard = ({ routing }: { routing: PlatformSettings['routing'] }) => {
  const save = useUpdatePlatformRouting();
  const [draft, setDraft] = useState<Partial<Record<RoutingSettingField, string>>>({});
  if (!routing) {
    return (
      <Card data-config-card="Routing proposals">
        <CardHeader>{TITLE}</CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{ROUTING_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }
  const errors: Partial<Record<RoutingSettingField, string>> = {};
  const changed: PlatformRoutingInput = {};
  for (const name of ROUTING_SETTING_FIELDS) {
    const text = draft[name];
    if (text === undefined) continue;
    const error = routingFieldError(name, text);
    if (error) errors[name] = error;
    else if (Number(text) !== routing[name].value) changed[name] = Number(text);
  }
  const hasErrors = Object.keys(errors).length > 0;
  return (
    <Card data-config-card="Routing proposals">
      <CardHeader>{TITLE}</CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Platform-wide, not per workspace. Changes apply from the next routing or nightly pass.
        </p>
        {ROUTING_SETTING_FIELDS.map((name) => {
          const spec = ROUTING_SETTING_SPECS[name];
          return (
            <div key={name} className="space-y-1">
              <div className="flex gap-3 items-end">
                <div className="flex-1 min-w-0">
                  <Input
                    type="number"
                    label={spec.label}
                    min={spec.min}
                    max={spec.max}
                    step={spec.integer ? 1 : 0.01}
                    value={draft[name] ?? String(routing[name].value)}
                    error={errors[name]}
                    onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                  />
                </div>
                <SourceBadge source={routing[name].source} />
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
          Save routing settings
        </Button>
      </CardContent>
    </Card>
  );
};
