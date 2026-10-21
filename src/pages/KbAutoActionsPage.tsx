/**
 * Knowledge base → Automatic actions (step 1: automatic removal).
 *
 * The quality review scores each "remove this entry" suggestion 0–100% sure. This page sets what
 * happens with them per workspace — Off, Shadow (show what WOULD be removed, act on nothing) or
 * Automatic (each night remove everything at or above the bar, with Restore) — and shows the
 * evidence for trusting the bar: how many entries it would take, and how often the system agreed
 * with people at that %. Entries a person approved are never removed automatically.
 *
 * The preview and the agreement follow the slider without a refetch: the overview carries counts
 * per whole percent (`removableByPercent`, `agreement.byPercent`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KbAutoRemovedList } from '@/components/kb/autoActions/KbAutoRemovedList';
import { KbAutoSampleReview } from '@/components/kb/autoActions/KbAutoSampleReview';
import { formatWhen } from '@/components/kb/autoActions/kbAutoFormat';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage, isRouteAbsent } from '@/lib/apiError';
import { qualityReasonLabel } from '@/lib/kbQuality';
import { toast } from '@/lib/toast';
import {
  agreementAt,
  candidateBands,
  kbAutoActionsService,
  wouldRemoveAt,
  type KbAutoActionsOverview,
  type KbAutoRemoveMode,
} from '@/services/kbAutoActions.service';
import { Permission } from '@/types/roles';

/** Below this many decisions at the bar, the agreement rate is not worth reading yet. */
export const MIN_DECISIONS = 20;

const MODE_SEGMENTS: Segment<KbAutoRemoveMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'auto', label: 'Automatic' },
];

const MODE_HELP: Record<KbAutoRemoveMode, string> = {
  off: 'Nothing is scored or removed automatically; suggestions wait in the review list. Scores start the night you choose Shadow or Automatic.',
  shadow:
    'Shadow shows what would be removed at your % without removing anything, so you can judge it first.',
  auto: 'Each night, every entry at or above your % is removed (hidden, with Restore for 90 days).',
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">{children}</CardContent>
  </Card>
);

export const KbAutoActionsPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(Permission.MANAGE_ORGANIZATION);

  const [overview, setOverview] = useState<KbAutoActionsOverview | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<KbAutoRemoveMode>('off');
  const [percent, setPercent] = useState(90);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (resetDraft: boolean) => {
    setLoadError(null);
    try {
      const next = await kbAutoActionsService.getOverview();
      setOverview(next);
      if (resetDraft) {
        setMode(next.settings.remove.mode);
        setPercent(Math.round(next.settings.remove.threshold * 100));
      }
    } catch (err) {
      setLoadError(err);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    void load(false);
  }, [load]);

  const removeCount = useMemo(
    () => (overview ? wouldRemoveAt(overview.candidates.removableByPercent, percent) : 0),
    [overview, percent]
  );
  const agreement = useMemo(
    () => (overview ? agreementAt(overview.agreement.byPercent, percent) : null),
    [overview, percent]
  );

  if (loadError && isRouteAbsent(loadError)) {
    return (
      <Layout>
        <div className="px-4 mx-auto w-full max-w-4xl space-y-4">
          <PageHeader title="Automatic actions" />
          <Alert variant="info">
            <AlertDescription>
              Automatic actions for the knowledge base arrive with the next backend release.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  const saved = overview?.settings.remove;
  const dirty = !!saved && (saved.mode !== mode || Math.round(saved.threshold * 100) !== percent);

  const save = async () => {
    setConfirming(false);
    setSaving(true);
    try {
      const result = await kbAutoActionsService.saveSettings({
        remove: { mode, threshold: percent / 100 },
      });
      toast.success('Saved', {
        description: result.startedRun
          ? 'A run has started; this page updates when you reload it.'
          : undefined,
      });
      setMode(result.settings.remove.mode);
      setPercent(Math.round(result.settings.remove.threshold * 100));
      refresh();
    } catch (err) {
      toast.error('Could not save', { description: apiErrorMessage(err, 'Please try again.') });
    } finally {
      setSaving(false);
    }
  };

  // Asks before anything that removes MORE than the saved setting: turning Automatic on, or
  // lowering the bar while it is already on.
  const turningOn = mode === 'auto' && saved?.mode !== 'auto';
  const loweringBar =
    mode === 'auto' && saved?.mode === 'auto' && percent < Math.round(saved.threshold * 100);
  const onSave = () => {
    if (turningOn || loweringBar) setConfirming(true);
    else void save();
  };

  const candidates = overview?.candidates;
  const unscored = candidates?.byBand.unscored ?? 0;
  const bandRows = overview ? candidateBands(overview) : [];
  const bandMax = Math.max(1, ...bandRows.map((row) => row.count));
  const lastRun = overview?.autoRemoved.lastRun ?? null;

  return (
    <Layout>
      <div className="px-4 mx-auto w-full max-w-4xl space-y-4">
        <PageHeader
          title="Automatic actions"
          description="Let the knowledge base remove entries the quality review is sure about."
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate('/knowledge-base')}>
              Back to knowledge base
            </Button>
          }
        />

        {loadError !== null && (
          <Alert variant="danger">
            <AlertDescription>
              {apiErrorMessage(loadError, 'Could not load automatic actions.')}{' '}
              <Button variant="ghost" size="sm" onClick={() => void load(true)}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!overview && loadError === null && (
          <div className="flex justify-center py-12" role="status" aria-busy="true">
            <Spinner />
          </div>
        )}

        {overview && candidates && (
          <>
            <p className="text-sm text-muted-foreground" data-testid="kb-auto-status">
              {lastRun
                ? `Last automatic run: ${formatWhen(lastRun.at)} — removed ${plural(lastRun.removed, 'entry', 'entries')}${lastRun.capped ? ' (stopped at the per-night limit; the rest go next night)' : ''}.`
                : 'No automatic run yet.'}{' '}
              {plural(overview.autoRemoved.last90Days, 'entry', 'entries')} removed automatically in
              the last 90 days.
            </p>

            <Section title="Setting">
              <SegmentedControl
                ariaLabel="Automatic removal"
                value={mode}
                onChange={(next) => {
                  if (canEdit) setMode(next);
                }}
                segments={
                  canEdit ? MODE_SEGMENTS : MODE_SEGMENTS.filter((seg) => seg.value === mode)
                }
              />
              <p className="text-muted-foreground">{MODE_HELP[mode]}</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Remove when at least this sure</span>
                  <span className="font-medium">{percent}%</span>
                </div>
                <BarSlider
                  min={50}
                  max={100}
                  step={1}
                  value={percent}
                  onChange={setPercent}
                  disabled={!canEdit}
                  ariaLabel="Removal bar, % sure"
                  ariaValueText={`${percent}% sure`}
                />
              </div>
              {canEdit ? (
                <Button size="sm" onClick={onSave} disabled={!dirty || saving} isLoading={saving}>
                  Save
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only workspace admins can change this setting.
                </p>
              )}
            </Section>

            <Section title="Preview">
              <p className="text-base" aria-live="polite">
                At {percent}% it would remove{' '}
                <strong>{plural(removeCount, 'entry', 'entries')}</strong>
                {mode === 'shadow' ? ' (Shadow: nothing is actually removed)' : ''}.
              </p>
              <p>
                {plural(candidates.total, 'removal suggestion is', 'removal suggestions are')}{' '}
                waiting in all: {candidates.bySubject.qa} Q&amp;A,{' '}
                {plural(candidates.bySubject.document, 'document', 'documents')}.
              </p>
              {Object.keys(candidates.byReason).length > 0 && (
                <ul className="list-disc pl-5">
                  {Object.entries(candidates.byReason)
                    .sort((left, right) => right[1] - left[1])
                    .map(([reason, count]) => (
                      <li key={reason}>
                        {qualityReasonLabel(reason)}: {count}
                      </li>
                    ))}
                </ul>
              )}
              {candidates.personApprovedAtThreshold > 0 && (
                <p>
                  {plural(candidates.personApprovedAtThreshold, 'entry', 'entries')} a person
                  approved {candidates.personApprovedAtThreshold === 1 ? 'is' : 'are'} above the
                  saved bar but never removed automatically.
                </p>
              )}
              {candidates.openReviewAtThreshold > 0 && (
                <p>
                  {plural(candidates.openReviewAtThreshold, 'entry', 'entries')} above the saved bar{' '}
                  {candidates.openReviewAtThreshold === 1 ? 'waits' : 'wait'} for a person&rsquo;s
                  review of a saved answer and{' '}
                  {candidates.openReviewAtThreshold === 1 ? 'is' : 'are'} not removed automatically.
                </p>
              )}
              {candidates.total > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">By how sure the review is</p>
                  <ul className="space-y-1" aria-label="Candidates by confidence">
                    {bandRows.map((row) => (
                      <li
                        key={row.key}
                        className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2"
                      >
                        <span className="text-muted-foreground">{row.label}</span>
                        <Progress value={(row.count / bandMax) * 100} size="sm" />
                        <span className="text-right tabular-nums">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {unscored > 0 && (
                <p className="text-muted-foreground">
                  {plural(unscored, 'suggestion has', 'suggestions have')} no score yet; they get
                  one over the next nights.
                </p>
              )}
            </Section>

            <Section title="Agreement with people">
              {agreement && agreement.total > 0 && (
                <p>
                  Of the scored entries people decided, at ≥ {percent}% it agreed{' '}
                  <strong>
                    {agreement.agreed} of {agreement.total}
                  </strong>
                  {agreement.rate !== null ? ` (${Math.round(agreement.rate * 100)}%)` : ''}.
                </p>
              )}
              {(!agreement || agreement.total < MIN_DECISIONS) && (
                <Alert variant="warning">
                  <AlertDescription>
                    Not enough decisions yet — check a sample before trusting this %.
                  </AlertDescription>
                </Alert>
              )}
              <KbAutoSampleReview onDone={refresh} />
            </Section>

            <Section title="Removed automatically">
              <p className="text-muted-foreground">
                Removed entries are hidden and deleted for good after 90 days unless restored.
              </p>
              <KbAutoRemovedList refreshKey={refreshKey} onRestored={() => void load(false)} />
            </Section>
          </>
        )}

        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={() => void save()}
          variant="warning"
          title={turningOn ? 'Turn on automatic removal?' : 'Lower the automatic removal bar?'}
          description={`At ${percent}% the next run removes ${plural(removeCount, 'entry', 'entries')} now. Entries a person approved are never removed, and every removed entry can be restored for 90 days.`}
          confirmText={turningOn ? 'Turn on' : 'Lower the bar'}
        />
      </div>
    </Layout>
  );
};
