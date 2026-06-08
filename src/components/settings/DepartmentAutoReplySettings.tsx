import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, AlertTriangle, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService } from '@/services/organization.service';
import { logger } from '@/lib/logger';

// Threshold range per Wave 4 PR 7 spec — stricter than the org-level slider.
const MIN_THRESHOLD = 0.9;
const MAX_THRESHOLD = 1.0;
const DEFAULT_THRESHOLD = 0.97;

// localStorage key for persisting the collapsible state across sessions.
const EXPANDED_STORAGE_KEY = 'dept-auto-reply-overrides:expanded';

type DeptAutoReplySettings = {
  autoReplyEnabled?: boolean;
  autoReplyRequestMissingInfo?: boolean;
  autoReplySuggestSolutions?: boolean;
  autoReplyHighConfidenceThreshold?: number;
  escalationPhrases?: string[];
};

export const DepartmentAutoReplySettings = () => {
  const { isOrgAdmin } = usePermissions();
  const { data: departments = [] } = useDepartments();
  const activeDepts = useMemo(
    () => departments.filter((dept) => dept.active),
    [departments]
  );
  // Keyed by stringified dept ID — matches the BE's reader contract.
  const [perDept, setPerDept] = useState<Record<string, DeptAutoReplySettings>>({});
  // Mirror of perDept that updates synchronously inside `persist`. Closes the
  // race where two concurrent saves (clicking different dept toggles in quick
  // succession) would each read perDept from a stale closure and send a map
  // missing the other's change — BE wholesale-replaces, so the first save
  // would silently be lost. Reading from this ref ensures every save sees the
  // latest in-flight merged state.
  const perDeptRef = useRef<Record<string, DeptAutoReplySettings>>({});
  const [loading, setLoading] = useState(true);
  const [savingDeptId, setSavingDeptId] = useState<number | null>(null);
  const [phraseDrafts, setPhraseDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Default collapsed — the section takes a lot of vertical space when many
  // depts exist. Persist the user's choice so it survives navigation.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === '1';
  });
  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EXPANDED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage may throw in private-browsing / quota-exceeded cases —
        // expansion state is best-effort, ignore the failure.
      }
      return next;
    });
  };

  // Load org settings on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    organizationService
      .getCurrent()
      .then((org) => {
        if (cancelled) return;
        const settings: Record<string, unknown> = org.settings ?? {};
        const dept = (settings.departmentSettings ?? {}) as Record<string, DeptAutoReplySettings>;
        setPerDept(dept);
        perDeptRef.current = dept;
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('Failed to load org settings for dept auto-reply:', err);
        setError('Failed to load department settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (deptId: number, next: DeptAutoReplySettings) => {
    const key = String(deptId);
    setSavingDeptId(deptId);
    setError(null);
    // Read latest in-flight map from the ref (not the closure'd state) so
    // overlapping saves don't drop each other's updates. Apply the change to
    // the ref synchronously *before* the await so any concurrent persist call
    // building from the ref sees this change too.
    const previous = perDeptRef.current[key];
    const merged: Record<string, DeptAutoReplySettings> = {
      ...perDeptRef.current,
      [key]: next,
    };
    perDeptRef.current = merged;
    try {
      await organizationService.updateAutoReply({ departmentSettings: merged });
      setPerDept(merged);
    } catch (err) {
      logger.error(`Failed to save auto-reply settings for dept ${deptId}:`, err);
      // Roll the ref back so the failed change doesn't leak into the next save.
      // If previous was undefined the key shouldn't exist; rebuild without it.
      if (previous === undefined) {
        const rolled = { ...perDeptRef.current };
        delete rolled[key];
        perDeptRef.current = rolled;
      } else {
        perDeptRef.current = { ...perDeptRef.current, [key]: previous };
      }
      setError('Failed to save. Please try again.');
    } finally {
      setSavingDeptId(null);
    }
  }, []);

  const updateField = (deptId: number, patch: DeptAutoReplySettings) => {
    const key = String(deptId);
    const existing = perDeptRef.current[key] ?? {};
    const next = { ...existing, ...patch };
    void persist(deptId, next);
  };

  const handleAddPhrase = (deptId: number) => {
    const key = String(deptId);
    const phrase = (phraseDrafts[key] ?? '').trim();
    if (!phrase) return;
    const existing = perDeptRef.current[key] ?? {};
    const current = existing.escalationPhrases ?? [];
    if (current.includes(phrase)) {
      setPhraseDrafts({ ...phraseDrafts, [key]: '' });
      return;
    }
    if (current.length >= 50) {
      setError('Maximum 50 escalation phrases per department.');
      return;
    }
    const next: DeptAutoReplySettings = {
      ...existing,
      escalationPhrases: [...current, phrase],
    };
    setPhraseDrafts({ ...phraseDrafts, [key]: '' });
    void persist(deptId, next);
  };

  const handleRemovePhrase = (deptId: number, phrase: string) => {
    const key = String(deptId);
    const existing = perDeptRef.current[key] ?? {};
    const next: DeptAutoReplySettings = {
      ...existing,
      escalationPhrases: (existing.escalationPhrases ?? []).filter((entry) => entry !== phrase),
    };
    void persist(deptId, next);
  };

  // PATCH /api/organizations/auto-reply requires org_admin on the BE — hide the
  // panel entirely for non-admins instead of letting them click controls that
  // 403.
  if (!isOrgAdmin) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading department settings...
        </CardContent>
      </Card>
    );
  }

  if (activeDepts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No active departments configured.
        </CardContent>
      </Card>
    );
  }

  // Count depts with any non-default override so the collapsed header can hint
  // at whether the admin has anything custom configured.
  const overrideCount = activeDepts.filter((dept) => {
    const settings = perDept[String(dept.id)];
    if (!settings) return false;
    return (
      settings.autoReplyEnabled !== undefined ||
      settings.autoReplyHighConfidenceThreshold !== undefined ||
      (settings.escalationPhrases?.length ?? 0) > 0
    );
  }).length;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex w-full justify-between items-center gap-2 text-left group"
          aria-expanded={expanded}
        >
          <CardTitle className="flex gap-2 items-center">
            {expanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <Building2 className="w-5 h-5" />
            Per-Department Auto-Reply Overrides
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({activeDepts.length} dept{activeDepts.length === 1 ? '' : 's'}
              {overrideCount > 0 ? `, ${overrideCount} customized` : ''})
            </span>
          </CardTitle>
        </button>
      </CardHeader>
      {!expanded ? null : (
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Override the org-level auto-reply behavior per department. Unset fields fall back to the
          org default. Escalation phrases hard-block auto-send when found in inbound content — the
          reply is still generated and surfaced for an agent.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-6">
          {activeDepts.map((dept) => {
            const key = String(dept.id);
            const settings = perDept[key] ?? {};
            const draftPhrase = phraseDrafts[key] ?? '';
            const phrases = settings.escalationPhrases ?? [];
            const enabled = settings.autoReplyEnabled ?? true;
            const threshold = settings.autoReplyHighConfidenceThreshold ?? DEFAULT_THRESHOLD;
            // This row is "saving" if it's the one we're saving — but disable
            // EVERY row's controls while any save is in flight. The persist
            // ref handles correctness; the global disable is defense-in-depth
            // against rapid cross-dept clicking and gives clearer UX.
            const isSaving = savingDeptId === dept.id;
            const isAnySaving = savingDeptId !== null;

            return (
              <div key={dept.id} className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-sm">{dept.name}</h4>
                    <p className="text-xs text-muted-foreground">{dept.slug}</p>
                  </div>
                  <label className="flex gap-2 items-center cursor-pointer">
                    <span className="text-xs text-muted-foreground">
                      {isSaving ? 'Saving…' : enabled ? 'Auto-reply on' : 'Auto-reply off'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => updateField(dept.id, { autoReplyEnabled: !enabled })}
                      disabled={isAnySaving}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ${
                        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Threshold slider */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label htmlFor={`threshold-${dept.id}`} className="font-medium">
                      Auto-send threshold
                    </label>
                    <span className="font-medium text-primary">
                      {Math.round(threshold * 100)}%
                    </span>
                  </div>
                  <input
                    id={`threshold-${dept.id}`}
                    type="range"
                    min={Math.round(MIN_THRESHOLD * 100)}
                    max={Math.round(MAX_THRESHOLD * 100)}
                    step={1}
                    value={Math.round(threshold * 100)}
                    onChange={(ev) =>
                      setPerDept({
                        ...perDept,
                        [key]: {
                          ...settings,
                          autoReplyHighConfidenceThreshold: Number(ev.target.value) / 100,
                        },
                      })
                    }
                    onMouseUp={() =>
                      updateField(dept.id, {
                        autoReplyHighConfidenceThreshold:
                          perDept[key]?.autoReplyHighConfidenceThreshold ?? threshold,
                      })
                    }
                    onTouchEnd={() =>
                      updateField(dept.id, {
                        autoReplyHighConfidenceThreshold:
                          perDept[key]?.autoReplyHighConfidenceThreshold ?? threshold,
                      })
                    }
                    disabled={isAnySaving}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Range 90–100%. Default 97%.
                  </p>
                </div>

                {/* Escalation phrases */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <label className="text-xs font-medium">Escalation phrases (hard-block)</label>
                  <p className="text-[10px] text-muted-foreground">
                    Block auto-send when any phrase appears in the inbound message. The reply is
                    still generated and surfaced for an agent to review.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {phrases.length === 0 && (
                      <span className="text-xs italic text-muted-foreground">No phrases</span>
                    )}
                    {phrases.map((phrase) => (
                      <span
                        key={phrase}
                        className="flex gap-1 items-center px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200"
                      >
                        {phrase}
                        <button
                          type="button"
                          onClick={() => handleRemovePhrase(dept.id, phrase)}
                          disabled={isAnySaving}
                          className="hover:text-red-600 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftPhrase}
                      onChange={(ev) => setPhraseDrafts({ ...phraseDrafts, [key]: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault();
                          handleAddPhrase(dept.id);
                        }
                      }}
                      placeholder='e.g. "speak to a human", "this is urgent"'
                      disabled={isAnySaving}
                      className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddPhrase(dept.id)}
                      disabled={isAnySaving || !draftPhrase.trim()}
                      className="flex gap-1 items-center px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      )}
    </Card>
  );
};
