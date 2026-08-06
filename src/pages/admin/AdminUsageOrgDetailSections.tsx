/**
 * Sub-sections of the expanded org detail row in AdminUsageTab.
 * Extracted to keep AdminUsageTab.tsx under the max-lines limit.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { UsageProgressBar, type UsageItem } from './AdminUsageTab.helpers';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';

type OrgAiUsageSectionProps = {
  aiCalls: UsageItem;
};

export const OrgAiUsageSection = ({ aiCalls }: OrgAiUsageSectionProps) => (
  <div className="space-y-2">
    <h4 className="text-sm font-semibold text-muted-foreground">AI Usage This Month</h4>
    <div className="p-4 rounded-lg border bg-card border-border">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-sm font-medium">AI API Calls</div>
          <div className="text-xs text-muted-foreground">All AI features combined</div>
        </div>
        <Zap className="w-4 h-4 text-amber-500" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Usage:</span>
          <span className="font-medium">
            {aiCalls.current.toLocaleString()} / {aiCalls.limit.toLocaleString()} calls
          </span>
        </div>
        <UsageProgressBar percentage={aiCalls.percentage} />
        {aiCalls.critical && (
          <div className="p-2 text-xs bg-red-50 rounded border border-red-200">
            <span className="font-medium text-red-700">
              AI call limit reached! Some AI features may be unavailable.
            </span>
          </div>
        )}
        {aiCalls.warning && !aiCalls.critical && (
          <div className="p-2 text-xs bg-orange-50 rounded border border-orange-200">
            <span className="font-medium text-orange-700">
              Approaching AI call limit ({aiCalls.percentage}% used)
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ── Per-org feature overrides ────────────────────────────────────────────────
// Lists EVERY plan feature with a per-org toggle (Inherit / On / Off). A global
// admin can force any capability on or off for a specific org; the override wins
// over the plan on the backend (org_feature_overrides). Self-fetches on mount.
type FeatureOverrideRow = {
  key: string;
  label: string;
  category: string;
  planGrant: boolean;
  override: boolean | null;
  effective: boolean;
};

export const OrgFeatureOverridesSection = ({ orgId }: { orgId: number }) => {
  const [features, setFeatures] = useState<FeatureOverrideRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: { features: FeatureOverrideRow[] } }>(
        `/api/admin/organizations/${orgId}/feature-overrides`
      );
      setFeatures(res.data.data.features);
      setError(null);
    } catch {
      setError('Failed to load features');
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (featureKey: string, enabled: boolean | null) => {
    setSaving(featureKey);
    try {
      await apiClient.put(`/api/admin/organizations/${orgId}/feature-overrides`, {
        featureKey,
        enabled,
      });
      await load();
    } catch {
      setError('Failed to update feature');
    } finally {
      setSaving(null);
    }
  };

  const categories = features ? [...new Set(features.map((feat) => feat.category))] : [];
  const options = [
    { v: null as boolean | null, l: 'Inherit' },
    { v: true as boolean | null, l: 'On' },
    { v: false as boolean | null, l: 'Off' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Feature Access — per-org overrides
          </h4>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">Inherit</span> follows the plan ·{' '}
          <span className="font-medium">On/Off</span> overrides it · the dot and label show the{' '}
          <span className="font-medium">effective</span> result.
        </p>
      </div>
      {!features ? (
        <p className="text-sm text-muted-foreground">Loading features…</p>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-xs font-medium tracking-wide uppercase text-muted-foreground">
                {cat}
              </p>
              <div className="space-y-1">
                {features
                  .filter((feat) => feat.category === cat)
                  .map((feat) => (
                    <div key={feat.key} className="flex gap-3 justify-between items-center py-1">
                      <div className="flex gap-2 items-center min-w-0">
                        <span
                          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${feat.effective ? 'bg-green-500' : 'bg-gray-500'}`}
                        />
                        <span className="text-sm truncate">{feat.label}</span>
                        <span
                          className={`flex-shrink-0 text-xs font-medium ${feat.effective ? 'text-green-600' : 'text-gray-500'}`}
                        >
                          {feat.effective ? 'On' : 'Off'}
                        </span>
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          (plan: {feat.planGrant ? 'on' : 'off'})
                        </span>
                        {saving === feat.key && (
                          <RefreshCw className="flex-shrink-0 w-3 h-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        {options.map((opt) => (
                          <Button
                            key={opt.l}
                            size="sm"
                            variant={feat.override === opt.v ? 'primary' : 'outline'}
                            disabled={saving !== null}
                            onClick={() => void apply(feat.key, opt.v)}
                          >
                            {opt.l}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
