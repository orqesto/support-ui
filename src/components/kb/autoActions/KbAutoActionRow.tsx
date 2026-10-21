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
import { ACTION_LABELS, blockedByLine, gateLine } from './kbAutoActionCopy';
import { KbAutoSampleReview } from './KbAutoSampleReview';

const MODE_HELP: Record<KbAutoRemoveMode, string> = {
  off: 'Does nothing.',
  shadow: 'Shows what it would do, and changes nothing.',
  auto: 'Acts on its own from the next run.',
};

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

  // A fresh overview (after a save, or a rating) resets the draft to what is saved.
  useEffect(() => {
    setMode(state.mode);
    setPercent(savedPercent);
  }, [state.mode, savedPercent]);

  const dirty = mode !== state.mode || (scored && percent !== savedPercent);
  const wouldAct = wouldActAt ? wouldActAt(percent) : state.wouldAct;
  const locked = !state.gate.allowed && !canOverrideGate && state.mode !== 'auto';
  const showGate = state.mode !== 'auto' && (refusal !== null || !state.gate.allowed);
  const blocked = blockedByLine(state.blockedBy);

  const segments: Segment<KbAutoRemoveMode>[] = [
    { value: 'off', label: 'Off' },
    { value: 'shadow', label: 'Shadow' },
    { value: 'auto', label: 'Automatic', disabled: locked },
  ];

  const save = async () => {
    setConfirming(false);
    setSaving(true);
    setRefusal(null);
    try {
      await kbAutoActionsService.patchSettings({
        [action]: scored ? { mode, threshold: percent / 100 } : { mode },
      });
      toast.success('Saved');
      onChanged();
    } catch (err) {
      const refused = kbAutoActionsService.gateRefusal(err);
      if (refused) setRefusal(refused);
      else
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
          <SegmentedControl
            ariaLabel={`Mode: ${label}`}
            value={mode}
            onChange={(next) => {
              if (canEdit) setMode(next);
            }}
            segments={canEdit ? segments : segments.filter((seg) => seg.value === mode)}
          />
          <p className="text-muted-foreground">{MODE_HELP[mode]}</p>
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
            <span aria-live="polite">Would act on {wouldAct}</span>
            {action === 'remove' ? ` ${wouldAct === 1 ? 'entry' : 'entries'}` : ''}
          </p>
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
            : `"${label}" acts on its own from the next run. Everything it changes is listed under Changed automatically in the Knowledge Base, with an undo.`
        }
        confirmText={turningOn ? 'Turn on' : 'Lower the bar'}
      />
    </li>
  );
};
