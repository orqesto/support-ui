import { useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import systemService, {
  type KbDocumentRepairResult,
  type KbSweepSource,
} from '@/services/system.service';
import { useAuthStore } from '@/stores/authStore';
import { KbQuestionTextRepair } from './KbQuestionTextRepair';

/**
 * Settings → System → Knowledge base repair (global admin, the selected workspace).
 *
 * The two repairs a workspace needs after the KB was filled by text extraction or wiped by a
 * cleanup (petro Militech, 2026-10-05). Both endpoints existed (#905) but were reachable only by
 * a hand-written fetch in the browser console — a step only we could take.
 *
 * ⛔ Every write is two steps: a read that changes nothing, then a confirm that names what it
 * will do. The backend writes only on exactly `apply: true`, which only the confirm sends.
 */

const plural = (count: number, word: string): string =>
  `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

const total = (counts: KbDocumentRepairResult['matched']): number =>
  counts.unvalidated_extraction + counts.transaction_record;

const sourceName = (source: KbSweepSource): string => source.name ?? `Mailbox #${source.id}`;

/**
 * The frontend can reach production before the backend release that adds these endpoints
 * (FE ships on merge to main, BE on a tag). A 404 then means "this server cannot do it yet",
 * not a broken button.
 */
const NOT_DEPLOYED =
  'This server does not have this repair yet — it arrives with the next backend release.';

/** Where a mailbox's history read stands — the BE `KbSweepState`, in words. */
export const sweepStateText = (source: KbSweepSource): string => {
  switch (source.state) {
    case 'swept':
      return source.lastSweptAt
        ? `History read ${new Date(source.lastSweptAt).toLocaleString()}`
        : 'History read';
    case 'in_progress':
      return 'Reading its history now';
    case 'not_started':
      return 'History not read yet — the next check starts it';
    case 'gmail_pending':
      return 'History read not finished yet — the next check continues it';
    case 'disabled':
      return 'Switched off — nothing is read until it is switched on';
  }
};

/** Whether asking changes anything: a not-started read is started by the next check anyway. */
const canRequest = (source: KbSweepSource): boolean =>
  source.state === 'swept' || source.state === 'in_progress' || source.state === 'disabled';

const confirmText = (source: KbSweepSource): string => {
  const name = sourceName(source);
  if (source.state === 'in_progress') {
    return `${name} is reading its history now. Its read starts again from the beginning on its next check.`;
  }
  if (source.state === 'disabled') {
    return `${name} is switched off. Its history is read again once it is switched on — not before.`;
  }
  return `On its next check ${name} fetches its history from before the knowledge-base cutoff again and mines it for Q&A. Threads it already mined and that have not changed are skipped.`;
};

/** What a re-read request did, from the BE counts — never more than they say. */
export const sweepResultText = (
  source: KbSweepSource,
  result: { cleared: number; resweeps: number; restarted: number; disabled: number }
): string => {
  const name = sourceName(source);
  if (result.cleared === 0) {
    return `Nothing changed — ${name} is no longer a knowledge-base mailbox in this workspace.`;
  }
  if (result.disabled > 0) {
    return `Requested. ${name} is switched off — its history is read once it is switched on.`;
  }
  if (result.restarted > 0) {
    return `${name} starts reading its history again from the beginning on its next check.`;
  }
  if (result.resweeps > 0) {
    return `${name} reads its history again on its next check.`;
  }
  return `Requested. ${name} reads its history on its next check.`;
};

const DocumentRepair = () => {
  const [check, setCheck] = useState<KbDocumentRepairResult | null>(null);
  const [outcome, setOutcome] = useState<KbDocumentRepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const runCheck = async () => {
    setBusy('check');
    setError(null);
    setOutcome(null);
    try {
      const res = await systemService.checkKbDocumentRepair();
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The check failed.');
      setCheck(res.data);
    } catch (err) {
      setCheck(null);
      setError(
        apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The check failed.')
      );
    } finally {
      setBusy(null);
    }
  };

  const runApply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await systemService.applyKbDocumentRepair();
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The repair failed.');
      setOutcome(res.data);
      // The check described the workspace BEFORE this write; showing it now would be stale.
      setCheck(null);
    } catch (err) {
      setError(
        apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The repair failed.')
      );
    } finally {
      setBusy(null);
    }
  };

  const toReject = check ? total(check.matched) : 0;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">Documents filed without validation</p>
          <p className="text-sm text-muted-foreground">
            Before this update, every readable email attachment was filed as an approved
            knowledge-base document without any check. Check lists those, and any document that is a
            transaction record (an invoice, for example). Checking changes nothing.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-4"
          onClick={() => void runCheck()}
          isLoading={busy === 'check'}
          disabled={busy !== null}
        >
          Check
        </Button>
      </div>

      {error && (
        <Alert variant="danger">
          <span className="text-sm">{error}</span>
        </Alert>
      )}

      {check && toReject === 0 && (
        <Alert variant="success">
          <span className="text-sm">
            Nothing to clean up — {plural(check.scanned, 'document')} checked, none filed without
            validation and none a transaction record.
          </span>
        </Alert>
      )}

      {check && toReject > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            {check.truncated ? 'At least ' : ''}
            <strong>{plural(toReject, 'document')}</strong> to reject:{' '}
            {check.matched.unvalidated_extraction.toLocaleString()} filed without validation,{' '}
            {check.matched.transaction_record.toLocaleString()} transaction records.
          </p>
          {check.truncated && (
            <p className="text-sm text-warning">
              The check stopped at {toReject.toLocaleString()} — more remain. After rejecting these,
              check again.
            </p>
          )}
          {(check.samples ?? []).length > 0 && (
            <ul className="text-xs rounded-md border border-border">
              {(check.samples ?? []).map((sample) => (
                <li key={sample.id} className="px-3 py-1.5 border-t border-border first:border-t-0">
                  <span className="font-mono">{sample.title}</span>
                  <span className="text-muted-foreground"> — {sample.why}</span>
                </li>
              ))}
            </ul>
          )}
          {(check.samples ?? []).length < toReject && (
            <p className="text-xs text-muted-foreground">
              Showing the first {(check.samples ?? []).length}.
            </p>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            isLoading={busy === 'apply'}
            disabled={busy !== null}
          >
            Reject {plural(toReject, 'document')}
          </Button>
        </div>
      )}

      {outcome && <RepairOutcome outcome={outcome} />}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Reject ${plural(toReject, 'document')}?`}
        description="They are hidden from the knowledge base and unapproved — not deleted now. The daily cleanup deletes rejected entries after 90 days. The repair runs its own check when it starts, so if documents changed since this check the numbers can differ; the result says what it actually did."
        confirmText="Reject"
        onConfirm={() => {
          if (busy === null) void runApply();
        }}
      />
    </div>
  );
};

const RepairOutcome = ({ outcome }: { outcome: KbDocumentRepairResult }) => {
  const rejected = total(outcome.rejected);
  if (outcome.failed) {
    return (
      <Alert variant="warning">
        <span className="text-sm">
          Stopped after rejecting {plural(rejected, 'document')}: {outcome.failed.error}. Those are
          rejected; check again to see what is left.
        </span>
      </Alert>
    );
  }
  return (
    <Alert variant={outcome.truncated ? 'warning' : 'success'}>
      <span className="text-sm">
        Rejected {plural(rejected, 'document')}.
        {outcome.truncated ? ' More remain — check again to continue.' : ''}
      </span>
    </Alert>
  );
};

const HistoryReRead = () => {
  const [sources, setSources] = useState<KbSweepSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'list' | number | null>(null);
  const [asking, setAsking] = useState<KbSweepSource | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const list = async () => {
    setBusy('list');
    setError(null);
    try {
      const res = await systemService.listKbHistorySweep();
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'Could not list mailboxes.');
      setSources(res.data.sources);
    } catch (err) {
      setError(
        apiErrorStatus(err) === 404
          ? NOT_DEPLOYED
          : apiErrorMessage(err, 'Could not list mailboxes.')
      );
    } finally {
      setBusy(null);
    }
  };

  const request = async (source: KbSweepSource) => {
    setBusy(source.id);
    setError(null);
    setAnswer(null);
    try {
      const res = await systemService.requestKbHistorySweep(source.id);
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The request failed.');
      setAnswer(sweepResultText(source, res.data));
      // Read the list again: the response names only this mailbox, with its state from BEFORE
      // the request — showing it would drop the others and say "History read" for one that is
      // about to read again.
      const fresh = await systemService.listKbHistorySweep().catch(() => null);
      // A list that could not be read again is cleared, not left saying "History read".
      setSources(fresh?.success && fresh.data ? fresh.data.sources : null);
    } catch (err) {
      setError(
        apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The request failed.')
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">Re-read mailbox history</p>
          <p className="text-sm text-muted-foreground">
            A knowledge-base mailbox reads its history from before the cutoff once. Ask it again
            after a cleanup removed the threads it was mined from. Listing changes nothing.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-4"
          onClick={() => void list()}
          isLoading={busy === 'list'}
          disabled={busy !== null}
        >
          Show mailboxes
        </Button>
      </div>

      {error && (
        <Alert variant="danger">
          <span className="text-sm">{error}</span>
        </Alert>
      )}
      {answer && (
        <Alert variant="success">
          <span className="text-sm">{answer}</span>
        </Alert>
      )}

      {sources?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This workspace has no knowledge-base mailboxes (Gmail or IMAP).
        </p>
      )}
      {sources && sources.length > 0 && (
        <ul className="rounded-md border border-border">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex justify-between items-center gap-3 px-3 py-2 text-sm border-t border-border first:border-t-0"
            >
              <div>
                <p className="font-medium">{sourceName(source)}</p>
                <p className="text-xs text-muted-foreground">{sweepStateText(source)}</p>
              </div>
              {canRequest(source) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAsking(source)}
                  isLoading={busy === source.id}
                  disabled={busy !== null}
                >
                  Re-read history
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        variant="warning"
        title={asking ? `Re-read the history of ${sourceName(asking)}?` : ''}
        description={asking ? confirmText(asking) : ''}
        confirmText="Re-read history"
        onConfirm={() => {
          if (asking && busy === null) void request(asking);
        }}
      />
    </div>
  );
};

export const KbRepairSection = () => {
  // Every request goes to the SELECTED workspace (X-Organization-Context). A check read in one
  // workspace must not survive a switch: its count would sit next to a Reject button that now
  // writes to another workspace. Remount on switch, so nothing read before it stays on screen.
  const workspace = useAuthStore((state) => state.selectedOrganizationId);
  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h3 className="font-display flex gap-2 items-center mb-4 font-semibold text-md">
        <BookOpenCheck className="w-5 h-5" />
        Knowledge base repair
      </h3>
      <div key={workspace ?? 'none'} className="space-y-3">
        <DocumentRepair />
        <HistoryReRead />
        <KbQuestionTextRepair workspace={workspace ?? null} />
      </div>
    </div>
  );
};
