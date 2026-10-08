import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatLimit, LIMIT_FIELDS, type LimitKey } from '@/components/console/limitFields';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api-client';

type LimitRow = {
  key: LimitKey;
  plan: number | null;
  override: { value: number; reason: string | null; updatedAt: string } | null;
  effective: number;
};

type LimitsResponse = { planName: string; trialing: boolean; enforced: boolean; limits: LimitRow[] };

/**
 * Per-workspace limit overrides (owner decision D2, 2026-10-07). Every limit with the plan's value,
 * any override, and the EFFECTIVE value the backend uses (plan + trial floor + override). An
 * override wins for its one limit; Clear returns it to the plan. Self-fetches on mount.
 */
export const OrgLimitOverridesSection = ({ orgId }: { orgId: number }) => {
  const [data, setData] = useState<LimitsResponse | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<LimitKey, string>>>({});
  const [saving, setSaving] = useState<LimitKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: LimitsResponse }>(`/api/admin/organizations/${orgId}/limit-overrides`);
      setData(res.data.data);
      setError(null);
    } catch {
      setError('Failed to load limits');
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: LimitKey, value: number | null) => {
    setSaving(key);
    try {
      await apiClient.put(`/api/admin/organizations/${orgId}/limit-overrides`, { limitKey: key, value });
      setDrafts((current) => ({ ...current, [key]: '' }));
      await load();
    } catch {
      setError('Failed to save the limit');
    } finally {
      setSaving(null);
    }
  };

  const rows = data ? new Map(data.limits.map((row) => [row.key, row])) : null;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between items-center">
          <h4 className="font-display text-sm font-semibold text-muted-foreground">Limits — per-workspace overrides</h4>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          An override wins over the plan{data?.trialing ? ' and the trial' : ''} for that one limit. 999999 means
          unlimited.
          {data && !data.enforced && ' Limits are not enforced on this deployment — the values are shown, not applied.'}
        </p>
      </div>
      {!rows ? (
        <p className="text-sm text-muted-foreground">Loading limits…</p>
      ) : (
        <div className="space-y-2">
          {LIMIT_FIELDS.map(({ key, label, hint }) => {
            const row = rows.get(key);
            if (!row) return null;
            const draft = drafts[key] ?? '';
            const value = Number(draft);
            const valid = draft.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 999999;
            return (
              <div key={key} className="flex flex-wrap gap-3 justify-between items-center py-1">
                <div className="min-w-0">
                  <div className="flex gap-2 items-center">
                    <span className="text-sm">{label}</span>
                    <span className="text-xs font-medium">{formatLimit(row.effective)}</span>
                    {row.override ? (
                      <Badge variant="warning">override</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">(plan: {formatLimit(row.plan)})</span>
                    )}
                    {saving === key && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hint}
                    {row.override && ` · plan: ${formatLimit(row.plan)}`}
                  </p>
                </div>
                <div className="flex gap-1 items-center">
                  <Input
                    aria-label={`${label} override`}
                    type="number"
                    min={0}
                    className="w-28"
                    placeholder={row.override ? String(row.override.value) : 'New value'}
                    value={draft}
                    onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <Button size="sm" disabled={!valid || saving !== null} onClick={() => void save(key, value)}>
                    Set
                  </Button>
                  {row.override && (
                    <Button size="sm" variant="outline" disabled={saving !== null} onClick={() => void save(key, null)}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
