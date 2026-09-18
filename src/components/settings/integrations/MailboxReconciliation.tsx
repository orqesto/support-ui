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

/** "In Odly: S · Missing: M", or "all in Odly" when nothing is missing. */
export const formatInOdly = ({ inOdly, missing }: { inOdly: number; missing: number }): string =>
  missing === 0 && inOdly > 0
    ? `In Odly: ${fmt(inOdly)} · Missing: 0 — all in Odly`
    : `In Odly: ${fmt(inOdly)} · Missing: ${fmt(missing)}`;

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

export const ImapReconciliationResult = ({ result }: { result: ImapCountResult }) => {
  const folders = result.folders.map((folder) => `${folder.name} ${fmt(folder.count)}`).join(' · ');
  const maxFolder = Math.max(0, ...result.folders.map((folder) => folder.count));
  return (
    <div className="space-y-1">
      <p className="text-sm">
        Mailbox ({windowLabel(result.windowDays)}): {result.capped ? 'at least ' : ''}
        {fmt(result.count)} message{result.count === 1 ? '' : 's'}
        {folders && ` (${folders})`}
      </p>
      <p className="text-sm">
        {result.capped
          ? `In Odly: ${fmt(result.inOdly)} · Missing: ${fmt(result.missing)}`
          : formatInOdly(result)}
        {result.unverifiable > 0 && ` · Can't verify: ${fmt(result.unverifiable)}`}
      </p>
      {result.capped && (
        <p className="text-xs">
          Partial comparison: only the newest {fmt(result.count)} messages listed were checked; the
          mailbox holds more.
        </p>
      )}
      {result.unverifiable > 0 && (
        <p className="text-xs text-muted-foreground">
          Can&apos;t verify = messages without a Message-ID header, so they cannot be matched. They
          are not counted as missing.
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
