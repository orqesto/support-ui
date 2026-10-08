import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { bareStatusLabel } from '@/components/messages/inboxCardHelpers';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import systemService, {
  type BounceRepairResult,
  type FusedSplitResult,
} from '@/services/system.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Settings → System → Bounce repair (global admin, the selected workspace).
 *
 * Before 2026-10-07 a bounce that joined a thread changed it: it made our own sent copy a live
 * "customer replied" ticket with the mail system as the customer, those tickets were then merged
 * together (petro Militech: 237 buyers in one ticket), and a message saved during such a merge was
 * left where nobody could see it. This undoes that, in the workspace selected above.
 *
 * ⛔ Every write is two steps: a check that changes nothing, then a confirm that names what it
 * will do. The backend writes only on exactly `apply: true`, which only the confirm sends.
 */

const plural = (count: number, word: string): string =>
  `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

/** FE can reach production before the backend release that adds the endpoint (FE ships on merge). */
const NOT_DEPLOYED =
  'This server does not have this repair yet — it arrives with the next backend release.';

/** Tolerates an older or partial backend answer instead of white-screening on a missing field. */
const normalize = (data: Partial<BounceRepairResult>): BounceRepairResult => ({
  applied: data.applied === true,
  organizationId: data.organizationId ?? 0,
  limit: data.limit ?? 0,
  stranded: {
    found: data.stranded?.found ?? 0,
    moved: data.stranded?.moved ?? 0,
    // Absent from an older backend: stays absent, so the words stay that backend's ("moved").
    ...(typeof data.stranded?.restored === 'number' ? { restored: data.stranded.restored } : {}),
    ...(typeof data.stranded?.skipped === 'number' ? { skipped: data.stranded.skipped } : {}),
    ...(typeof data.stranded?.landedBeyondList === 'number'
      ? { landedBeyondList: data.stranded.landedBeyondList }
      : {}),
    queued: data.stranded?.queued ?? 0,
    truncated: data.stranded?.truncated === true,
    samples: data.stranded?.samples ?? [],
  },
  marked: {
    found: data.marked?.found ?? 0,
    marked: data.marked?.marked ?? 0,
    recomputed: data.marked?.recomputed ?? 0,
    truncated: data.marked?.truncated === true,
  },
  bounceOnly: {
    found: data.bounceOnly?.found ?? 0,
    refiled: data.bounceOnly?.refiled ?? 0,
    truncated: data.bounceOnly?.truncated === true,
    samples: data.bounceOnly?.samples ?? [],
  },
  fused: {
    found: data.fused?.found ?? 0,
    truncated: data.fused?.truncated === true,
    conversations: data.fused?.conversations ?? [],
  },
  failed: data.failed ?? null,
});

/**
 * Per-outcome counts (per message; a check says what it would do, a repair what it did) — from a
 * backend that sends `restored`. An older one only moved: null keeps its words.
 */
const strandedCounts = (
  stranded: BounceRepairResult['stranded']
): { moved: number; restored: number; skipped: number } | null =>
  stranded.restored === undefined
    ? null
    : { moved: stranded.moved, restored: stranded.restored, skipped: stranded.skipped ?? 0 };

/** found + landed = moved + restored + skipped: the extra ones a restore brings along, said. */
const landedText = (stranded: BounceRepairResult['stranded'], verb: string): string =>
  (stranded.landedBeyondList ?? 0) > 0
    ? ` (${stranded.landedBeyondList?.toLocaleString()} more ${verb} with restored tickets)`
    : '';

const countsText = (counts: { moved: number; restored: number; skipped: number }): string =>
  `${counts.moved.toLocaleString()} moved, ${counts.restored.toLocaleString()} restored, ${counts.skipped.toLocaleString()} skipped`;

const label = (row: { id: number; publicId: string | null; subject: string | null }): string =>
  `${row.publicId ?? `#${row.id}`}${row.subject ? ` — ${row.subject}` : ''}`;

/** One fused conversation: check how it would split, then split it on confirm. */
const FusedRow = ({ row }: { row: BounceRepairResult['fused']['conversations'][number] }) => {
  const [plan, setPlan] = useState<FusedSplitResult | null>(null);
  const [done, setDone] = useState<FusedSplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const check = async () => {
    setBusy('check');
    setError(null);
    try {
      const res = await systemService.checkFusedSplit(row.id);
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The check failed.');
      setPlan(res.data);
    } catch (err) {
      setPlan(null);
      setError(apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The check failed.'));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await systemService.applyFusedSplit(row.id);
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The split failed.');
      setDone(res.data);
      setPlan(null);
    } catch (err) {
      setError(apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The split failed.'));
    } finally {
      setBusy(null);
    }
  };

  const moves = plan?.moves ?? [];
  const retyped = plan?.retyped?.length ?? 0;
  // How the new conversations start — a split of an open thread puts every one of them in the
  // inbox, and that has to be said before anyone agrees to it.
  const startsAs = Object.entries(
    moves.reduce<Record<string, number>>((acc, move) => {
      acc[move.startsAs] = (acc[move.startsAs] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([status, count]) => `${count.toLocaleString()} as “${bareStatusLabel(status)}”`)
    .join(', ');
  return (
    <li className="px-3 py-2 space-y-2 text-sm border-t border-border first:border-t-0">
      <div className="flex justify-between items-center gap-3">
        <div>
          <p className="font-medium">{label(row)}</p>
          <p className="text-xs text-muted-foreground">
            {plural(row.correspondents, 'customer')} and {plural(row.bounces, 'bounce')} in one
            conversation
          </p>
        </div>
        {!done && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void check()}
            isLoading={busy === 'check'}
            disabled={busy !== null}
          >
            Check split
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="danger">
          <span className="text-sm">{error}</span>
        </Alert>
      )}
      {plan && !plan.splittable && (
        <p className="text-xs text-muted-foreground">
          Nothing to separate — it holds one customer now.
        </p>
      )}
      {plan?.splittable && (
        <div className="space-y-2">
          <p className="text-xs">
            {plan.keeps ? `${plan.keeps.correspondent} keeps this conversation. ` : ''}
            {plural(moves.length, 'customer')} move to a conversation of their own
            {plan.unattributedMessages > 0
              ? `; ${plural(plan.unattributedMessages, 'message')} (bounces, and anything nothing identifies) stay here`
              : ''}
            .
          </p>
          {startsAs && <p className="text-xs">The new conversations start {startsAs}.</p>}
          {retyped > 0 && (
            <p className="text-xs">
              {plural(retyped, 'message')} stored as our own reply {retyped === 1 ? 'names' : 'name'}{' '}
              a customer and {retyped === 1 ? 'is' : 'are'} put back as that customer's message.
            </p>
          )}
          <ul className="text-xs rounded-md border border-border">
            {moves.slice(0, 10).map((move) => (
              <li key={move.correspondent} className="px-3 py-1 border-t border-border first:border-t-0">
                {move.correspondent} — {plural(move.messages, 'message')}
              </li>
            ))}
          </ul>
          {moves.length > 10 && (
            <p className="text-xs text-muted-foreground">Showing the first 10 of {moves.length}.</p>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            isLoading={busy === 'apply'}
            disabled={busy !== null}
          >
            Split into {plural(moves.length + 1, 'conversation')}
          </Button>
        </div>
      )}
      {done && (
        <Alert variant="success">
          <span className="text-sm">
            Separated — {plural(done.createdConversationIds?.length ?? done.moves.length, 'new conversation')}.
          </span>
        </Alert>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Split ${label(row)}?`}
        description="Each customer's messages, and the replies addressed only to them, move to a conversation of their own. Labels, tickets, the assignee and the number stay with the original. The split runs its own check when it starts, so if the conversation changed since this check the numbers can differ."
        confirmText="Split"
        onConfirm={() => {
          if (busy === null) void apply();
        }}
      />
    </li>
  );
};

const BounceRepair = () => {
  const [check, setCheck] = useState<BounceRepairResult | null>(null);
  const [outcome, setOutcome] = useState<BounceRepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const runCheck = async () => {
    setBusy('check');
    setError(null);
    setOutcome(null);
    try {
      const res = await systemService.checkBounceRepair();
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The check failed.');
      setCheck(normalize(res.data));
    } catch (err) {
      setCheck(null);
      setError(apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The check failed.'));
    } finally {
      setBusy(null);
    }
  };

  const runApply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await systemService.applyBounceRepair();
      if (!res?.success || !res.data) throw new Error(res?.message ?? 'The repair failed.');
      const result = normalize(res.data);
      setOutcome(result);
      // The check described the workspace BEFORE this write; the fused list is still true.
      setCheck((before) => (before ? { ...result, applied: false } : before));
    } catch (err) {
      setError(apiErrorStatus(err) === 404 ? NOT_DEPLOYED : apiErrorMessage(err, 'The repair failed.'));
    } finally {
      setBusy(null);
    }
  };

  const strandedCheck = check ? strandedCounts(check.stranded) : null;
  const marks = check?.marked?.found ?? 0;
  const toFix = check ? check.stranded.found + marks + check.bounceOnly.found : 0;
  const truncated =
    !!check && (check.stranded.truncated || !!check.marked?.truncated || check.bounceOnly.truncated);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">Threads changed by bounces</p>
          <p className="text-sm text-muted-foreground">
            Lists messages left where nobody can see them, open conversations that only a mail
            system ever wrote to, and conversations that hold several customers because bounces
            joined them. Checking changes nothing.
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

      {check && toFix === 0 && check.fused.found === 0 && !outcome && (
        <Alert variant="success">
          <span className="text-sm">Nothing to repair in this workspace.</span>
        </Alert>
      )}

      {check && toFix > 0 && !outcome && (
        <div className="space-y-2">
          <ul className="text-sm list-disc pl-5">
            {check.stranded.found > 0 && (
              <li data-testid="stranded-line">
                {truncated ? 'At least ' : ''}
                <strong>{plural(check.stranded.found, 'message')}</strong> left on a merged-away
                conversation{landedText(check.stranded, 'would land')} —{' '}
                {strandedCheck
                  ? `would be: ${countsText(strandedCheck)}.`
                  : 'moved to the conversation it belongs to; any not yet processed are processed then.'}
              </li>
            )}
            {marks > 0 && (
              <li>
                <strong>{plural(marks, 'bounce')}</strong> stored before bounces were recognised —
                marked, so they no longer count as the customer replying.
              </li>
            )}
            {check.bounceOnly.found > 0 && (
              <li>
                <strong>{plural(check.bounceOnly.found, 'open conversation')}</strong> that only a
                mail system wrote to — filed away (no SLA, out of the inbox).
              </li>
            )}
          </ul>
          {check.bounceOnly.samples.length > 0 && (
            <ul className="text-xs rounded-md border border-border">
              {check.bounceOnly.samples.map((sample) => (
                <li key={sample.id} className="px-3 py-1.5 border-t border-border first:border-t-0">
                  {label(sample)}
                </li>
              ))}
            </ul>
          )}
          {truncated && (
            <p className="text-sm text-warning">
              The check stopped at its limit — more remain. After repairing these, check again.
            </p>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            isLoading={busy === 'apply'}
            disabled={busy !== null}
          >
            Repair
          </Button>
        </div>
      )}

      {outcome && <RepairOutcome outcome={outcome} />}

      {check && check.fused.found > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            <strong>{plural(check.fused.found, 'conversation')}</strong> hold several customers.
            Separate each one on its own — check first to see who moves where.
          </p>
          {check.fused.truncated && (
            <p className="text-sm text-warning">More remain beyond this list — check again later.</p>
          )}
          <ul className="rounded-md border border-border">
            {check.fused.conversations.map((row) => (
              <FusedRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Repair this workspace?"
        description={`${
          strandedCheck
            ? 'Moves or restores messages left on merged-away tickets, following the same rules as new mail. Conversations'
            : 'Stranded messages move to the conversation they belong to, and conversations'
        } only a mail system wrote to are filed away. Conversations that hold several customers are not changed here. The repair runs its own check when it starts, so the numbers can differ from this check; the result says what it actually did.`}
        confirmText="Repair"
        onConfirm={() => {
          if (busy === null) void runApply();
        }}
      />
    </div>
  );
};

const RepairOutcome = ({ outcome }: { outcome: BounceRepairResult }) => {
  const rest = `marked ${plural(outcome.marked?.marked ?? 0, 'bounce')} and filed away ${plural(outcome.bounceOnly.refiled, 'conversation')}.`;
  const counts = strandedCounts(outcome.stranded);
  // An older backend (no `restored`) only moved: its words stay.
  const text = counts
    ? `${plural(outcome.stranded.found, 'message')} left on merged-away tickets${landedText(outcome.stranded, 'landed')}: ${countsText(counts)} (${outcome.stranded.queued.toLocaleString()} queued for processing); ${rest}`
    : `Moved ${plural(outcome.stranded.moved, 'message')} (${outcome.stranded.queued.toLocaleString()} queued for processing), ${rest}`;
  if (outcome.failed) {
    return (
      <Alert variant="warning">
        <span className="text-sm">
          Stopped at “{outcome.failed.step}”: {outcome.failed.error}. {text} Check again to see what
          is left.
        </span>
      </Alert>
    );
  }
  const more =
    outcome.stranded.truncated || !!outcome.marked?.truncated || outcome.bounceOnly.truncated;
  return (
    <Alert variant={more ? 'warning' : 'success'}>
      <span className="text-sm">
        {text}
        {more ? ' More remain — check again to continue.' : ''}
      </span>
    </Alert>
  );
};

export const BounceRepairSection = () => {
  // Every request goes to the SELECTED workspace (X-Organization-Context). Remount on a switch so a
  // check read in one workspace never sits next to a Repair button that now writes to another.
  const workspace = useAuthStore((state) => state.selectedOrganizationId);
  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h3 className="font-display flex gap-2 items-center mb-4 font-semibold text-md">
        <MailWarning className="w-5 h-5" />
        Bounce repair
      </h3>
      <div key={workspace ?? 'none'}>
        <BounceRepair />
      </div>
    </div>
  );
};
