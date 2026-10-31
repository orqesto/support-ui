import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { logger } from '@/lib/logger';
import {
  KB_AUTO_ACTION_KEYS,
  kbAutoActionsService,
  type KbAutoActionKey,
  type KbAutoActionOverview,
} from '@/services/kbAutoActions.service';
import { ACTION_LABELS } from '../autoActions/kbAutoActionCopy';
import { KbAutoSampleReview } from '../autoActions/KbAutoSampleReview';
import { GATE_PERCENT, GATE_RATED, GATE_TEXT } from './kbActivityCopy';

/**
 * How many ratings count toward the gate so far. The server measures a scored action at or above
 * its bar, an unscored one over everything rated; `needRated` is what is still missing of 20.
 */
export const ratedTowardGate = (overview: KbAutoActionOverview): number => {
  if (overview.gate.needRated > 0) return Math.max(0, GATE_RATED - overview.gate.needRated);
  const measured =
    overview.threshold !== null
      ? (overview.agreement.atThreshold?.total ?? null)
      : overview.agreement.decided;
  return measured ?? GATE_RATED;
};

/** "14 of 20 rated · 93% agree (needs 90%)". */
export const gateProgressText = (overview: KbAutoActionOverview): string => {
  const rated = ratedTowardGate(overview);
  const agree =
    overview.gate.rate === null
      ? 'no ratings yet'
      : `${Math.round(overview.gate.rate * 100)}% agree`;
  return `${Math.min(rated, GATE_RATED)} of ${GATE_RATED} rated · ${agree} (needs ${GATE_PERCENT}%)`;
};

const ActionRating = ({
  action,
  overview,
  onRated,
}: {
  action: KbAutoActionKey;
  overview: KbAutoActionOverview;
  onRated: () => void;
}) => {
  const [rating, setRating] = useState(false);
  const rated = Math.min(ratedTowardGate(overview), GATE_RATED);
  return (
    <li className="space-y-2" data-testid="kb-rate-action" data-action={action}>
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm font-medium text-foreground">
          {ACTION_LABELS[action]}
          {overview.mode === 'auto' && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (runs automatically)
            </span>
          )}
        </p>
        {!rating && (
          <Button variant="outline" size="sm" onClick={() => setRating(true)}>
            Rate a sample
          </Button>
        )}
      </div>
      <Progress
        value={rated}
        max={GATE_RATED}
        size="sm"
        aria-label={`Ratings toward the gate: ${ACTION_LABELS[action]}`}
      />
      <p className="text-xs text-muted-foreground">{gateProgressText(overview)}</p>
      {rating && (
        <KbAutoSampleReview
          action={action}
          onDone={() => {
            setRating(false);
            onRated();
          }}
        />
      )}
    </li>
  );
};

/**
 * Rate the engine: per automatic action, a sample of what it did or would do (the Automatic
 * actions page's own sample and ratings flow, `KbAutoSampleReview`), with progress to the gate.
 * The shadow results live only here, never as marks on list rows.
 */
export const KbRateEngine = () => {
  const [actions, setActions] = useState<Partial<
    Record<KbAutoActionKey, KbAutoActionOverview>
  > | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(() => {
    setFailed(false);
    kbAutoActionsService.getOverview().then(
      (overview) => setActions(overview.actions ?? {}),
      (error: unknown) => {
        logger.error('Failed to read the automatic actions overview:', error);
        setFailed(true);
        setActions({});
      }
    );
  }, []);

  useEffect(() => {
    read();
  }, [read]);

  const listed = KB_AUTO_ACTION_KEYS.filter((key) => actions?.[key]);

  return (
    <section
      className="p-3 space-y-3 rounded-lg border bg-background"
      aria-label="Rate the engine"
      data-testid="kb-rate-engine"
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">Rate the engine</h3>
        <p className="text-xs text-muted-foreground">
          See what the engine did or would do, and say if it was right. Rating changes nothing on
          the entry. {GATE_TEXT}
        </p>
      </div>
      {actions === null ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : failed ? (
        <Alert variant="warning" className="py-2 text-sm">
          Could not read the ratings.{' '}
          <Button variant="ghost" size="sm" onClick={read}>
            Retry
          </Button>
        </Alert>
      ) : listed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to rate on this server yet.</p>
      ) : (
        <ul className="space-y-4">
          {listed.map((key) => (
            <ActionRating key={key} action={key} overview={actions[key]!} onRated={read} />
          ))}
        </ul>
      )}
    </section>
  );
};
