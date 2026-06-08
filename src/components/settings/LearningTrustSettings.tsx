import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, PlayCircle, RefreshCw, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import {
  learningService,
  type EngineRunSummary,
  type TrustMode,
  type TrustState,
} from '@/services/learning.service';

type ModeDef = {
  id: TrustMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  hint: string;
};

const MODES: ModeDef[] = [
  {
    id: 'manual',
    label: 'Manual',
    icon: Shield,
    description: 'Engine emits suggestions only — admins review every change.',
    hint: 'Safest. Nothing is applied without an admin click.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    icon: ShieldCheck,
    description: 'Engine auto-acts when counterfactual confidence ≥ 0.9 × threshold.',
    hint: 'Recommended once you trust the suggestions. High-confidence changes apply automatically; admins can undo within 30 days.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    icon: ShieldAlert,
    description: 'Engine auto-acts when counterfactual confidence ≥ 0.8 × threshold.',
    hint: 'For orgs with high agent overrides volume. More auto-actions per week; same 30-day undo window.',
  },
];

const formatScore = (score: number): string => (score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2));

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const daysUntil = (iso: string): number => {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

const EngineRunReport = ({ summary }: { summary: EngineRunSummary }) => {
  const totalAction = summary.domains.reduce(
    (acc, dom) =>
      acc + dom.pass3Promoted + dom.pass3Disabled + dom.pass3SuggestionsEmitted + dom.pass4ConflictsEmitted,
    0
  );
  const totalDetected = summary.domains.reduce((acc, dom) => acc + dom.pass4ConflictsDetected, 0);
  const activeDomains = summary.domains.filter(
    (dom) =>
      dom.pass1RulesScored > 0 ||
      dom.pass3Promoted > 0 ||
      dom.pass3Disabled > 0 ||
      dom.pass3SuggestionsEmitted > 0 ||
      dom.pass4ConflictsDetected > 0 ||
      dom.error
  );

  return (
    <div className="mb-4 px-3 py-2 rounded-md text-sm bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200">
      <div className="flex items-start gap-2 mb-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">
            Engine run complete in {(summary.durationMs / 1000).toFixed(2)}s
          </p>
          <p className="text-xs mt-0.5 opacity-90">
            Trust mode: <strong>{summary.trustMode}</strong> · threshold ×
            {summary.thresholdMultiplier.toFixed(2)} ·{' '}
            {totalAction > 0
              ? `${totalAction} action(s) taken`
              : totalDetected > 0
                ? `${totalDetected} conflict(s) detected, all already pending (no new emissions)`
                : 'no new findings'}
          </p>
        </div>
      </div>
      {activeDomains.length > 0 ? (
        <ul className="ml-6 text-xs space-y-0.5 list-disc">
          {activeDomains.map((dom) => (
            <li key={dom.domain}>
              <strong className="capitalize">{dom.domain}</strong>:{' '}
              {dom.error
                ? <span className="text-red-700 dark:text-red-300">error — {dom.error}</span>
                : (
                  <>
                    pass1 scored {dom.pass1RulesScored} rules
                    {dom.pass3Promoted > 0 && <>, promoted {dom.pass3Promoted}</>}
                    {dom.pass3Disabled > 0 && <>, disabled {dom.pass3Disabled}</>}
                    {dom.pass3SuggestionsEmitted > 0 && <>, suggested {dom.pass3SuggestionsEmitted}</>}
                    {dom.pass4ConflictsDetected > 0 && (
                      <>
                        , conflicts {dom.pass4ConflictsDetected} detected ({dom.pass4ConflictsEmitted}{' '}
                        new, {dom.pass4ConflictsDetected - dom.pass4ConflictsEmitted} already pending)
                      </>
                    )}
                  </>
                )
              }
            </li>
          ))}
        </ul>
      ) : (
        <p className="ml-6 text-xs opacity-80">
          All domains idle. Trigger an ingestion or wait for new emails to give the engine fresh
          evidence to score.
        </p>
      )}
    </div>
  );
};

export const LearningTrustSettings = () => {
  const { isOrgAdmin } = usePermissions();
  const [state, setState] = useState<TrustState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<TrustMode | null>(null);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<EngineRunSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await learningService.getTrustState();
      setState(next);
    } catch (err) {
      logger.error('Failed to load learning trust state:', err);
      setError('Failed to load trust state. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async () => {
    setRunning(true);
    setRunSummary(null);
    setError(null);
    try {
      const summary = await learningService.runEngine();
      setRunSummary(summary);
    } catch (err) {
      logger.error('Failed to run learning engine:', err);
      setError('Failed to run the engine. See server logs for details.');
    } finally {
      setRunning(false);
    }
  };

  const handleSelect = async (mode: TrustMode) => {
    if (!state || state.trustMode === mode) return;
    setSavingMode(mode);
    setError(null);
    try {
      const next = await learningService.setTrustMode(mode);
      setState(next);
    } catch (err) {
      logger.error('Failed to set trust mode:', err);
      setError('Failed to update trust mode. Please try again.');
    } finally {
      setSavingMode(null);
    }
  };

  if (!isOrgAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Shield className="w-5 h-5" />
            Learning Trust Mode
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRun()}
              disabled={running}
              title="Run the full 6-pass engine for this org now (outside the nightly schedule)"
            >
              {running
                ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                : <PlayCircle className="w-3.5 h-3.5 mr-1" />}
              Run Engine Now
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Controls how aggressively the nightly engine applies its own clustered findings. Higher
          modes use the org's trust score to lower auto-action thresholds — the engine becomes more
          assertive as the org accepts more of its suggestions.
        </p>

        {runSummary && <EngineRunReport summary={runSummary} />}

        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {state && state.inInitialGrace && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Initial 30-day grace window in effect (ends {formatDate(state.initialGraceUntil)},{' '}
              {daysUntil(state.initialGraceUntil)} day(s) remaining). The engine stays in manual
              mode regardless of selection until then — new orgs need time to build a baseline.
            </span>
          </div>
        )}

        {loading && !state ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading trust state…</p>
        ) : state ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="p-3 rounded-lg border border-border bg-background">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Trust Score
                </p>
                <p className="mt-1 text-lg font-semibold">{formatScore(state.trustScore)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Threshold ×{state.thresholdMultiplier.toFixed(2)} ·{' '}
                  {state.trustScore < -5
                    ? 'conservative'
                    : state.trustScore > 15
                      ? 'trusting'
                      : 'neutral'}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-background">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Selected Mode
                </p>
                <p className="mt-1 text-lg font-semibold capitalize">{state.trustMode}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Since {formatDate(state.trustModeSetAt)}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-background">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Effective Mode
                </p>
                <p className="mt-1 text-lg font-semibold capitalize">{state.effectiveMode}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {state.effectiveMode === state.trustMode
                    ? 'Matches selection'
                    : 'Overridden by grace window'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const isSelected = state.trustMode === mode.id;
                const isSaving = savingMode === mode.id;
                const isDisabled = isSaving || (savingMode !== null && !isSaving);
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => void handleSelect(mode.id)}
                    disabled={isDisabled}
                    title={mode.hint}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/50'
                    } ${isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex gap-3 items-start">
                      <Icon
                        className={`w-5 h-5 mt-0.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-sm font-semibold">{mode.label}</p>
                          {isSelected && (
                            <span className="text-xs font-medium text-primary">Active</span>
                          )}
                          {isSaving && (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{mode.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground/80">{mode.hint}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};
