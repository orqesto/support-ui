import { useEffect, useState } from 'react';
import type { AlertState } from '@/components/settings/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { apiErrorMessage } from '@/lib/apiError';
import {
  integrationsService,
  type ImapCountResult,
  type MissingMessageSample,
} from '@/services/integrations.service';

/**
 * "What the mailbox holds vs what Odly has", matched by message id on the backend. Shared by
 * the Gmail count panel and the IMAP row's "Compare with Odly".
 *
 * The numbers are facts, not a verdict: a paused source before its first sync naturally has
 * nothing in Odly yet, so nothing here is phrased as an error.
 */
const fmt = (value: number) => value.toLocaleString('en-US');

/**
 * "In Odly: S · Missing: M[ · Can't verify: U]". Says "all in Odly" only when the comparison is
 * complete (not `capped`), nothing is missing AND nothing is unverifiable — an unverifiable
 * message is neither found nor missing, so "all" would be a claim nobody checked. One function
 * for both panels, so Gmail and IMAP say it the same way.
 */
export const formatInOdly = ({
  inOdly,
  missing,
  unverifiable = 0,
  capped = false,
}: {
  inOdly: number;
  missing: number;
  unverifiable?: number;
  capped?: boolean;
}): string => {
  const line = `In Odly: ${fmt(inOdly)} · Missing: ${fmt(missing)}`;
  if (unverifiable > 0) return `${line} · Can't verify: ${fmt(unverifiable)}`;
  return !capped && missing === 0 && inOdly > 0 ? `${line} — all in Odly` : line;
};

export const MissingSamples = ({ samples }: { samples: MissingMessageSample[] }) => {
  if (samples.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium">Not in Odly, for example:</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {samples.map((sample, idx) => (
          <li key={sample.id ?? idx} className="break-all">
            {[
              sample.date ?? 'no date',
              sample.from ?? 'unknown sender',
              sample.subject ?? '(no subject)',
            ].join(' · ')}
          </li>
        ))}
      </ul>
    </div>
  );
};

const windowLabel = (days: number) =>
  days === 0 ? 'all time' : `last ${fmt(days)} day${days === 1 ? '' : 's'}`;

/** One folder as the mailbox line shows it — never "Sent 0" for a folder that failed. */
/**
 * A failed Sent entry after a failed LIST (`sentKnown === null`) is the backend's stand-in for
 * "we could not tell whether there is a Sent folder" — it may not exist at all, so it is never
 * said to have failed to open.
 */
const isUnidentifiedSent = (
  folder: ImapCountResult['folders'][number],
  sentKnown: ImapCountResult['sentKnown']
) => folder.failed === true && folder.name !== 'INBOX' && sentKnown === null;

const folderLabel = (
  folder: ImapCountResult['folders'][number],
  sentKnown: ImapCountResult['sentKnown']
): string => {
  if (isUnidentifiedSent(folder, sentKnown)) return 'Sent folder: could not be identified';
  if (folder.failed) return `${folder.name}: could not be opened or searched`;
  if (folder.capped && folder.found !== undefined && folder.found > folder.count) {
    return `${folder.name} ${fmt(folder.count)} of ${fmt(folder.found)}`;
  }
  return `${folder.name} ${fmt(folder.count)}`;
};

/**
 * Why the comparison is partial, per cause — each a separate sentence, so one does not hide
 * another. A Sent folder the time budget never reached is absent from `folders`.
 */
const partialReasons = (result: ImapCountResult): string[] => {
  const reasons: string[] = [];
  if (result.folders.some((folder) => isUnidentifiedSent(folder, result.sentKnown))) {
    reasons.push('The Sent folder could not be identified, so it was not compared.');
  }
  const failed = result.folders
    .filter((folder) => folder.failed && !isUnidentifiedSent(folder, result.sentKnown))
    .map((folder) => folder.name);
  if (failed.length > 0) {
    reasons.push(
      `${failed.join(' and ')} could not be opened or searched, so nothing in it was compared.`
    );
  }
  if (result.timedOut) {
    const inboxCut = result.folders.some(
      (folder) => folder.name === 'INBOX' && folder.cappedBy === 'time'
    );
    if (inboxCut) reasons.push('INBOX was only partly read before the time limit.');
    const sentCut = result.folders
      .filter((folder) => folder.name !== 'INBOX' && folder.cappedBy === 'time')
      .map((folder) => folder.name);
    if (sentCut.length > 0) {
      reasons.push(`${sentCut.join(' and ')} was only partly read before the time limit.`);
    }
    if (result.folders.length < 2 && result.sentKnown === true) {
      reasons.push('The time limit was reached before the Sent folder.');
    } else if (result.folders.length < 2 && result.sentKnown === null) {
      reasons.push(
        'The Sent folder could not be identified before the time limit, so it was not compared.'
      );
    } else if (!inboxCut && sentCut.length === 0) {
      reasons.push('The comparison stopped on the time limit before every message was read.');
    }
  }
  // The backend's own reason per folder — never inferred from found > count, which a short
  // FETCH produces too. An older backend without `cappedBy` gets the generic line below.
  const by = (reason: string) =>
    result.folders.filter((folder) => folder.cappedBy === reason).map((folder) => folder.name);
  const sizeCapped = by('size');
  if (sizeCapped.length > 0) {
    reasons.push(
      `${sizeCapped.join(' and ')} matched more messages than one comparison reads; only the most recently added were checked.`
    );
  }
  const shortFetch = by('shortFetch');
  if (shortFetch.length > 0) {
    reasons.push(
      `The server returned fewer messages from ${shortFetch.join(' and ')} than its search found — they may have been moved or deleted meanwhile.`
    );
  }
  if (reasons.length === 0) {
    // An older backend without the per-cause fields.
    reasons.push(
      `Only the newest ${fmt(result.count)} messages listed were checked; the mailbox holds more.`
    );
  }
  return reasons;
};

export const ImapReconciliationResult = ({ result }: { result: ImapCountResult }) => {
  // Only a Sent folder the server said exists can be "not reached"; a mailbox without one has
  // nothing to reach (`sentKnown` false), and after a failed LIST nobody knows (null).
  const notReached =
    result.timedOut && result.folders.length < 2 && result.sentKnown === true
      ? ' · Sent: not reached (time limit)'
      : '';
  const folders =
    result.folders.map((folder) => folderLabel(folder, result.sentKnown)).join(' · ') + notReached;
  const maxFolder = Math.max(0, ...result.folders.map((folder) => folder.count));
  return (
    <div className="space-y-1">
      <p className="text-sm">
        Mailbox ({windowLabel(result.windowDays)}): {result.capped ? 'at least ' : ''}
        {fmt(result.count)} message{result.count === 1 ? '' : 's'}
        {folders && ` (${folders})`}
      </p>
      <p className="text-sm">{formatInOdly(result)}</p>
      {result.capped && (
        <p className="text-xs">Partial comparison: {partialReasons(result).join(' ')}</p>
      )}
      {result.unverifiable > 0 && (
        <p className="text-xs text-muted-foreground">
          Can&apos;t verify = messages with no usable Message-ID — none at all, or one in an encoded
          form the mailbox and the sync read differently — so they cannot be matched. They are not
          counted as missing.
        </p>
      )}
      {(result.count > result.perRunLimit || maxFolder > result.perRunLimit) && (
        <p className="text-xs text-muted-foreground">
          Each sync run reads at most {fmt(result.perRunLimit)} messages per folder, so a window
          this large takes several runs to import.
        </p>
      )}
      <MissingSamples samples={result.missingSamples} />
    </div>
  );
};

/** The IMAP row's inline block: runs the comparison on open, Close hides it. */
export const ImapCompareReview = ({
  sourceId,
  onClose,
  onShowAlert,
}: {
  sourceId: number;
  onClose: () => void;
  onShowAlert: (alert: AlertState) => void;
}) => {
  const [result, setResult] = useState<ImapCountResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      setResult(await integrationsService.countImapMessages(sourceId));
    } catch (err) {
      onShowAlert({
        open: true,
        title: 'Could not compare with Odly',
        description: apiErrorMessage(err, 'Failed to compare this mailbox with Odly'),
        variant: 'error',
      });
    } finally {
      setRunning(false);
    }
  };

  // Opening the block IS the request to compare — no second click.
  useEffect(() => {
    void run();
    // Once per opened source; later runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  return (
    <div className="p-4 mt-2 space-y-3 rounded-lg border bg-muted/50">
      <div>
        <h4 className="font-medium">Compare with Odly</h4>
        <p className="text-xs text-muted-foreground">
          Counts the messages in this mailbox&apos;s sync window and checks which are already in
          Odly, by Message-ID. A big mailbox can take up to a minute.
        </p>
      </div>
      {result && (
        <Alert variant="success" className="p-3">
          <ImapReconciliationResult result={result} />
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={running} onClick={() => void run()}>
          {running ? 'Comparing…' : result ? 'Compare again' : 'Compare now'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};
