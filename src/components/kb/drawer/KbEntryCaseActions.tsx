import { useEffect, useState } from 'react';
import { FolderInput, FolderOutput } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import { isCaseRow, kbRef } from '@/lib/kbConsolidation';
import { toast } from '@/lib/toast';
import type { KBEntry } from '@/services/kb.service';
import { kbConsolidationService } from '@/services/kbConsolidation.service';
import { searchKbCases } from '@/services/kbEngine.service';
import { KbMoveToCaseDialog, type KbMoveTarget } from '../KbMoveToCaseDialog';
import { ATTACH_REFUSED, DETACH_REFUSED, refusalText } from '../kbWorkRowModel';

/**
 * The entry's scope as the server builds it (`scopeKeyOf`): its mailbox, else its team. Undefined
 * when the detail did not say its mailbox (then the search lists every case it may decide).
 */
export const entryScopeKey = (entry: KBEntry): string | null | undefined => {
  if (entry.messageSourceId === undefined) return undefined;
  if (entry.messageSourceId !== null) return `s:${entry.messageSourceId}`;
  return entry.departmentId !== null ? `d:${entry.departmentId}` : null;
};

/** The case a merged original is in, or null. */
const caseOf = (entry: KBEntry): { caseId: number; casePublicId: string | null } | null =>
  entry.consolidation?.state === 'merged'
    ? { caseId: entry.consolidation.caseId, casePublicId: entry.consolidation.casePublicId }
    : null;

/** Only a live question-and-answer entry in no case can join one (the server's attach rule). */
const canJoin = (entry: KBEntry): boolean =>
  entry.type === 'qa_pair' &&
  !isCaseRow(entry) &&
  !caseOf(entry) &&
  !entry.hidden &&
  !entry.rejectedAt &&
  !entry.sourceDeleted &&
  entryScopeKey(entry) !== null;

/**
 * May this viewer change what case an entry of this scope is in? The backend's rule
 * (`canDecideScope`): an org-level moderator always; anyone else only for a scope whose teams they
 * all moderate — a mailbox that serves every team (org-wide) or another team's mailbox is not
 * theirs. The browser does not know which teams a mailbox serves, so for a team moderator the
 * server is asked once: `GET /cases/search?scopeKey=` answers 403 for a scope they may not decide.
 * null while asking. Any other failure leaves the buttons (the action's own refusal explains).
 */
export const useMayDecideScope = (
  scopeKey: string | null | undefined,
  enabled: boolean
): boolean | null => {
  const { isOrgAdmin } = usePermissions();
  const asks = enabled && !isOrgAdmin && typeof scopeKey === 'string';
  const [answer, setAnswer] = useState<{ key: string; may: boolean } | null>(null);
  useEffect(() => {
    if (!asks || typeof scopeKey !== 'string') return;
    let live = true;
    searchKbCases({ scopeKey, limit: 1 }).then(
      () => live && setAnswer({ key: scopeKey, may: true }),
      (err: unknown) => live && setAnswer({ key: scopeKey, may: apiErrorStatus(err) !== 403 })
    );
    return () => {
      live = false;
    };
  }, [asks, scopeKey]);
  if (!enabled) return false;
  if (!asks) return true;
  return answer?.key === scopeKey ? answer.may : null;
};

/**
 * D13 in the entry drawer: "Move into a case" (the case picker, then attach) and "Remove from
 * case" (detach; the case stays). Shown only to a Manage-KB reviewer who may decide the entry's
 * scope (`useMayDecideScope`); the server still checks, and answers in plain words when it refuses.
 */
export const KbEntryCaseActions = ({
  entry,
  canReview,
  onChanged,
}: {
  entry: KBEntry;
  canReview: boolean;
  onChanged: () => void;
}) => {
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const inCase = caseOf(entry);
  const joinable = canJoin(entry);
  const mayDecide = useMayDecideScope(entryScopeKey(entry), canReview && (!!inCase || joinable));
  if (!canReview || mayDecide !== true) return null;
  if (!inCase && !joinable) return null;

  const attach = async (target: KbMoveTarget) => {
    setBusy(true);
    try {
      const result = await kbConsolidationService.attachToCase(target.caseId, [entry.id]);
      if (result.outcome === 'attached') {
        toast.success(`Moved into case ${kbRef(target.publicId, target.caseId)}`);
        onChanged();
      } else if (result.outcome === 'refused') {
        toast.error(`Not moved: ${refusalText(ATTACH_REFUSED, result)}`);
      } else {
        toast.error('This server cannot move entries into a case yet.');
      }
    } catch (err) {
      toast.error('Could not move it', { description: apiErrorMessage(err, 'Please try again.') });
    } finally {
      setBusy(false);
    }
  };

  const detach = async () => {
    if (!inCase) return;
    setBusy(true);
    try {
      const result = await kbConsolidationService.detachFromCase(inCase.caseId, [entry.id]);
      if (result.outcome === 'detached') {
        toast.success('Removed from the case: it is Not live yet, for review');
        onChanged();
      } else if (result.outcome === 'refused') {
        toast.error(`Not removed: ${refusalText(DETACH_REFUSED, result)}`);
      } else {
        toast.error('This server cannot remove entries from a case yet.');
      }
    } catch (err) {
      toast.error('Could not remove it', {
        description: apiErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {joinable && (
        <Button variant="outline" disabled={busy} onClick={() => setMoving(true)}>
          <FolderInput className="mr-2 w-4 h-4" aria-hidden="true" />
          Move into a case
        </Button>
      )}
      {inCase && (
        <Button variant="outline" disabled={busy} onClick={() => setRemoving(true)}>
          <FolderOutput className="mr-2 w-4 h-4" aria-hidden="true" />
          Remove from case
        </Button>
      )}
      <KbMoveToCaseDialog
        entry={moving ? { id: entry.id, scopeKey: entryScopeKey(entry) } : null}
        entryTitle={entry.title}
        onClose={() => setMoving(false)}
        onConfirm={(target) => void attach(target)}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        onConfirm={() => {
          setRemoving(false);
          void detach();
        }}
        title={inCase ? `Remove from case ${kbRef(inCase.casePublicId, inCase.caseId)}?` : ''}
        description="The case stays. This entry comes back on its own as Not live yet, for review: an approval it had is not kept."
        confirmText="Remove from case"
        variant="warning"
      />
    </>
  );
};
