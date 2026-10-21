/**
 * One entry of the KB cases worklist: its status as the KB list words it, why an action is not
 * offered, and the actions this viewer may take. State and requests live in `KbWorkRows`.
 *
 * ⛔ The Knowledge Base list is the ONE place to decide (Approve / Reject / Hide / Unhide / Restore,
 * a clean-up's Undo, a hold's Keep using / Reject): this view groups and edits, it does not
 * decide. A row links to the entry in the list instead.
 */
import { Link } from 'react-router-dom';
import { Edit, ExternalLink, FolderInput, FolderOutput, MessageSquare, Split } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { KBStatusBadge } from './KBStatusBadge';
import { caseHref, offersReviewActions } from '@/lib/kbConsolidation';
import { getConvUrlId } from '@/lib/messageHelpers';
import type { KbSetAsideReason, KbWorkRow } from '@/services/kbConsolidation.service';
import {
  ACTION_TIPS,
  SET_ASIDE_REASON_LABEL,
  asListEntry,
  headline,
  isCaseEntry,
  mayModerate,
  type BusyAction,
} from './kbWorkRowModel';

/** A row button with its effect as a tooltip. */
const Tip = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <Tooltip content={text} size="sm">
    {children}
  </Tooltip>
);

export const KbWorkRowItem = ({
  row,
  reason,
  caseId,
  lastMember = false,
  proposedBy = null,
  busy,
  editLoading,
  error,
  orgCode,
  onEdit,
  onMove,
  onDetach,
  onUnmerge,
  casesExist = null,
}: {
  row: KbWorkRow;
  reason: KbSetAsideReason | undefined;
  /** The case being listed (its own row is "This case"; its members are merged originals). */
  caseId: number | null;
  /** It is the only member of the listed case: a case cannot be left empty (BE `last_member`). */
  lastMember?: boolean;
  /**
   * The pending merge suggestion that proposes this entry for the listed case (it is NOT a member
   * yet): decided in the Knowledge Base list, so nothing else is offered on it here.
   */
  proposedBy?: number | null;
  /** The action in flight on this list, if any (one at a time). */
  busy: { id: number; action: BusyAction } | null;
  editLoading: boolean;
  error: string | undefined;
  orgCode: string | undefined;
  onEdit: () => void;
  onMove: () => void;
  onDetach: () => void;
  onUnmerge: () => void;
  /**
   * Is there a case in the report's departments to move an entry into? false: none — "Move into
   * case" is not offered. null: not known — it is offered (the picker says when none fits).
   */
  casesExist?: boolean | null;
}) => {
  const busyOn = (action: BusyAction) => busy?.id === row.id && busy.action === action;
  const entry = asListEntry(row, caseId, reason);
  const isCase = isCaseEntry(row, caseId);
  // A merged original of the case being listed: served through the case.
  const proposed = proposedBy !== null && !isCase;
  const member = !isCase && caseId !== null && row.caseId === caseId;
  // Left a case: HIDDEN when its thread moved to another mailbox; PENDING when a moderator took it
  // out by hand (BE keeps it set aside until it is approved, edited, rejected or merged). The KB
  // list's badge shows only the hidden shape, so this list labels both from the reason.
  const detachedHidden = reason === 'detached' && row.status === 'hidden';
  const detachedByHand = reason === 'detached' && row.status === 'pending';
  const moderate = mayModerate(row);
  const idle = busy === null;
  const usable = offersReviewActions(entry);
  // The nightly review's own change: text cleaned automatically, or taken out of use (held).
  const cleaned = row.autoCleaned ?? null;
  const held = row.heldForReview ?? null;
  // Could join a case, rights aside: in no case, approved or pending (a hand-detached entry may go
  // into another case; a hidden one may not).
  const candidate =
    !isCase &&
    !proposed &&
    usable &&
    entry.consolidatedInto === null &&
    (row.status === 'approved' || row.status === 'pending');
  // No scope ('' from the server): no case accepts it (BE `other_scope`) — not offered, said why.
  const noScope = candidate && row.scopeKey === '';
  // Its KB capture review is still open: the server refuses to merge it (`under_review`).
  const inReview = candidate && reason === 'awaiting_review';
  const movable = candidate && !noScope && !inReview && casesExist !== false;
  const canMove = movable && row.canDecide;
  const canRemove = member && row.canDecide && !lastMember;
  const why = row.sourceDeleted
    ? null
    : member && lastMember && row.canDecide
      ? 'The case’s only entry — a case cannot be left empty. To dissolve it, use Split case on the case’s own row.'
      : member
        ? row.canDecide
          ? 'Merged into this case — it is served through the case, so it is not approved or hidden on its own. Remove it from the case to act on it alone.'
          : 'Merged into this case — it is served through the case. Only a moderator of every department the case serves can remove it.'
        : isCase && !row.canDecide
          ? 'Only a moderator of every department this case serves can split it.'
          : !isCase && !moderate
            ? 'View only — you do not moderate this entry’s department.'
            : noScope
              ? 'It belongs to no mailbox or department, so it cannot be moved into a case.'
              : inReview
                ? 'Its KB review is still open — decide that review first, then it can join a case.'
                : movable && !row.canDecide
                  ? 'Moving it into a case needs a moderator of every department its source serves.'
                  : null;
  return (
    <li
      tabIndex={-1}
      data-row-id={row.id}
      className="p-3 space-y-2 rounded-md border outline-none border-border bg-card"
      data-testid={`work-row-${row.id}`}
    >
      <div className="flex flex-wrap gap-2 items-center">
        {isCase && <Badge variant="secondary">{row.id === caseId ? 'This case' : 'Case'}</Badge>}
        <Link
          to={caseHref(row.id)}
          className="text-sm font-medium break-words text-primary hover:underline"
        >
          {headline(row)}
        </Link>
        {detachedHidden ? (
          <Badge
            variant="secondary"
            title="Its thread moved to another mailbox, so it left the case. It stays hidden."
          >
            detached from a case
          </Badge>
        ) : (
          <KBStatusBadge entry={entry} withProvenance={false} />
        )}
        {detachedByHand && <Badge variant="warning">Removed from a case</Badge>}
        {proposed && <Badge variant="secondary">Proposed to join</Badge>}
        {cleaned && <Badge variant="secondary">Customer details removed automatically</Badge>}
        {held && <Badge variant="warning">Not used — about one customer</Badge>}
        {reason && reason !== 'detached' && (
          <Badge variant="warning">{SET_ASIDE_REASON_LABEL[reason]}</Badge>
        )}
      </div>
      {proposed && (
        <p className="text-xs text-muted-foreground">
          Proposed to join this case (merge suggestion #{proposedBy}) —{' '}
          <Link
            to={`/knowledge-base?status=suggested_change&id=${row.id}`}
            className="text-primary hover:underline"
          >
            review it in the Knowledge Base
          </Link>
          .
        </p>
      )}
      {held && (
        <p className="text-xs text-muted-foreground">
          The review judged this answer to be about one customer, so the AI stopped using it.
        </p>
      )}
      {reason === 'classifying' && (
        <p className="text-xs text-muted-foreground">
          Being re-grouped — it appears in a case after the next grouping run (or Run now).
        </p>
      )}
      {detachedByHand && (
        <p className="text-xs text-muted-foreground">
          Taken out of its case by hand — it needs a decision: approve, edit, reject, or move it
          into a case.
        </p>
      )}
      {reason === 'no_clear_language' && row.status === 'approved' && (
        // The report counts it here AND lists it as a single learned answer (BE rule 4):
        // say so, so the same entry seen twice is not read as two.
        <p className="text-xs text-muted-foreground">
          Approved, so it is also listed among the cases as a single learned answer.
        </p>
      )}
      {reason === 'no_clear_language' && row.status === 'pending' && (
        // …and a pending one is ALSO in the "below the quality bar" count (BE rule 4).
        <p className="text-xs text-muted-foreground">
          Not approved, so it is also counted among the answers below the quality bar.
        </p>
      )}
      {row.answer ? (
        <p className="text-sm whitespace-pre-wrap break-words line-clamp-3 text-muted-foreground">
          {row.answer}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">no answer text</p>
      )}
      {why && <p className="text-xs text-muted-foreground">{why}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        {row.conversationId !== null && (
          <Link
            to={`/threads?id=${getConvUrlId(
              { id: row.conversationId, publicId: row.conversationPublicId },
              orgCode
            )}`}
            className="inline-flex gap-1 items-center text-xs text-primary hover:underline"
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            Open thread {row.conversationPublicId ?? `#${row.conversationId}`}
          </Link>
        )}
        <Link
          to={`/knowledge-base?id=${row.id}`}
          className="inline-flex gap-1 items-center text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          Open in Knowledge Base
        </Link>
        {moderate && usable && !proposed && (
          <Tip text={ACTION_TIPS.edit}>
            <Button
              size="sm"
              variant="outline"
              disabled={!idle}
              isLoading={editLoading}
              onClick={() => onEdit()}
            >
              <Edit className="mr-1 w-4 h-4" aria-hidden="true" />
              Edit
            </Button>
          </Tip>
        )}
        {canMove && (
          <Tip text={ACTION_TIPS.move}>
            <Button
              size="sm"
              variant="outline"
              disabled={!idle}
              isLoading={busyOn('move')}
              data-action="move"
              onClick={() => onMove()}
            >
              <FolderInput className="mr-1 w-4 h-4" aria-hidden="true" />
              Move into case
            </Button>
          </Tip>
        )}
        {canRemove && (
          <Tip text={ACTION_TIPS.detach}>
            <Button
              size="sm"
              variant="outline"
              disabled={!idle}
              isLoading={busyOn('detach')}
              data-action="detach"
              onClick={() => onDetach()}
            >
              <FolderOutput className="mr-1 w-4 h-4" aria-hidden="true" />
              Remove from case
            </Button>
          </Tip>
        )}
        {isCase && row.canDecide && (
          <Tip text={ACTION_TIPS.split}>
            <Button
              size="sm"
              variant="outline"
              disabled={!idle}
              isLoading={busyOn('unmerge')}
              onClick={() => onUnmerge()}
            >
              <Split className="mr-1 w-4 h-4" aria-hidden="true" />
              Split case
            </Button>
          </Tip>
        )}
      </div>
    </li>
  );
};
