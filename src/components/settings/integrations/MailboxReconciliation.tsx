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

/** The IMAP form's read-state filter, as a person would say it. */
const criteriaLabel = (criteria: string): string =>
  ({ UNSEEN: 'unread', SEEN: 'read', FLAGGED: 'flagged', UNANSWERED: 'unanswered' })[criteria] ??
  criteria.toLowerCase();

const windowLabel = (days: number) =>
  days === 0 ? 'all time' : `last ${fmt(days)} day${days === 1 ? '' : 's'}`;

type KbHistoryCount = {
  count: number;
  capped: boolean;
  from: string | null;
  to: string;
  /** Gmail: day-granular, may include up to a day after the cutoff. */
  approximate?: boolean;
  /** The history sweep has not run yet — the next poll reads this history for the KB. */
  sweepOwed?: boolean;
  /** A KB source with no cutoff: mining is off. */
  miningOff?: boolean;
};

const kbDay = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Of what was counted, how much is knowledge-base HISTORY — mail from before the KB cutoff, the
 * only part mined for Q&A pairs. Everything after the cutoff is imported as regular work. Owner,
 * 2026-10-05: the caption used to say "everything counted here will also be mined", which was
 * false for every message after the cutoff — on taco's DeusPower, for all 2,597 of them.
 */
export const kbHistoryNote = (history: KbHistoryCount): string => {
  // ⛔ True in every state the backend reports (audit passes 1–2): an approximate Gmail number is
  // never an "at least"; once the history sweep has run it is not read again; and with no cutoff
  // nothing is mined YET — but any save of the mailbox (Start sync included) sets one, then.
  const to = kbDay(history.to);
  // Said once: "(9 Sep – 16 Sep, before the cutoff)" or "(everything before the cutoff, 16 Sep)".
  const span = history.from
    ? `${kbDay(history.from)} – ${to}, before the cutoff`
    : `everything before the cutoff, ${to}`;
  const count = history.count.toLocaleString('en-US');
  const shown = history.approximate
    ? history.capped
      ? `Roughly ${count} or more`
      : `About ${count}`
    : history.capped
      ? `At least ${count}`
      : count;
  const verb = history.count === 1 && !history.capped ? 'is' : 'are';
  const swept =
    "This mailbox's history was already swept, so it is not read for Q&A pairs again unless a re-sweep is requested.";
  if (history.miningOff) {
    const after =
      history.sweepOwed === false
        ? `It would then cover ${history.from ? `${kbDay(history.from)} – ${to}` : `everything before ${to}`}, but ${swept.charAt(0).toLowerCase()}${swept.slice(1)}`
        : `The history sweep then reads the mail from ${history.from ? `${kbDay(history.from)} – ${to}` : `before ${to}`} for Q&A pairs, which is billed AI usage.`;
    return `This mailbox has no knowledge-base cutoff yet, so nothing is mined now. Saving its settings (Start sync included) sets the cutoff to that moment. ${after}`;
  }
  if (history.capped && history.count === 0) {
    return `How many are knowledge-base history (${span}) could not be counted. ${history.sweepOwed === false ? swept : 'Only that history is read for Q&A pairs; later mail is imported as regular work.'}`;
  }
  if (history.count === 0) {
    return `None of these are from before the knowledge-base cutoff (${to}), so nothing here will be mined for Q&A pairs — it is all regular work.`;
  }
  if (history.sweepOwed === false) {
    return `${shown} ${verb} knowledge-base history (${span}). ${swept}`;
  }
  return `${shown} ${verb} knowledge-base history (${span}): the history sweep reads ${verb === 'is' ? 'it' : 'them'} for Q&A pairs, which is billed AI usage. The rest is imported as regular work.`;
};

/**
 * The mailbox line's window. A KB source's first sync also reads its history before the cutoff,
 * which is not "the last N days" — the label must say so, or it names a window the count did not
 * list.
 */
const mailboxWindowLabel = (days: number, history: KbHistoryCount | null | undefined): string =>
  history && !history.miningOff && days > 0
    ? `${windowLabel(days)} + ${history.from ? `${fmt(days)} day${days === 1 ? '' : 's'} ` : ''}before the knowledge-base cutoff ${kbDay(history.to)}`
    : windowLabel(days);

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
        Mailbox ({mailboxWindowLabel(result.windowDays, result.kbHistory)}):{' '}
        {result.capped ? 'at least ' : ''}
        {fmt(result.count)} message{result.count === 1 ? '' : 's'}
        {folders && ` (${folders})`}
      </p>
      {result.kbHistory && <p className="text-xs">{kbHistoryNote(result.kbHistory)}</p>}
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
      {result.searchCriteria && result.searchCriteria !== 'ALL' && (
        <p className="text-xs text-muted-foreground">
          This mailbox imports only {criteriaLabel(result.searchCriteria)} mail, so messages outside
          that filter can appear here as missing.
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
        <h4 className="font-display font-medium">Compare with Odly</h4>
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
