import { BookOpen, Calendar, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { kbService, type KbMiningForecast } from '@/services/kb.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { logger } from '@/lib/logger';
import { fallbackLayer } from '@/lib/limitFallback';
import { describeNextReset, formatUtcDateAndLocal } from '@/lib/utcClock';
import { useKbRangeDialogStore } from '@/stores/kbRangeDialogStore';
import { KbHistoryRangeDialog } from '@/components/settings/integrations/KbHistoryRangeDialog';
import { KB_RANGE_MENU_LABEL, errorText } from '@/components/settings/integrations/kbRangeCopy';
import type { AlertState } from '@/components/settings/integrations/types';

/**
 * The Knowledge Base strip under a channel row.
 *
 * Channels and KB sources are one list now (Addendum A.3), so each row has to carry its own
 * KB state instead of inheriting it from a section heading. This shows the two facts that
 * are actually knowable and offers the one action that is safe to expose today:
 *
 *   - the cutoff (`kbMarkedAt`), read-only. It is stamped server-side at the moment KB is
 *     enabled (`integrationsController` → `kbJustEnabled` → `new Date()`) and cleared when
 *     it is switched off. There is no API path for a client-chosen cutoff, so a date picker
 *     would be dead UI — Addendum A.5 lists one, but the correction in
 *     CLIENT-SERVICE-PRIORITIES (feedback 4) is the accurate one, confirmed in the code.
 *   - re-mine, which re-reads history already ingested before that cutoff.
 *
 * Deliberately NOT here yet, because neither can be done safely from the FE alone:
 *   - a KB on/off toggle. The cutoff stamp and the retroactive trigger live in
 *     `upsertIntegration` (POST), not PATCH, so a light PATCH toggle would leave
 *     `isKnowledgeBase=true` with `kbMarkedAt=null` — the silent no-op A.5 item 3 exists to
 *     kill — while routing it through upsert means re-sending a config the GET response has
 *     MASKED, risking real credentials being overwritten with placeholders. Toggling stays
 *     in the Edit form, which owns the full config. BE A.5 item 3 unblocks it.
 *   - "delete KB content, keep the channel". `knowledgeBaseRoutes` has only
 *     `DELETE /entries/:id` and `DELETE /documents/:id` — both single-item. There is no
 *     delete-by-source endpoint, so the headline capability of the independent lifecycle has
 *     no BE support yet (A.5 item 2 assumes it exists; it does not).
 */
/**
 * The days sentence. A pause is promised only when the backend says this workspace is STOPPED
 * at its KB limit (`enforced: true`); an own-key workspace that is only measured never pauses.
 */
const describeMiningDays = (forecast: KbMiningForecast): string => {
  const days = forecast.daysAtLimit;
  // BE R17: the days are counted against the layer the limit fell back to, named from its source
  // (env or built-in), never this workspace's saved limit — and never "today's KB limit" (pass 18).
  const layer =
    forecast.settingsLookupFailed === true ? fallbackLayer(forecast.limit?.source) : null;
  // A fallback of 0 is "no limit", so the backend sends no days — and "no limit" must not read as
  // this workspace's own setting (parity with the console's forecast, pass 21 NIT).
  if (layer && forecast.limit?.limit === 0) {
    return ` There is no KB limit under ${layer}; the saved KB limit could not be read.`;
  }
  if (days === null) return '';
  if (layer && days <= 1) {
    return ` It fits in one day at ${layer} for KB processing; the saved KB limit could not be read.`;
  }
  // Beside an unsettled enforcement the settings read is said once, as the console says it (FE
  // audit pass 20, NIT — "could not be read" came twice).
  if (layer && forecast.enforcementLookupFailed === true) {
    return ` That is about ${days} days of the daily KB limit (counted against ${layer} — the saved KB limit could not be read); whether the limit stops work is unknown.`;
  }
  if (layer) {
    return `${describeDaysAtLimit(forecast, days)} The saved KB limit could not be read, so this is counted against ${layer}.`;
  }
  return describeDaysAtLimit(forecast, days);
};

const describeDaysAtLimit = (forecast: KbMiningForecast, days: number): string => {
  if (days <= 1) return ' It fits in today’s KB limit.';
  // `enforced` is then only the gate's fallback, not a reading of this workspace's settings. BE
  // R17: also a fresh read that SUCCEEDED but disagreed with the cached answer — "could not read"
  // alone was untrue of it (pass 19, LOW).
  if (forecast.enforcementLookupFailed === true) {
    return ` That is about ${days} days of the daily KB limit; this workspace’s AI settings or the platform limit settings could not be read or disagree with the answer in use — whether the limit stops work is unknown.`;
  }
  // `enforced` is always sent: the forecast route exists only on the backend with the limits.
  if (forecast.enforced) {
    return ` At the daily KB limit that takes about ${days} days; it pauses each day at the limit and resumes after the reset at ${describeNextReset()}.`;
  }
  return ` That is about ${days} days of the daily KB limit; this workspace’s limits are only measured, so mining does not pause.`;
};

/**
 * KB image checks are told apart only since the token-limit split: a measuring window reaching
 * back past the first one under-counts them, so the figure reads LOW — said, not hidden. The
 * backend gives no release date, only this workspace's FIRST recorded check (null: none yet), so
 * the sentence names that and never "a recent release" — a workspace whose mail has no images
 * never gets a check and would read so for good (FE audit pass 11, LOW).
 */
const describeImageCheckGap = (forecast: KbMiningForecast): string => {
  const checks = forecast.imageChecks;
  if (!checks || checks.coversWindow) return '';
  const since = checks.firstRecordedAt ? new Date(checks.firstRecordedAt) : null;
  if (since && !Number.isNaN(since.getTime())) {
    // The same date convention as the KB cutoff beside it: the reader's local date, labelled
    // (FE audit pass 12, NIT — it was a bare UTC date next to a local one).
    const day = since.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return ` Image checks during mining are counted from when they were first recorded for this workspace (${day}, your time); any made before then are not in this figure, so it may cost more.`;
  }
  return ' Image checks during mining are counted from when they were first recorded, and none has been recorded for this workspace yet; if mining reads images, it may cost more.';
};

/**
 * Nothing for a re-mine to read: no KB cutoff, or no conversation in scope. Only the source's own
 * row can say so; an older backend (no `sources`) is never taken to mean "nothing".
 */
const nothingInScope = (forecast: KbMiningForecast | undefined): boolean => {
  const own = forecast?.sources?.[0];
  return Boolean(own && (own.noCutoff || own.threadsInScope === 0));
};

/**
 * The Re-mine confirmation's cost sentence. Every number is the backend's measurement; with none
 * it says so rather than guessing (a guessed figure reads as a promise).
 */
export const describeMiningCost = (forecast: KbMiningForecast | undefined): string => {
  if (!forecast) return 'That is billed AI usage; no estimate could be loaded.';
  const count = forecast.threadsToMine.toLocaleString();
  const convs = forecast.threadsToMine === 1 ? 'conversation' : 'conversations';
  // The source's own row (the per-source endpoint returns just this mailbox). Absent from an
  // older backend: then nothing is said about a cutoff or scope it did not report.
  const own = forecast.sources?.[0];
  if (own?.noCutoff) {
    return 'This mailbox has no KB cutoff set, so a re-mine has nothing to read — set a cutoff first.';
  }
  if (forecast.threadsToMine === 0) {
    if (own?.threadsInScope === 0) {
      return 'No imported conversation is in scope yet (none received before the cutoff), so a re-mine has nothing to read.';
    }
    return own
      ? 'Every conversation in scope is already mined — a re-mine skips them unless they changed.'
      : 'No conversation is waiting to be mined — a re-mine skips mined ones unless they changed.';
  }
  if (forecast.estimatedTokens === null || !forecast.tokensPerThread) {
    return `${count} ${convs} will be sent to your AI provider. The cost per conversation is not measured yet on this workspace.`;
  }
  const days = describeMiningDays(forecast);
  return `${count} ${convs} will be sent to your AI provider — about ${forecast.estimatedTokens.toLocaleString()} tokens (${forecast.tokensPerThread.value.toLocaleString()} per conversation, measured on this workspace).${days}${describeImageCheckGap(forecast)}`;
};

/**
 * Why a re-mine was refused. A 409 `source-busy-elsewhere` (R8 contract) comes with the generic
 * "Too many re-mines are running" — false when only one other mine runs: a mailbox with the same
 * id in another workspace is being mined, and the two cannot run together.
 */
export const remineRefusal = (error: unknown): string => {
  const body =
    (error as {
      status?: unknown;
      data?: { code?: unknown; data?: { reason?: unknown } };
    } | null) ?? {};
  if (body.status === 409 && body.data?.data?.reason === 'source-busy-elsewhere') {
    return 'A mailbox in another workspace is being mined right now and this one cannot be mined at the same time — try again once that finishes.';
  }
  // Any other 409 that names a code (no plan, AI refused, …): the server's own sentence, with a
  // reason code left in it put into words — a code is never printed.
  if (body.status === 409 && typeof body.data?.code === 'string') return errorText(error);
  return error instanceof Error ? error.message : 'Failed to start re-mining';
};

export const SourceKbStrip = ({
  source,
  onShowAlert,
  onRefresh,
}: {
  source: {
    id: number;
    name?: string;
    type?: string;
    isKnowledgeBase?: boolean;
    kbMarkedAt?: string | null;
  };
  onShowAlert: (alert: AlertState) => void;
  /** After the history range was changed: the card reads its sources again. */
  onRefresh?: () => void | Promise<void>;
}) => {
  const rangeOpenId = useKbRangeDialogStore((state) => state.openSourceId);
  const [remining, setRemining] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Asked for only when the confirmation opens: a forecast counts the whole mailbox. Plain state,
  // not react-query — this strip renders inside screens (and tests) without a query client.
  const [forecast, setForecast] = useState<{ loading: boolean; data?: KbMiningForecast }>({
    loading: false,
  });
  useEffect(() => {
    if (!confirmOpen || !source.isKnowledgeBase) return;
    let cancelled = false;
    setForecast({ loading: true });
    kbService
      .getMiningForecast(source.id)
      .then((data) => !cancelled && setForecast({ loading: false, data }))
      // No forecast (an older backend answers 404): said as such, never as zero.
      .catch(() => !cancelled && setForecast({ loading: false }));
    return () => {
      cancelled = true;
    };
  }, [confirmOpen, source.id, source.isKnowledgeBase]);

  if (!source.isKnowledgeBase) return null;

  // The history range is a Gmail / IMAP thing: no other KB source has one.
  const rangeType = source.type === 'gmail' || source.type === 'email' ? source.type : null;

  const cutoff = source.kbMarkedAt ? new Date(source.kbMarkedAt) : null;
  const cutoffValid = cutoff !== null && !Number.isNaN(cutoff.getTime());
  const cutoffLabel = cutoffValid
    ? cutoff.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const handleRemine = async () => {
    setRemining(true);
    try {
      const result = await kbService.reprocessSource(source.id);
      // Opened here, where the person asked for the work (it closes only when they close it): a
      // backend recording KB runs would open it by itself too, one that does not would not.
      useProcessingPanelStore.getState().open(source.id, 'manual');
      if (result?.data?.paused) {
        // "From": the restart is not promised by any later time — it waits while the limit is
        // spent, so the backend's resumesBy is not a deadline to quote.
        const at = formatUtcDateAndLocal(result.data.resumesAt);
        onShowAlert({
          open: true,
          title: 'Re-mining starts after the daily reset',
          description: `Today's AI limit for KB processing is reached, so the re-mine waits and starts by itself from ${
            at ?? `the reset at ${describeNextReset()}`
          }.`,
          variant: 'info',
        });
        return;
      }
      if (nothingInScope(forecast.data)) {
        // The mine ends at once with nothing read: "started" would promise work that never runs.
        onShowAlert({
          open: true,
          title: 'Nothing to re-mine',
          description: describeMiningCost(forecast.data),
          variant: 'info',
        });
        return;
      }
      if (!forecast.data) {
        // Confirmed before the forecast answered (or with none — an older backend): whether
        // anything is in scope is not known here, so "started" could promise work that never
        // runs — worded so it holds either way (FE audit pass 11, NIT).
        onShowAlert({
          open: true,
          title: 'Re-mining requested',
          description:
            'Any conversations in scope that are not mined yet are re-read for Q&A pairs in the background. New entries appear in the Knowledge Base as they are extracted.',
          variant: 'info',
        });
        return;
      }
      if (forecast.data.threadsToMine === 0) {
        // The dialog just said everything in scope is already mined (or, from an older backend,
        // that nothing waits): "started … being re-read" contradicted it (FE audit pass 12, LOW).
        onShowAlert({
          open: true,
          title: 'Re-mining requested',
          description:
            'Conversations already mined are skipped unless they changed since; any that changed are re-read for Q&A pairs in the background, and new entries appear in the Knowledge Base as they are extracted.',
          variant: 'info',
        });
        return;
      }
      onShowAlert({
        open: true,
        title: 'Re-mining started',
        // Worded as "started" on purpose: the endpoint is fire-and-forget and returns
        // before any work happens, so promising a result here would be a lie.
        description:
          'Existing conversations are being re-read for Q&A pairs in the background. New entries appear in the Knowledge Base as they are extracted.',
        variant: 'info',
      });
    } catch (error) {
      logger.error('Failed to start KB re-mining:', error);
      onShowAlert({
        open: true,
        title: 'Could not start re-mining',
        description: remineRefusal(error),
        variant: 'error',
      });
    } finally {
      setRemining(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 justify-between items-center px-3 py-2 mt-2 text-xs rounded-md border bg-muted/40">
      <div className="flex gap-2 items-center min-w-0 text-muted-foreground">
        <BookOpen className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">Knowledge Base</span>
        {cutoffValid ? (
          <span className="truncate">
            · mining conversations received before{' '}
            {cutoff.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          // Flag-on with no cutoff means nothing is ever mined. Surfacing it beats showing
          // a confident-looking strip for a source that silently produces nothing.
          <span className="truncate text-warning">
            · no cutoff recorded — nothing is being mined. Re-save this channel to set one.
          </span>
        )}
      </div>
      {/* Re-mining sends every conversation before the cutoff that has no mining watermark to
          the AI provider — paid work. The confirmation now says how many and, once measured on
          this workspace, what it costs (backend mining-forecast). */}
      <div className="flex flex-wrap gap-2 items-center">
        {rangeType && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => useKbRangeDialogStore.getState().open(source.id)}
          >
            <Calendar className="mr-1 w-3 h-3" />
            {KB_RANGE_MENU_LABEL}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          isLoading={remining}
        >
          <RefreshCw className="mr-1 w-3 h-3" />
          Re-mine
        </Button>
      </div>
      {rangeType && rangeOpenId === source.id && (
        <KbHistoryRangeDialog
          source={{ id: source.id, name: source.name ?? '', type: rangeType }}
          onClose={() => {
            // A late apply (after Cancel) must not close another mailbox's dialog.
            const store = useKbRangeDialogStore.getState();
            if (store.openSourceId === source.id) store.close();
          }}
          onShowAlert={onShowAlert}
          onApplied={() => void onRefresh?.()}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void handleRemine()}
        title="Re-mine this mailbox's history?"
        description={`Conversations already imported from this mailbox${cutoffLabel ? ` and received before ${cutoffLabel}` : ''} that are not mined yet will be sent to your AI provider to extract Q&A pairs — billed AI usage. ${
          forecast.loading ? 'Working out how many…' : describeMiningCost(forecast.data)
        }`}
        confirmText="Re-mine"
        variant="warning"
      />
    </div>
  );
};
