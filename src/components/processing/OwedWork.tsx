import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { retryOwedWithheldLine } from '@/components/settings/integrations/kbRangeCopy';
import { apiErrorMessage, apiErrorStatus, isRouteAbsent } from '@/lib/apiError';
import { getConvUrlId } from '@/lib/messageHelpers';
import {
  importProgressService,
  type OwedConversation,
  type OwedList,
  type OwedStageKey,
  type RetryOwedResult,
  type RunOwed,
} from '@/services/importProgress.service';
import { plural, RUN_STAGE_LABELS } from './processingWords';

/**
 * "What's holding this check" (owner, 2026-10-08): which tickets hold a stalled check, a way to fix
 * it (Retry), and what the Retry did. Every sentence here is GENERAL so it stays true in every
 * state the backend can answer with — no per-row or per-reason verdicts.
 */

/** The backend lists at most this many conversations per stage (importProgressCounts). */
export const OWED_LIST_MAX = 20;

const STAGE_ORDER: OwedStageKey[] = ['decided', 'analysis', 'embedding', 'kb'];
/** The panel's own units: checking and analysis count messages, the later stages conversations. */
const COUNTS_MESSAGES: Record<OwedStageKey, boolean> = {
  decided: true,
  analysis: true,
  embedding: false,
  kb: false,
};

const NOT_DEPLOYED = 'This server cannot do this yet — it arrives with the next backend release.';
export const HELD_BACK_FOR_NOW = "Some items can't be retried right now — try again later.";
export const HELD_BACK_PAUSED =
  "Some knowledge-base items can't be retried while this workspace is paused — retry them after it's active again.";
export const HELD_BACK_FOR_GOOD =
  "Some items can't be retried by this button (retried the most times allowed, too old, or not repairable here).";

const linkClass = 'font-mono underline underline-offset-2 hover:text-foreground';

/**
 * A live ticket is a link. A merged-away one is no ticket anyone can open: it is named plainly, and
 * links only to the ticket it was merged into when the backend says a retry moves it there and that
 * ticket is live.
 */
const TicketName = ({ row }: { row: OwedConversation }) => {
  if (!row.deleted)
    return (
      <Link
        to={`/messages?id=${getConvUrlId({ id: row.conversationId, publicId: row.publicId })}`}
        className={linkClass}
      >
        {row.publicId ?? `#${row.conversationId}`}
      </Link>
    );
  if (!row.mergedIntoConversationId)
    return <span data-testid="owed-deleted-row">a deleted ticket</span>;
  const linkTarget =
    row.mergeOutcome === 'move' &&
    row.mergedIntoLive !== false &&
    row.mergeTargetId &&
    row.mergeTargetPublicId
      ? { id: row.mergeTargetId, publicId: row.mergeTargetPublicId }
      : null;
  return (
    <span data-testid="owed-merged">
      a merged-away ticket
      {linkTarget && (
        <>
          {' '}
          (merged into{' '}
          <Link to={`/messages?id=${getConvUrlId(linkTarget)}`} className={linkClass}>
            {linkTarget.publicId}
          </Link>
          )
        </>
      )}
    </span>
  );
};

/** "<Stage>: N messages|conversations — SUP-1, SUP-2 and more · some in departments you can't see" */
const OwedStageLine = ({ stage, list }: { stage: OwedStageKey; list: OwedList }) => {
  const listed = list.conversations.length;
  const messages = COUNTS_MESSAGES[stage];
  const hidden = list.hiddenCount ?? 0;
  // More tickets than shown: by the stage's own ticket count; without it (the #924 backend) only a
  // conversation stage's count is a ticket count.
  const more =
    list.conversationCount !== undefined
      ? list.conversationCount > listed + hidden
      : !messages && list.count > listed + hidden;
  return (
    <li data-testid={`owed-${stage}`}>
      <span className="text-foreground">{RUN_STAGE_LABELS[stage]}:</span>{' '}
      {messages
        ? plural(list.count, 'message', 'messages')
        : plural(list.count, 'conversation', 'conversations')}
      {listed > 0 && ' — '}
      {list.conversations.map((row, index) => (
        <Fragment key={row.conversationId}>
          {index > 0 && ', '}
          <TicketName row={row} />
        </Fragment>
      ))}
      {listed > 0 && more && ' and more'}
      {hidden > 0 && " · some in departments you can't see"}
    </li>
  );
};

/**
 * Checking counts what the repair SETTLES (found − handled: moved, restored or queued), the same
 * measure in the dry run and the result; the result adds how many were queued when fewer were.
 */
const RetryLines = ({ result }: { result: RetryOwedResult }) => {
  const dry = result.dryRun;
  const settled = result.decided.found - result.decided.handled;
  // A person already dealt with these: the repair only marks them checked (lostJobRequeue), which
  // clears the stall all the same — so they count as work, said apart.
  const handled = result.decided.handled;
  const stages: { stage: 'embedding' | 'kb'; count: number }[] = [
    { stage: 'embedding', count: result.embedding.queued },
    { stage: 'kb', count: result.kb.queued },
  ];
  const nothing =
    !dry &&
    settled <= 0 &&
    handled <= 0 &&
    stages.every((line) => line.count <= 0) &&
    !result.failed;
  // The knowledge-base part queued nothing because the KB is full or AI is refused (per the
  // tickets held, not the top-level reason alone: that is null when AI is simply available).
  const withheld = retryOwedWithheldLine({
    dryRun: dry,
    ...(result.kb.kbFull > 0 ? { kbFull: result.kb.kbFull } : {}),
    ...(result.kb.aiUnavailable > 0 ? { aiUnavailable: result.aiUnavailableReason } : {}),
  });
  return (
    <ul className="space-y-0.5" data-testid="retry-lines">
      {settled > 0 && (
        <li data-testid="retry-decided">
          <span className="text-foreground">{RUN_STAGE_LABELS.decided}:</span>{' '}
          {plural(settled, 'message', 'messages')}{' '}
          {dry ? 'will be handled (moved, restored or queued to be checked)' : 'handled'}
          {!dry &&
            result.decided.queued < settled &&
            ` — ${result.decided.queued.toLocaleString()} queued to be checked; the rest were settled without one (for example, waiting for someone to route their ticket)`}
        </li>
      )}
      {handled > 0 && (
        <li data-testid="retry-handled">
          <span className="text-foreground">{RUN_STAGE_LABELS.decided}:</span>{' '}
          {plural(handled, 'message', 'messages')}{' '}
          {dry
            ? 'will be marked as handled — a person already dealt with them'
            : 'marked as handled'}
        </li>
      )}
      {stages
        .filter((line) => line.count > 0)
        .map((line) => (
          <li key={line.stage} data-testid={`retry-${line.stage}`}>
            <span className="text-foreground">{RUN_STAGE_LABELS[line.stage]}:</span>{' '}
            {plural(line.count, 'conversation', 'conversations')}{' '}
            {dry ? 'will be retried' : 'retried'}
          </li>
        ))}
      {nothing && <li data-testid="retry-none">Nothing was retried.</li>}
      {withheld && <li data-testid="retry-kb-withheld">{withheld}</li>}
      {result.heldBackForNow && <li data-testid="retry-held-now">{HELD_BACK_FOR_NOW}</li>}
      {result.heldBackPaused && <li data-testid="retry-held-paused">{HELD_BACK_PAUSED}</li>}
      {result.heldBackForGood && <li data-testid="retry-held-good">{HELD_BACK_FOR_GOOD}</li>}
      {result.truncated && <li data-testid="retry-more">More remain — run Retry again.</li>}
      {result.failed && (
        <li className="text-destructive" data-testid="retry-failed">
          {dry
            ? `Couldn't check what a retry would do: ${result.failed.error}. Nothing was changed.`
            : `Retry stopped: ${result.failed.error}. What finished before the error was kept.`}
        </li>
      )}
    </ul>
  );
};

const owedTotal = (owed: RunOwed): number =>
  STAGE_ORDER.reduce((sum, stage) => sum + owed.owed[stage].count, 0);

/** What a retry can act on: AI analysis is never re-run by it (support-service retryOwedWork). */
const retryableTotal = (owed: RunOwed): number =>
  owed.owed.decided.count + owed.owed.embedding.count + owed.owed.kb.count;

/**
 * Read only when the person opens it — never on the panel's poll — and, for a workspace admin, a
 * retry: a dry run that says what it will do, then a confirm.
 */
export const OwedWork = ({
  sourceId,
  runId,
  onRetried,
}: {
  sourceId: number;
  runId: string;
  /** After a real retry: the panel reads its progress again. */
  onRetried?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [owed, setOwed] = useState<RunOwed | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RetryOwedResult | null>(null);
  const [done, setDone] = useState<RetryOwedResult | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  // A state update lands after the next render: two clicks in one tick both saw `busy` null. The
  // ref is the lock; `busy` only draws it.
  const lock = useRef(false);
  // Only the newest read writes: one closed (or overtaken by a re-read) must not print late.
  const readSeq = useRef(0);

  const load = async () => {
    const seq = ++readSeq.current;
    setOwed(null);
    setLoadError(null);
    try {
      const data = await importProgressService.owed(sourceId, runId);
      if (seq === readSeq.current) setOwed(data);
    } catch (error) {
      if (seq !== readSeq.current) return;
      setLoadError(
        isRouteAbsent(error)
          ? NOT_DEPLOYED
          : apiErrorStatus(error) === 403
            ? 'You do not have access to this list.'
            : apiErrorMessage(error, 'Could not read what is holding this check.')
      );
    }
  };

  const toggle = () => {
    if (open) {
      readSeq.current += 1;
      setOpen(false);
      setPlan(null);
      return;
    }
    // The last retry's outcome stays across close / reopen: a write that happened (or is still
    // running) must not lose its result; it is cleared when the next dry run starts.
    setOpen(true);
    void load();
  };

  const retryFailed = (error: unknown, fallback: string) =>
    setRetryError(
      apiErrorStatus(error) === 403
        ? 'Only workspace admins can retry.'
        : isRouteAbsent(error)
          ? NOT_DEPLOYED
          : apiErrorMessage(error, fallback)
    );

  const check = async () => {
    if (lock.current) return;
    lock.current = true;
    const seq = readSeq.current;
    setBusy('check');
    setRetryError(null);
    setDone(null);
    try {
      const result = await importProgressService.retryOwed(sourceId, runId, true);
      // Closed meanwhile: the plan is not shown on a later open (a fresh read comes first).
      if (seq === readSeq.current) setPlan(result);
    } catch (error) {
      setPlan(null);
      if (seq === readSeq.current) retryFailed(error, 'Could not check what a retry would do.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const apply = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy('apply');
    setRetryError(null);
    try {
      const result = await importProgressService.retryOwed(sourceId, runId, false);
      setPlan(null);
      setDone(result);
      onRetried?.();
      void load();
    } catch (error) {
      retryFailed(error, 'The retry failed.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const total = owed ? owedTotal(owed) : 0;
  const retryable = owed ? retryableTotal(owed) : 0;
  // A dry run that stopped part-way never offers a confirm.
  const willRetry = plan ? plan.decided.found + plan.embedding.queued + plan.kb.queued : 0;
  const actionable = plan !== null && !plan.failed && willRetry > 0;

  return (
    <div className="pt-2 border-t" data-testid="owed-work">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 px-0 h-6 text-xs text-muted-foreground"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        What&apos;s holding this check
      </Button>
      {open && (
        <div className="mt-1 space-y-1.5 text-[11px] text-muted-foreground">
          {loadError ? (
            <p className="text-destructive" role="alert">
              {loadError}
            </p>
          ) : owed === null ? (
            <p className="flex gap-2 items-center" data-testid="owed-loading">
              <Spinner size={12} />
              Reading what this check still owes…
            </p>
          ) : (
            <>
              {total === 0 ? (
                <p>Nothing is holding this check any more.</p>
              ) : (
                <ul className="space-y-0.5">
                  {STAGE_ORDER.filter((stage) => owed.owed[stage].count > 0).map((stage) => (
                    <OwedStageLine key={stage} stage={stage} list={owed.owed[stage]} />
                  ))}
                </ul>
              )}
              {owed.canRetry && total > 0 && retryable === 0 && (
                <p data-testid="owed-analysis-only">
                  {RUN_STAGE_LABELS.analysis} isn&apos;t retried here.
                </p>
              )}
              {owed.canRetry && retryable > 0 && !plan && (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2 h-6 text-[11px]"
                  isLoading={busy === 'check'}
                  disabled={busy !== null}
                  onClick={() => void check()}
                >
                  Retry
                </Button>
              )}
            </>
          )}
          {plan && (
            <div className="space-y-1.5" data-testid="retry-plan">
              <p className="text-foreground">A retry will do this:</p>
              <RetryLines result={plan} />
              {actionable ? (
                <>
                  {/* A message someone already dealt with is only marked: no job, no reply. */}
                  {plan.decided.found - plan.decided.handled > 0 && (
                    <p className="text-warning">
                      Messages that were never checked are checked now: if automatic replies are on,
                      a customer may get a late automatic reply.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="px-2 h-6 text-[11px]"
                      isLoading={busy === 'apply'}
                      disabled={busy !== null}
                      onClick={() => void apply()}
                    >
                      Confirm retry
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 h-6 text-[11px]"
                      disabled={busy !== null}
                      onClick={() => setPlan(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2 items-center">
                  {!plan.failed && (
                    <p data-testid="retry-nothing">Nothing can be retried right now.</p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 h-6 text-[11px]"
                    onClick={() => setPlan(null)}
                  >
                    Back
                  </Button>
                </div>
              )}
            </div>
          )}
          {done && (
            <div className="space-y-1" data-testid="retry-done">
              <p className="text-foreground">Retry finished:</p>
              <RetryLines result={done} />
            </div>
          )}
          {retryError && (
            <p className="text-destructive" role="alert">
              {retryError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
