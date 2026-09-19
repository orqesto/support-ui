import { useEffect, useState } from 'react';
import {
  historicalRangeOptions,
  searchQueryOptions,
} from '@/components/settings/integrations/GmailForm';
import type { AlertState } from '@/components/settings/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import {
  formatInOdly,
  MissingSamples,
} from '@/components/settings/integrations/MailboxReconciliation';
import { apiErrorMessage } from '@/lib/apiError';
import {
  integrationsService,
  type GmailCountResult,
  type Integration,
} from '@/services/integrations.service';

/**
 * "Check Messages Count" for Gmail — the twin of IMAP's button in `EmailForm`.
 *
 * IMAP can count from an unsaved form because the password is typed there. Gmail has no
 * credentials until Google sign-in finishes, so the connect flow saves the new source PAUSED
 * (`startPaused`) and lands here: see the number, adjust the filter or range, then Start sync.
 *
 * Taco, 2026-09-16: `orders@deuspower.info` connected as a KB source on "Last 7 Days" and
 * listed 25,000 messages before anyone saw a number. This panel exists so that number comes
 * first.
 *
 * ⛔ A count shown against settings that have since changed is a lie about a different query,
 * so changing a setting clears it until it is checked again.
 */
export type GmailCountReviewSource = {
  id: number;
  email: string;
  enabled: boolean;
  isKnowledgeBase: boolean;
  searchQuery: string;
  bulkImportDays: number;
};

type Props = {
  source: GmailCountReviewSource;
  onStarted: () => Promise<void> | void;
  onClose: () => void;
  onShowAlert: (alert: AlertState) => void;
};

type CountResult = { count: number; capped: boolean };

export const formatGmailCount = ({ count, capped }: CountResult): string => {
  const shown = count.toLocaleString('en-US');
  // "At least", not "more than": the listing stopped because Google offered another page,
  // which is not proof that page holds a message.
  if (capped) return `At least ${shown} messages match`;
  return `Found ${shown} message${count === 1 ? '' : 's'} matching your criteria`;
};

/**
 * Why some of `missing` may not be missing. The general reason is ALWAYS said — the check can
 * stop for the time limit, Gmail's limits or the per-run cap — and the unchecked count is added
 * to it, never instead of it. The count is "at least": when the sent-folder listing itself did
 * not finish, candidates it never reached are not in it. ⛔ No "check again to finish": every
 * run restarts from the newest sent messages, so a retry does not reach what this one could not.
 */
export const sentOnlyNote = (unchecked: number | undefined, generalSaid = false): string => {
  // `generalSaid`: the sent-check QUOTA line above already says "some of the missing may be
  // sent messages Odly already holds" — only the count is added, never the same sentence twice.
  const general = generalSaid
    ? ''
    : 'The check for sent copies did not finish, so some of the missing may be sent messages Odly already holds.';
  if (!unchecked || unchecked <= 0) return general;
  return `${general ? `${general} ` : ''}At least ${unchecked.toLocaleString('en-US')} sent message${unchecked === 1 ? ' was' : 's were'} not checked and ${unchecked === 1 ? 'is' : 'are'} counted as missing.`;
};

/**
 * Why the listing is partial — only the size cap is helped by narrowing the range. An older
 * backend sends no reason; a cap there was the size cap, so it keeps that sentence.
 */
export const cappedReason = (cappedBy: GmailCountResult['cappedBy'], count: number): string => {
  const shown = count.toLocaleString('en-US');
  switch (cappedBy) {
    case 'time':
      return `Counting stopped on the time limit after ${shown} messages; the mailbox may hold more.`;
    case 'quota':
      return `Gmail refused further requests (quota) after ${shown} messages; the mailbox may hold more.`;
    case 'error':
      return `Gmail failed on a later page after ${shown} messages; the mailbox may hold more.`;
    default:
      return `Counting stops at ${shown}. Narrow the range if that is more than you meant to import.`;
  }
};

/**
 * What a quota refusal cost — it depends on WHERE Google refused. The backend sets `quotaHitIn`
 * whenever `quotaHit` is true, and a sent-check refusal always leaves something missing (the
 * message it could not check), so every case here is one the backend can produce.
 */
export const quotaNote = (where: 'listing' | 'sentCheck' | 'samples'): string => {
  switch (where) {
    case 'listing':
      return 'Gmail refused requests (quota) while listing — fewer messages were compared, and no sent-copy check or examples were run.';
    case 'sentCheck':
      return 'Gmail refused requests (quota) during the sent-copy check — some of the missing may be sent messages Odly already holds, and no examples could be fetched.';
    case 'samples':
      return 'Gmail refused requests (quota) while fetching examples — the counts are unaffected, but some examples are missing.';
  }
};

/**
 * A comparison the time limit cut short — separate from the LISTING (`capped` says nothing
 * about it): count = inOdly + missing + unverifiable + notCompared.
 */
export const notComparedNote = (result: GmailCountResult): string => {
  const notCompared = result.notCompared ?? 0;
  const compared = result.compared ?? result.count - notCompared;
  const fmtN = (value: number) => value.toLocaleString('en-US');
  return `${fmtN(compared)} of ${fmtN(result.count)} listed messages were compared; ${fmtN(notCompared)} ${notCompared === 1 ? 'was' : 'were'} not compared before the time limit — neither in Odly nor missing.`;
};

export const GmailCountReview = ({ source, onStarted, onClose, onShowAlert }: Props) => {
  const [searchQuery, setSearchQuery] = useState(source.searchQuery);
  const [bulkImportDays, setBulkImportDays] = useState(source.bulkImportDays);
  const [result, setResult] = useState<GmailCountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);

  const check = async (settings: { searchQuery: string; bulkImportDays: number }) => {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const data = await integrationsService.countGmailMessages(source.id, {
        ...settings,
        isKnowledgeBase: source.isKnowledgeBase,
      });
      setResult(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not count messages in this mailbox'));
    } finally {
      setChecking(false);
    }
  };

  // A paused source was just connected to be counted — do it without a second click.
  useEffect(() => {
    if (!source.enabled) void check({ searchQuery, bulkImportDays });
    // Once per opened source; later checks are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id]);

  const changeQuery = (value: string) => {
    setSearchQuery(value);
    setResult(null);
  };
  const changeDays = (value: string) => {
    setBulkImportDays(parseInt(value, 10) || 0);
    setResult(null);
  };

  const startSync = async () => {
    setStarting(true);
    try {
      await integrationsService.update(source.id, {
        type: 'gmail',
        enabled: true,
        config: { gmail: { searchQuery, bulkImportDays } },
      });
      await onStarted();
      onShowAlert({
        open: true,
        title: 'Sync started',
        description: `${source.email} will start importing on the next poll.`,
        variant: 'success',
      });
    } catch (err) {
      onShowAlert({
        open: true,
        title: 'Could not start sync',
        description: apiErrorMessage(err, 'Failed to start syncing this mailbox'),
        variant: 'error',
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
      <div>
        <h4 className="font-medium">
          {source.enabled ? 'Message count' : 'Review before the first sync'}
        </h4>
        <p className="text-xs text-muted-foreground break-all">
          {source.email}
          {source.enabled
            ? ' — counting only; use Initial Sync Range to change the saved setting.'
            : ' is connected but NOT syncing yet. Nothing is imported until you start it.'}
        </p>
      </div>

      <div className="space-y-3">
        <ReactSelect
          label="Email Filter"
          value={searchQuery}
          onChange={changeQuery}
          options={searchQueryOptions}
        />
        <ReactSelect
          label="Historical Import Range"
          value={bulkImportDays.toString()}
          onChange={changeDays}
          options={historicalRangeOptions}
        />
        {source.isKnowledgeBase && (
          <p className="text-xs text-muted-foreground">
            Knowledge Base source: everything counted here will also be mined for Q&amp;A pairs,
            which is billed AI usage.
          </p>
        )}
      </div>

      {result && (
        <Alert variant="success" className="p-3">
          <p className="text-sm">✅ {formatGmailCount(result)}</p>
          {result.capped && (
            <p className="mt-1 text-xs">{cappedReason(result.cappedBy, result.count)}</p>
          )}
          {/* An older backend returns only the count — show nothing rather than "0". */}
          {typeof result.inOdly === 'number' && typeof result.missing === 'number' && (
            <>
              <p className="mt-2 text-sm">
                {formatInOdly({
                  inOdly: result.inOdly,
                  missing: result.missing,
                  // An older backend does not send it: nothing was set aside.
                  unverifiable: result.unverifiable ?? 0,
                  // "All in Odly" also needs every listed message COMPARED.
                  capped: result.capped || (result.notCompared ?? 0) > 0,
                })}
              </p>
              {result.capped && (
                <p className="mt-1 text-xs">
                  Partial comparison: only the first{' '}
                  {(result.compared ?? result.count).toLocaleString('en-US')} messages Gmail listed
                  (newest first, in practice) were checked against Odly.
                </p>
              )}
              {(result.notCompared ?? 0) > 0 && (
                <p className="mt-1 text-xs">{notComparedNote(result)}</p>
              )}
              {(result.unverifiable ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Can&apos;t verify = messages sent from this mailbox that could not be matched
                  themselves, but Odly holds a reply in the same conversation sent within minutes of
                  them — most likely the same message. They are not counted as missing.
                </p>
              )}
              {result.quotaHit && result.quotaHitIn && (
                <p className="mt-1 text-xs">{quotaNote(result.quotaHitIn)}</p>
              )}
              {/* A LISTING refusal means the sent check never ran — its own note would contradict
                  the quota line above, which already says so. */}
              {result.sentOnlyCapped &&
                result.missing > 0 &&
                result.quotaHitIn !== 'listing' &&
                sentOnlyNote(result.sentOnlyUnchecked, result.quotaHitIn === 'sentCheck') && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sentOnlyNote(result.sentOnlyUnchecked, result.quotaHitIn === 'sentCheck')}
                  </p>
                )}
              <MissingSamples samples={result.missingSamples ?? []} />
            </>
          )}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" className="p-3">
          <p className="text-sm">{error}</p>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={checking || starting}
          onClick={() => void check({ searchQuery, bulkImportDays })}
        >
          {checking ? 'Counting…' : 'Check Messages Count'}
        </Button>
        {!source.enabled && (
          <Button type="button" disabled={checking || starting} onClick={() => void startSync()}>
            {starting ? 'Starting…' : 'Start sync'}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={starting} onClick={onClose}>
          {source.enabled ? 'Close' : 'Keep paused'}
        </Button>
      </div>
    </div>
  );
};

/** Row → the panel's shape. Read from the refreshed row, so the redirect flow (a fresh mount
 * that never saw the form's config) shows the settings that were actually saved. */
export const reviewSourceOf = (integ: Integration): GmailCountReviewSource => {
  const gmail = (integ.config as { gmail?: { searchQuery?: string; bulkImportDays?: number } })
    .gmail;
  return {
    id: integ.id,
    email: (integ.config as { user?: string }).user ?? integ.name,
    enabled: integ.enabled,
    isKnowledgeBase: integ.isKnowledgeBase ?? false,
    searchQuery: gmail?.searchQuery ?? '',
    // Same default as the poll when the setting was never stored.
    bulkImportDays: gmail?.bulkImportDays ?? 30,
  };
};

/** The row's slot: a "paused" notice for a source that is not syncing, or the open panel. */
export const GmailRowCount = ({
  integration,
  open,
  onOpen,
  onClose,
  onRefresh,
  onShowAlert,
}: {
  integration: Integration;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
}) => {
  if (open) {
    return (
      <GmailCountReview
        source={reviewSourceOf(integration)}
        onClose={onClose}
        onStarted={async () => {
          onClose();
          await onRefresh();
        }}
        onShowAlert={onShowAlert}
      />
    );
  }
  if (integration.enabled) return null;
  return (
    <Alert variant="warning" className="flex flex-wrap gap-2 items-center px-3 py-2 text-xs">
      <span>Paused — not syncing.</span>
      <Button
        type="button"
        variant="ghost"
        className="p-0 h-auto font-medium underline hover:no-underline hover:bg-transparent"
        onClick={onOpen}
      >
        Check count and start
      </Button>
    </Alert>
  );
};
