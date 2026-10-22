/**
 * One automatic action: Off / Shadow / Automatic, its bar (scored actions), how many entries it
 * would act on, how often it agreed with people, whether Automatic is allowed yet, and a sample to
 * rate. Saving sends only this action. The gate is the backend's: Automatic is disabled while it
 * is not met (a platform admin may override), and a 409 from a save shows the same line.
 */
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import {
  kbAutoActionsService,
  type KbAutoActionKey,
  type KbAutoActionOverview,
  type KbAutoGateRefusal,
  type KbAutoRemoveMode,
} from '@/services/kbAutoActions.service';
import { ACTION_LABELS, backlogBlockedLine, blockedByLine, gateLine } from './kbAutoActionCopy';
import { KbAutoSampleReview } from './KbAutoSampleReview';

const MODE_HELP: Record<KbAutoRemoveMode, string> = {
  off: 'Does nothing.',
  shadow: 'Shows what it would do, and changes nothing.',
  auto: 'Acts on its own from the next run.',
};

/**
 * approveCaptures does not wait for a run: switching it on approves the answers already waiting
 * (bounded per run; the rest follow), and each new saved answer is approved as soon as it is checked.
 */
const CAPTURES_AUTO_HELP =
  'Right away, approves the waiting answers that pass — a limited number per run, the rest follow — and each new saved answer as soon as it is checked. Every approval is listed under Changed automatically, where you can send it back for review.';

const SEND_BACK =
  'Every approval is listed under Changed automatically, where you can send it back for review.';

/**
 * Lowering the bar while Automatic starts no run: newly passing answers wait for their next check.
 * Answers saved earlier are checked only by the nightly run, so while that is blocked
 * (`backlogBlockedBy`) the text must not promise tonight.
 */
const capturesLowerBar = (backlogBlocked: boolean): string =>
  backlogBlocked
    ? `Answers that now pass the lower bar are approved at their next check — for answers saved earlier, only once the nightly check is switched on (see the notice above). ${SEND_BACK}`
    : `Answers that now pass the lower bar are approved at their next check — tonight at the latest. ${SEND_BACK}`;

const modeHelp = (action: KbAutoActionKey, mode: KbAutoRemoveMode): string =>
  action === 'approveCaptures' && mode === 'auto' ? CAPTURES_AUTO_HELP : MODE_HELP[mode];

const entries = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`;

type Props = {
  action: KbAutoActionKey;
  state: KbAutoActionOverview;
  canEdit: boolean;
  /** A platform admin may switch Automatic on before the gate is met. */
  canOverrideGate: boolean;
  /** What the action would act on at a bar (percent), when the page can tell without a refetch. */
  wouldActAt?: (percent: number) => number;
  /** Re-read the overview. */
  onChanged: () => void;
};

export const KbAutoActionRow = ({
  action,
  state,
  canEdit,
  canOverrideGate,
  wouldActAt,
  onChanged,
}: Props) => {
  const label = ACTION_LABELS[action];
  const scored = state.threshold !== null;
  const savedPercent = Math.round((state.threshold ?? 0) * 100);
  const [mode, setMode] = useState<KbAutoRemoveMode>(state.mode);
  const [percent, setPercent] = useState(savedPercent);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<KbAutoGateRefusal | null>(null);
  // The save that switched approveCaptures on started a run over the answers already waiting.
  // Only a backend that says so (`startedRuns`) shows the line; it stays until the next save.
  const [applyingNow, setApplyingNow] = useState(false);

  // A fresh overview (after a save, or a rating) resets the draft to what is saved.
  useEffect(() => {
    setMode(state.mode);
    setPercent(savedPercent);
    setRefusal(null);
  }, [state]);

  const dirty = mode !== state.mode || (scored && percent !== savedPercent);
  const wouldAct = wouldActAt ? wouldActAt(percent) : state.wouldAct;
  // Without a per-percent preview the count is the server's, at the SAVED bar: say so while the
  // slider shows an unsaved value, so the number is not read as belonging to it.
  const atSavedBar = !wouldActAt && scored && percent !== savedPercent;
  const locked = !state.gate.allowed && !canOverrideGate && state.mode !== 'auto';
  const showGate = refusal !== null || (state.mode !== 'auto' && !state.gate.allowed);
  const blocked = blockedByLine(state.blockedBy);
  const backlogBlocked = backlogBlockedLine(state.backlogBlockedBy);

  const segments: Segment<KbAutoRemoveMode>[] = [
    { value: 'off', label: 'Off' },
    { value: 'shadow', label: 'Shadow' },
    { value: 'auto', label: 'Automatic', disabled: locked },
  ];

  const save = async () => {
    setConfirming(false);
    setApplyingNow(false);
    setSaving(true);
    setRefusal(null);
    try {
      const result = await kbAutoActionsService.patchSettings({
        [action]: scored ? { mode, threshold: percent / 100 } : { mode },
      });
      setApplyingNow(action === 'approveCaptures' && result.startedRuns?.[action] === true);
      toast.success('Saved');
      onChanged();
    } catch (err) {
      const refused = kbAutoActionsService.gateRefusal(err);
      if (refused) {
        setRefusal(refused);
        setMode(state.mode);
        setPercent(savedPercent);
      } else
        toast.error('Could not save', { description: apiErrorMessage(err, 'Please try again.') });
    } finally {
      setSaving(false);
    }
  };

  // Asks before anything that acts on MORE than the saved setting: turning Automatic on, or
  // lowering the bar while it is already on.
  const turningOn = mode === 'auto' && state.mode !== 'auto';
  const loweringBar = mode === 'auto' && state.mode === 'auto' && scored && percent < savedPercent;
  const onSave = () => {
    if (turningOn || loweringBar) setConfirming(true);
    else void save();
  };

  const band = state.agreement.atThreshold;
  const agreementLine =
    band && band.total > 0
      ? `At ${savedPercent}% or more, people agreed ${band.agreed} of ${band.total}${band.rate === null ? '' : ` (${Math.round(band.rate * 100)}%)`}.`
      : state.agreement.decided > 0
        ? `People agreed ${state.agreement.agreed} of ${state.agreement.decided}${state.agreement.rate === null ? '' : ` (${Math.round(state.agreement.rate * 100)}%)`}.`
        : 'No ratings yet.';

  return (
    <li data-testid={`kb-auto-row-${action}`} aria-label={label}>
      <Card>
        <CardContent className="pt-4 space-y-3 text-sm">
          <p className="font-medium">{label}</p>
          {blocked && (
            <Alert variant="warning">
              <AlertDescription>{blocked}</AlertDescription>
            </Alert>
          )}
          {backlogBlocked && (
            <Alert variant="info">
              <AlertDescription>{backlogBlocked}</AlertDescription>
            </Alert>
          )}
          <SegmentedControl
            ariaLabel={`Mode: ${label}`}
            value={mode}
            onChange={(next) => {
              if (canEdit) setMode(next);
            }}
            segments={canEdit ? segments : segments.filter((seg) => seg.value === mode)}
          />
          <p className="text-muted-foreground">{modeHelp(action, mode)}</p>
          {showGate && (
            <p className="text-muted-foreground">
              {gateLine(refusal ?? state.gate)}
              {canOverrideGate && !state.gate.allowed
                ? ' You can override this as a platform admin.'
                : ''}
            </p>
          )}
          {scored && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Act when at least this sure</span>
                <span className="font-medium">{percent}%</span>
              </div>
              <BarSlider
                min={50}
                max={100}
                step={1}
                value={percent}
                onChange={setPercent}
                disabled={!canEdit}
                ariaLabel={`${label} bar, % sure`}
                ariaValueText={`${percent}% sure`}
              />
            </div>
          )}
          <p>
            <span aria-live="polite">
              Would act on {wouldAct}{' '}
              {action === 'remove'
                ? wouldAct === 1
                  ? 'entry'
                  : 'entries'
                : wouldAct === 1
                  ? 'answer'
                  : 'answers'}
              {atSavedBar ? ' at the saved bar' : ''}
            </span>
          </p>
          {applyingNow && <p role="status">Approving the waiting answers now.</p>}
          <p className="text-muted-foreground">{agreementLine}</p>
          {canEdit ? (
            <Button size="sm" onClick={onSave} disabled={!dirty || saving} isLoading={saving}>
              Save
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only workspace admins can change this setting.
            </p>
          )}
          <KbAutoSampleReview action={action} onDone={onChanged} />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void save()}
        variant="warning"
        title={turningOn ? 'Switch on this automatic action?' : 'Lower the bar?'}
        description={
          action === 'remove'
            ? `At ${percent}% the next run removes ${entries(wouldAct)} now. Entries a person approved are never removed, and every removed entry can be restored for 90 days.`
            : action === 'approveCaptures'
              ? loweringBar
                ? capturesLowerBar(backlogBlocked !== null)
                : CAPTURES_AUTO_HELP
              : `"${label}" acts on its own from the next run. Everything it changes is listed under Changed automatically in the Knowledge Base, with an undo.`
        }
        confirmText={turningOn ? 'Turn on' : 'Lower the bar'}
      />
    </li>
  );
};
