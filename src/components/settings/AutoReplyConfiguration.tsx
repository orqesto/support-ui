import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Plus,
  X,
} from 'lucide-react';
import type { AlertState } from '@/components/settings/integrations/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import { organizationService } from '@/services/organization.service';

/* eslint-disable max-lines -- single cohesive component; splitting would
   require threading 6+ pieces of state through child props or context. */
// Unified AI Auto-Reply. Default row at top applies to every dept; per-dept
// rows override individual fields. Same PATCH /api/organizations/auto-reply
// endpoint as before — no BE change.

type Settings = {
  autoReplyEnabled?: boolean;
  autoReplyRequestMissingInfo?: boolean;
  autoReplySuggestSolutions?: boolean;
  autoReplyHighConfidenceThreshold?: number;
  escalationPhrases?: string[];
};

const DEFAULT_THRESHOLD = 0.9;
const DEPT_MIN_THRESHOLD = 0.9;
const DEPT_MAX_THRESHOLD = 1.0;
const MAX_ESCALATION_PHRASES = 50;

type Props = {
  onShowAlert: (alert: AlertState) => void;
};

const formatThreshold = (value: number): string => `${Math.round(value * 100)}%`;

const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) => (
  <label className="inline-flex gap-2 items-center text-sm cursor-pointer">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
  </label>
);

export const AutoReplyConfiguration = ({ onShowAlert }: Props) => {
  const { isOrgAdmin } = usePermissions();
  const { data: departments = [] } = useDepartments();
  const activeDepts = useMemo(
    () => departments.filter((dept) => dept.active),
    [departments]
  );

  // Org-level (the "Default" row). Source-of-truth lives on the server; this is
  // the local mirror. Ref guards against concurrent toggle races at the org
  // level just like perDeptRef does at the dept level (rapid double-click).
  const [org, setOrg] = useState<Settings>({});
  const orgRef = useRef<Settings>({});
  // Per-dept overrides keyed by stringified dept id. Same race-safe ref pattern
  // as the original DepartmentAutoReplySettings — overlapping saves on
  // different rows must each read the latest merged map, not a stale closure.
  const [perDept, setPerDept] = useState<Record<string, Settings>>({});
  const perDeptRef = useRef<Record<string, Settings>>({});

  const [loading, setLoading] = useState(true);
  const [savingScope, setSavingScope] = useState<'org' | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // localStorage-persisted expand state so an admin's preference survives
  // navigation. Default-row stays open by default (most common interaction);
  // dept rows are recalled from the previous session.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(['default']);
    try {
      const raw = window.localStorage.getItem('auto-reply-config:expanded');
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // localStorage may throw in private-browsing / quota-exceeded cases.
    }
    return new Set(['default']);
  });
  const [phraseDrafts, setPhraseDrafts] = useState<Record<string, string>>({});

  // Threshold is editable via a slider that triggers a save on mouse/touch up;
  // mid-drag we hold the value locally so the slider stays responsive.
  const [tempThresholdOrg, setTempThresholdOrg] = useState<number | null>(null);
  const [tempThresholdDept, setTempThresholdDept] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [auto, orgRow] = await Promise.all([
          organizationService.getAutoReply(),
          organizationService.getCurrent(),
        ]);
        if (cancelled) return;
        const initialOrg: Settings = {
          autoReplyEnabled: auto.enabled,
          autoReplyRequestMissingInfo: auto.requestMissingInfo,
          autoReplySuggestSolutions: auto.suggestSolutions,
          autoReplyHighConfidenceThreshold: auto.highConfidenceThreshold,
        };
        setOrg(initialOrg);
        orgRef.current = initialOrg;
        const settings: Record<string, unknown> = orgRow.settings ?? {};
        const dept = (settings.departmentSettings ?? {}) as Record<string, Settings>;
        setPerDept(dept);
        perDeptRef.current = dept;
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load auto-reply settings:', err);
        setError('Failed to load auto-reply settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          'auto-reply-config:expanded',
          JSON.stringify(Array.from(next))
        );
      } catch {
        // best-effort persistence
      }
      return next;
    });
  };

  const saveOrg = useCallback(
    async (patch: Partial<{
      enabled: boolean;
      requestMissingInfo: boolean;
      suggestSolutions: boolean;
      highConfidenceThreshold: number;
    }>) => {
      setSavingScope('org');
      setError(null);
      // Mirror perDeptRef's pattern at the org level: write through the ref
      // synchronously *before* the await so a second rapid save reads the
      // pending state, not stale closure state.
      const previous = orgRef.current;
      const optimistic: Settings = {
        ...previous,
        ...(patch.enabled !== undefined && { autoReplyEnabled: patch.enabled }),
        ...(patch.requestMissingInfo !== undefined && {
          autoReplyRequestMissingInfo: patch.requestMissingInfo,
        }),
        ...(patch.suggestSolutions !== undefined && {
          autoReplySuggestSolutions: patch.suggestSolutions,
        }),
        ...(patch.highConfidenceThreshold !== undefined && {
          autoReplyHighConfidenceThreshold: patch.highConfidenceThreshold,
        }),
      };
      orgRef.current = optimistic;
      try {
        await organizationService.updateAutoReply(patch);
        setOrg(optimistic);
        // Success toast — covers the field that changed. Old AIAutoReplyCard
        // emitted these per-handler; restoring parity so admins see a "yes,
        // that saved" confirmation.
        const field = patch.enabled !== undefined
          ? `AI auto-reply ${patch.enabled ? 'enabled' : 'disabled'}`
          : patch.requestMissingInfo !== undefined
            ? `Missing-info requests ${patch.requestMissingInfo ? 'on' : 'off'}`
            : patch.suggestSolutions !== undefined
              ? `Suggest-solutions ${patch.suggestSolutions ? 'on' : 'off'}`
              : patch.highConfidenceThreshold !== undefined
                ? `Threshold set to ${Math.round(patch.highConfidenceThreshold * 100)}%`
                : 'Default updated';
        onShowAlert({
          open: true,
          title: 'Saved',
          description: field,
          variant: 'success',
        });
      } catch (err) {
        orgRef.current = previous;
        logger.error('Failed to save org auto-reply:', err);
        setError('Failed to save the default. Please try again.');
        onShowAlert({
          open: true,
          title: 'Save failed',
          description: 'Could not save the org-level auto-reply default.',
          variant: 'error',
        });
      } finally {
        setSavingScope(null);
      }
    },
    [onShowAlert]
  );

  const saveDept = useCallback(
    async (deptId: number, next: Settings) => {
      const key = String(deptId);
      setSavingScope(deptId);
      setError(null);
      const previous = perDeptRef.current[key];
      const merged: Record<string, Settings> = {
        ...perDeptRef.current,
        [key]: next,
      };
      perDeptRef.current = merged;
      try {
        await organizationService.updateAutoReply({ departmentSettings: merged });
        setPerDept(merged);
      } catch (err) {
        logger.error(`Failed to save dept ${deptId} auto-reply:`, err);
        if (previous === undefined) {
          const rolled = { ...perDeptRef.current };
          delete rolled[key];
          perDeptRef.current = rolled;
        } else {
          perDeptRef.current = { ...perDeptRef.current, [key]: previous };
        }
        setError('Failed to save the override. Please try again.');
        onShowAlert({
          open: true,
          title: 'Save failed',
          description: `Could not save the override for this department.`,
          variant: 'error',
        });
      } finally {
        setSavingScope(null);
      }
    },
    [onShowAlert]
  );

  const resetDept = (deptId: number) => {
    const key = String(deptId);
    if (!perDeptRef.current[key]) return;
    setSavingScope(deptId);
    setError(null);
    const previous = perDeptRef.current[key];
    const merged = { ...perDeptRef.current };
    delete merged[key];
    perDeptRef.current = merged;
    organizationService
      .updateAutoReply({ departmentSettings: merged })
      .then(() => {
        setPerDept(merged);
      })
      .catch((err: unknown) => {
        logger.error(`Failed to reset dept ${deptId} auto-reply:`, err);
        perDeptRef.current = { ...perDeptRef.current, [key]: previous };
        setError('Failed to reset the override. Please try again.');
      })
      .finally(() => setSavingScope(null));
  };

  if (!isOrgAdmin) {
    // Old AIAutoReplyCard was visible (read-only) to non-org-admins so they
    // could at least see what was configured. Preserve that visibility with
    // a non-interactive summary instead of hiding the section entirely.
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <MessageCircle className="w-5 h-5" />
            AI Auto-Reply
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Default: <strong>{org.autoReplyEnabled ? 'Enabled' : 'Disabled'}</strong>
            {org.autoReplyEnabled && org.autoReplyHighConfidenceThreshold !== undefined &&
              ` · threshold ${formatThreshold(org.autoReplyHighConfidenceThreshold)}`}
            . Only organization admins can change auto-reply settings.
          </p>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading auto-reply settings…
        </CardContent>
      </Card>
    );
  }

  const orgEnabled = org.autoReplyEnabled ?? false;
  const orgThreshold = tempThresholdOrg ?? org.autoReplyHighConfidenceThreshold ?? DEFAULT_THRESHOLD;
  const orgRequestMissing = org.autoReplyRequestMissingInfo ?? true;
  const orgSuggest = org.autoReplySuggestSolutions ?? true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <MessageCircle className="w-5 h-5" />
          AI Auto-Reply
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Drafts a real reply when the AI is confident. The Default row applies to every department.
          A department row uses the default unless overridden.
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex gap-2 items-start px-3 py-2 mb-4 text-sm text-red-700 rounded-md border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-md border divide-y">
          {/* Default row */}
          <div className="bg-muted/30">
            <button
              type="button"
              onClick={() => toggleExpanded('default')}
              className="flex justify-between items-center px-3 py-2.5 w-full text-left hover:bg-muted/50"
              aria-expanded={expanded.has('default')}
            >
              <div className="flex gap-2 items-center min-w-0">
                {expanded.has('default')
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <span className="text-sm font-semibold">Default</span>
                <span className="text-xs text-muted-foreground">
                  · applies to every dept unless overridden
                </span>
              </div>
              <div className="flex gap-3 items-center shrink-0">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    orgEnabled
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {orgEnabled ? 'On' : 'Off'}
                </span>
                {orgEnabled && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {formatThreshold(orgThreshold)}
                  </span>
                )}
              </div>
            </button>
            {expanded.has('default') && (
              <div className="px-3 pt-1 pb-3 space-y-3 bg-background">
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <p className="text-sm font-medium">Enable AI auto-reply</p>
                    <p className="text-xs text-muted-foreground">
                      Master switch for the default. Each dept can override below.
                    </p>
                  </div>
                  <Toggle
                    checked={orgEnabled}
                    disabled={savingScope === 'org'}
                    onChange={(next) => void saveOrg({ enabled: next })}
                  />
                </div>

                {orgEnabled && (
                  <>
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-sm font-medium">Request missing info</p>
                        <p className="text-xs text-muted-foreground">
                          AI asks customers for more details when messages are incomplete.
                        </p>
                      </div>
                      <Toggle
                        checked={orgRequestMissing}
                        disabled={savingScope === 'org'}
                        onChange={(next) => void saveOrg({ requestMissingInfo: next })}
                      />
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-sm font-medium">Suggest solutions</p>
                        <p className="text-xs text-muted-foreground">
                          AI searches the knowledge base and drafts an answer.
                        </p>
                      </div>
                      <Toggle
                        checked={orgSuggest}
                        disabled={savingScope === 'org'}
                        onChange={(next) => void saveOrg({ suggestSolutions: next })}
                      />
                    </div>
                    {orgSuggest && (
                      <div className="pt-3 space-y-2 border-t">
                        <div className="flex justify-between items-center">
                          <label
                            htmlFor="org-threshold"
                            className="text-sm font-medium"
                          >
                            Auto-send threshold
                          </label>
                          <span className="text-sm font-medium text-primary">
                            {formatThreshold(orgThreshold)}
                          </span>
                        </div>
                        <input
                          id="org-threshold"
                          type="range"
                          min={70}
                          max={100}
                          step={5}
                          value={Math.round(orgThreshold * 100)}
                          disabled={savingScope === 'org'}
                          onChange={(ev) => setTempThresholdOrg(Number(ev.target.value) / 100)}
                          onMouseUp={() => {
                            if (tempThresholdOrg !== null) {
                              void saveOrg({ highConfidenceThreshold: tempThresholdOrg });
                              setTempThresholdOrg(null);
                            }
                          }}
                          onTouchEnd={() => {
                            if (tempThresholdOrg !== null) {
                              void saveOrg({ highConfidenceThreshold: tempThresholdOrg });
                              setTempThresholdOrg(null);
                            }
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          ≥ threshold: auto-send. Below: surface to an agent. &lt;70%: skip.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Department rows */}
          {activeDepts.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No active departments configured.
            </div>
          )}
          {activeDepts.map((dept) => {
            const key = String(dept.id);
            const isExpanded = expanded.has(key);
            const isSaving = savingScope === dept.id;
            const settings = perDept[key];
            const hasOverride = !!settings;
            const overrideEnabled = settings?.autoReplyEnabled;
            const overrideThreshold = settings?.autoReplyHighConfidenceThreshold;
            const overrideRequestMissing = settings?.autoReplyRequestMissingInfo;
            const overrideSuggest = settings?.autoReplySuggestSolutions;
            const phrases = settings?.escalationPhrases ?? [];
            const sliderThreshold =
              tempThresholdDept[key] ?? overrideThreshold ?? orgThreshold;

            const summary = (() => {
              if (!hasOverride) return { label: 'Inherits default', tone: 'muted' as const };
              if (overrideEnabled === false) return { label: 'Override: off', tone: 'red' as const };
              if (overrideEnabled === true) return { label: 'Override: on', tone: 'green' as const };
              if (
                overrideThreshold !== undefined ||
                overrideRequestMissing !== undefined ||
                overrideSuggest !== undefined ||
                phrases.length > 0
              ) {
                return { label: 'Partial override', tone: 'amber' as const };
              }
              return { label: 'Inherits default', tone: 'muted' as const };
            })();

            const summaryClass =
              summary.tone === 'green'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : summary.tone === 'red'
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : summary.tone === 'amber'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground';

            return (
              <div key={dept.id}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(key)}
                  className="flex justify-between items-center px-3 py-2.5 w-full text-left hover:bg-muted/30"
                  aria-expanded={isExpanded}
                >
                  <div className="flex gap-2 items-center min-w-0">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className="text-sm font-medium truncate">{dept.name}</span>
                    <span className="text-[10px] text-muted-foreground">{dept.slug}</span>
                  </div>
                  <div className="flex gap-3 items-center shrink-0">
                    {isSaving && (
                      <span className="text-[10px] text-muted-foreground">Saving…</span>
                    )}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${summaryClass}`}>
                      {summary.label}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pt-1 pb-3 space-y-3 bg-muted/10">
                    {/* Override toggle: tri-state via two explicit choices */}
                    <div className="flex flex-wrap gap-2 items-center pt-2">
                      <span className="text-xs text-muted-foreground">Auto-reply for this dept:</span>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          if (!hasOverride) return; // Already inheriting
                          resetDept(dept.id);
                        }}
                        className={`px-2 py-0.5 text-[10px] rounded-full border ${
                          !hasOverride
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Inherit default {orgEnabled ? '(on)' : '(off)'}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void saveDept(dept.id, { ...settings, autoReplyEnabled: true })}
                        className={`px-2 py-0.5 text-[10px] rounded-full border ${
                          overrideEnabled === true
                            ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Override: on
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void saveDept(dept.id, { ...settings, autoReplyEnabled: false })}
                        className={`px-2 py-0.5 text-[10px] rounded-full border ${
                          overrideEnabled === false
                            ? 'bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-300'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Override: off
                      </button>
                    </div>

                    {/* Threshold override only available when this dept will fire auto-reply */}
                    {(overrideEnabled ?? orgEnabled) && (
                      <div className="pt-3 space-y-2 border-t">
                        <div className="flex justify-between items-center">
                          <label htmlFor={`dept-threshold-${dept.id}`} className="text-xs font-medium">
                            Auto-send threshold
                            {overrideThreshold === undefined && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (inheriting {formatThreshold(orgThreshold)})
                              </span>
                            )}
                          </label>
                          <span className="text-xs font-medium text-primary">
                            {formatThreshold(sliderThreshold)}
                          </span>
                        </div>
                        <input
                          id={`dept-threshold-${dept.id}`}
                          type="range"
                          min={Math.round(DEPT_MIN_THRESHOLD * 100)}
                          max={Math.round(DEPT_MAX_THRESHOLD * 100)}
                          step={1}
                          value={Math.round(sliderThreshold * 100)}
                          disabled={isSaving}
                          onChange={(ev) =>
                            setTempThresholdDept((prev) => ({
                              ...prev,
                              [key]: Number(ev.target.value) / 100,
                            }))
                          }
                          onMouseUp={() => {
                            const value = tempThresholdDept[key];
                            if (value !== undefined) {
                              void saveDept(dept.id, {
                                ...settings,
                                autoReplyHighConfidenceThreshold: value,
                              });
                              setTempThresholdDept((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }
                          }}
                          onTouchEnd={() => {
                            const value = tempThresholdDept[key];
                            if (value !== undefined) {
                              void saveDept(dept.id, {
                                ...settings,
                                autoReplyHighConfidenceThreshold: value,
                              });
                              setTempThresholdDept((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground">Range 90–100%.</p>
                      </div>
                    )}

                    {/* Escalation phrases — per dept only */}
                    <div className="pt-3 space-y-2 border-t">
                      <label className="text-xs font-medium">
                        Escalation phrases (hard-block){' '}
                        {phrases.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ({phrases.length})
                          </span>
                        )}
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        When any of these appears in inbound content, auto-send is blocked. The
                        reply is still generated and surfaced for an agent.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {phrases.length === 0 && (
                          <span className="text-xs italic text-muted-foreground">No phrases</span>
                        )}
                        {phrases.map((phrase) => (
                          <span
                            key={phrase}
                            className="flex gap-1 items-center px-2 py-0.5 text-xs text-yellow-900 bg-yellow-100 rounded-full dark:bg-yellow-900/30 dark:text-yellow-200"
                          >
                            {phrase}
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                void saveDept(dept.id, {
                                  ...settings,
                                  escalationPhrases: phrases.filter((entry) => entry !== phrase),
                                })
                              }
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
                          value={phraseDrafts[key] ?? ''}
                          placeholder='e.g. "speak to a human", "urgent"'
                          disabled={isSaving}
                          onChange={(ev) =>
                            setPhraseDrafts((prev) => ({ ...prev, [key]: ev.target.value }))
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') {
                              ev.preventDefault();
                              const draft = (phraseDrafts[key] ?? '').trim();
                              if (!draft) return;
                              if (phrases.includes(draft)) {
                                setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                                return;
                              }
                              if (phrases.length >= MAX_ESCALATION_PHRASES) {
                                setError(
                                  `Maximum ${MAX_ESCALATION_PHRASES} escalation phrases per department.`
                                );
                                return;
                              }
                              void saveDept(dept.id, {
                                ...settings,
                                escalationPhrases: [...phrases, draft],
                              });
                              setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                            }
                          }}
                          className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={isSaving || !(phraseDrafts[key] ?? '').trim()}
                          onClick={() => {
                            const draft = (phraseDrafts[key] ?? '').trim();
                            if (!draft) return;
                            if (phrases.includes(draft)) {
                              setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                              return;
                            }
                            if (phrases.length >= MAX_ESCALATION_PHRASES) {
                              setError(
                                `Maximum ${MAX_ESCALATION_PHRASES} escalation phrases per department.`
                              );
                              return;
                            }
                            void saveDept(dept.id, {
                              ...settings,
                              escalationPhrases: [...phrases, draft],
                            });
                            setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                          }}
                          className="flex gap-1 items-center px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>
                    </div>

                    {hasOverride && (
                      <div className="pt-3 border-t">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => resetDept(dept.id)}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Reset all overrides for {dept.name}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
