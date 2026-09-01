import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { featureFlagAdminService, type AdminFeatureFlag } from '@/services/featureFlags.service';
import { organizationService } from '@/services/organization.service';

/**
 * Feature Flags — the console half of the write path (backend:
 * `/api/admin/platform/feature-flags`).
 *
 * Until this page existed nothing in the product could turn a flag on. Eight non-ui
 * flags shipped `false` carrying comments like "default off until calibrated against
 * production traffic" — a condition none of them could ever reach, because
 * calibrating meant enabling one for a single workspace, which meant a hand-written
 * database row, which a deploy with no database shell cannot do at all.
 *
 * Two things the layout has to make obvious, because both are what the backend tests
 * pin and both are easy to get wrong from a bare switch:
 *  - a flag's value comes from a LAYER — workspace row, then global row, then the code
 *    default — so every row says which one decided it;
 *  - "clear the override" is a different act from "turn it off". A workspace row of
 *    `false` keeps the flag off through a later global rollout, so an admin who means
 *    the first and does the second leaves a row that will quietly out-vote them.
 */

const SCOPE_GLOBAL = 'global';

const SOURCE_LABEL: Record<AdminFeatureFlag['source'], string> = {
  organization: 'workspace override',
  global: 'global override',
  code_default: 'code default',
};

const SOURCE_VARIANT: Record<AdminFeatureFlag['source'], 'default' | 'secondary'> = {
  organization: 'default',
  global: 'default',
  code_default: 'secondary',
};

/** `learning.reply_style_emit_suggestion` → group `learning`. */
const groupOf = (key: string): string => key.split('.')[0] ?? 'other';

const FlagRow = ({
  flag,
  scopeOrgId,
  onSet,
  onClear,
  busy,
}: {
  flag: AdminFeatureFlag;
  scopeOrgId: number | null;
  onSet: (enabled: boolean) => void;
  onClear: () => void;
  busy: boolean;
}) => {
  // Whether an override exists at the scope being edited. Only then is "clear"
  // meaningful — clearing a scope with no row is a no-op an admin could not tell
  // apart from a failure, so the action is disabled and says why.
  const overrideHere = scopeOrgId === null ? flag.global : flag.organization;

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-sm text-foreground">{flag.key}</span>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={SOURCE_VARIANT[flag.source]} size="sm">
            {SOURCE_LABEL[flag.source]}
          </Badge>
          <span>ships {flag.codeDefault ? 'on' : 'off'}</span>
          {/* Shown while editing a workspace because the global row is what a
              workspace without a row of its own is inheriting from — the reason a
              toggle here may look like it "did nothing". */}
          {flag.global && scopeOrgId !== null && (
            <span>· global says {flag.global.enabled ? 'on' : 'off'}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Toggle
          checked={flag.effective}
          disabled={busy}
          onChange={onSet}
          label={flag.effective ? 'On' : 'Off'}
        />
        <Tooltip
          content={
            overrideHere
              ? 'Remove this override so the flag falls back to the layer below'
              : 'No override at this scope to remove'
          }
        >
          <Button variant="ghost" size="sm" disabled={busy || !overrideHere} onClick={onClear}>
            Clear override
          </Button>
        </Tooltip>
      </div>
    </li>
  );
};

export const PlatformFeatureFlags = () => {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<string>(SCOPE_GLOBAL);
  const [error, setError] = useState<string | null>(null);
  const scopeOrgId = scope === SCOPE_GLOBAL ? null : Number(scope);

  const flagsQuery = useQuery({
    queryKey: ['platform', 'feature-flags', scopeOrgId],
    queryFn: () => featureFlagAdminService.listAdmin(scopeOrgId),
    refetchOnWindowFocus: false,
  });

  // Workspaces, so a flag can be piloted on one before a global rollout — which is
  // precisely what "calibrate against production traffic" was waiting for.
  const orgsQuery = useQuery({
    queryKey: ['platform', 'organizations', 'for-flags'],
    queryFn: () => organizationService.getAll(undefined, 1, 100),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['platform', 'feature-flags'] });

  const setMutation = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) =>
      featureFlagAdminService.setFlag({ ...input, organizationId: scopeOrgId }),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to write the flag'),
  });

  const clearMutation = useMutation({
    mutationFn: (key: string) => featureFlagAdminService.clearFlag(key, scopeOrgId),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to clear the override'),
  });

  const busy = setMutation.isPending || clearMutation.isPending;

  const grouped = useMemo(() => {
    const flags = flagsQuery.data?.flags ?? [];
    const byGroup = new Map<string, AdminFeatureFlag[]>();
    for (const flag of flags) {
      const group = groupOf(flag.key);
      byGroup.set(group, [...(byGroup.get(group) ?? []), flag]);
    }
    return [...byGroup.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [flagsQuery.data]);

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Feature Flags"
        description="Every flag this build knows about, resolved workspace override → global override → code default."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Label htmlFor="flag-scope">Editing</Label>
          <Select
            id="flag-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value={SCOPE_GLOBAL}>All workspaces (global)</option>
            {(orgsQuery.data?.data ?? []).map((org) => (
              <option key={org.id} value={String(org.id)}>
                {org.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {scopeOrgId === null
            ? 'Writes the global row. A workspace with an override of its own keeps it.'
            : 'Writes an override for this workspace only.'}
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {flagsQuery.isLoading ? (
        <ConsoleLoading />
      ) : flagsQuery.isError ? (
        <Alert variant="danger">
          <div className="space-y-3">
            <p>Failed to load feature flags.</p>
            <Button variant="secondary" onClick={() => flagsQuery.refetch()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, flags]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {group}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul>
                  {flags.map((flag) => (
                    <FlagRow
                      key={flag.key}
                      flag={flag}
                      scopeOrgId={scopeOrgId}
                      busy={busy}
                      onSet={(enabled) => setMutation.mutate({ key: flag.key, enabled })}
                      onClear={() => clearMutation.mutate(flag.key)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
