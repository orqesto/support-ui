/**
 * "Check a sample": a person rates the system's removal suggestions one at a time, so the page
 * can say how often the system agreed with people before anyone trusts its % for real.
 *
 * Agree = remove the entry now (the quality review's accept with `reject`); Disagree = keep it
 * (decline the suggestion); Skip = no decision. Both decisions go through the existing KB quality
 * service, the same calls the review list makes.
 *
 * A decision that finds the suggestion gone — the accept answers `expired` (the entry changed since
 * it was scored), or either call answers 409 (decided elsewhere meanwhile) — is NOT a person's
 * verdict on it: counted as "changed since — skipped", never as agreed or disagreed.
 *
 * With `action` (a backend with the one-page release) the sample is RATING ONLY (owner decision D4):
 * Agree / Disagree record a rating of what that action did or would do and change nothing on the
 * entry; deciding the entry itself happens in the Knowledge Base.
 */
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import { qualityReasonLabel } from '@/lib/kbQuality';
import { toast } from '@/lib/toast';
import {
  kbAutoActionsService,
  type KbAutoActionKey,
  type KbAutoSampleItem,
} from '@/services/kbAutoActions.service';
import { kbQualityService } from '@/services/kbQuality.service';
import { formatPercent, preview } from './kbAutoFormat';

type Props = {
  /** Rate what this action did or would do. Without it: the older remove-only sample. */
  action?: KbAutoActionKey;
  /** Called once the person closes the sample, so the overview's agreement is re-read. */
  onDone: () => void;
};

type Tally = { agreed: number; disagreed: number; skipped: number; changed: number };
const RATING_HELP =
  'Your rating only teaches the %; decide the entry itself in the Knowledge Base.';
const EMPTY_TALLY: Tally = { agreed: 0, disagreed: 0, skipped: 0, changed: 0 };

export const KbAutoSampleReview = ({ action, onDone }: Props) => {
  const [items, setItems] = useState<KbAutoSampleItem[] | null>(null);
  const [poolLimited, setPoolLimited] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const sample = await kbAutoActionsService.getSample(30, action);
      setItems(sample.items);
      setPoolLimited(sample.poolLimited);
      setIndex(0);
      setTally(EMPTY_TALLY);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load a sample.'));
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setItems(null);
    onDone();
  };

  const decide = async (item: KbAutoSampleItem, verdict: 'agree' | 'disagree') => {
    setBusy(true);
    const changedSince = () => {
      toast.info('Changed since — skipped', {
        description: 'The entry changed or was decided elsewhere since it was scored.',
      });
      setTally((prev) => ({ ...prev, changed: prev.changed + 1 }));
      setIndex((prev) => prev + 1);
    };
    try {
      if (action) {
        await kbAutoActionsService.rate(action, item.entryId, verdict === 'agree');
      } else if (item.suggestionId === null) {
        changedSince();
        return;
      } else if (verdict === 'agree') {
        const result = await kbQualityService.accept(item.suggestionId, { action: 'reject' });
        if (result.status === 'expired') {
          changedSince();
          return;
        }
      } else {
        await kbQualityService.keep(item.suggestionId);
      }
      setTally((prev) =>
        verdict === 'agree'
          ? { ...prev, agreed: prev.agreed + 1 }
          : { ...prev, disagreed: prev.disagreed + 1 }
      );
      setIndex((prev) => prev + 1);
    } catch (err) {
      const status = apiErrorStatus(err);
      if (status === 409 || (action && (status === 400 || status === 404))) changedSince();
      else
        toast.error('Could not save your decision', {
          description: apiErrorMessage(err, 'Please try again.'),
        });
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    setTally((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
    setIndex((prev) => prev + 1);
  };

  if (items === null) {
    return (
      <div className="space-y-2">
        {action ? (
          <p className="text-sm text-muted-foreground">
            Rate a few of the things this action did or would do. Your answers are how this page
            knows whether to trust it.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Rate a few of the system&apos;s removal suggestions. Agree removes the entry now;
            Disagree keeps it. Your answers are how this page knows whether to trust the %.
          </p>
        )}
        {error && (
          <Alert variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button variant="outline" size="sm" onClick={start} isLoading={loading}>
          Check a sample
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <Alert variant="info">
          <AlertDescription>
            {action
              ? 'There is nothing to rate right now for this action.'
              : 'There is nothing to check right now: no scored removal suggestions are waiting.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={close}>
          Close
        </Button>
      </div>
    );
  }

  const item = index < items.length ? items[index] : null;
  if (!item) {
    return (
      <div className="space-y-2">
        <Alert variant="success">
          <AlertDescription>
            {`Done: ${tally.agreed} agreed${action ? '' : ' (removed)'}, ${tally.disagreed} disagreed${action ? '' : ' (kept)'}, ${tally.skipped} skipped${tally.changed > 0 ? `, ${tally.changed} changed since — skipped` : ''}.`}
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={close}>
          Close and update the numbers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span aria-live="polite">
          {index + 1} of {items.length}
        </span>
        <Button variant="ghost" size="sm" onClick={close}>
          Stop
        </Button>
      </div>
      <Progress value={(index / items.length) * 100} size="sm" />
      {poolLimited && (
        <p className="text-xs text-muted-foreground">
          Fewer suggestions are waiting than a full sample, so this is all of them.
        </p>
      )}
      {action && <p className="text-xs text-muted-foreground">{RATING_HELP}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Badge variant="secondary">{item.subject === 'document' ? 'Document' : 'Q&A'}</Badge>
            {item.confidence !== null && (
              <Badge variant="warning">{formatPercent(item.confidence)} sure</Badge>
            )}
            {item.reasons.map((reason) => (
              <Badge key={reason} variant="default">
                {qualityReasonLabel(reason)}
              </Badge>
            ))}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium whitespace-pre-wrap">{preview(item.question, 400)}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{preview(item.answer, 600)}</p>
          {item.note && <p className="text-xs italic text-muted-foreground">{item.note}</p>}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {busy && <Spinner />}
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={() => decide(item, 'agree')}
        >
          {action ? 'Agree' : 'Agree (remove)'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => decide(item, 'disagree')}
        >
          {action ? 'Disagree' : 'Disagree (keep)'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={skip}>
          Skip
        </Button>
      </div>
    </div>
  );
};
