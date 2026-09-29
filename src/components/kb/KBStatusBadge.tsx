import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { caseHref, caseRef, isCaseRow, isMergedOriginal } from '@/lib/kbConsolidation';
import { KBApprovalBadge } from './KBApprovalProvenance';
import { formatPurgeDate } from '@/lib/kbRejection';
import type { KBEntry } from '@/services/kb.service';

/**
 * One entry's review state, the same on the card, the table and the detail drawer.
 *
 * ⛔ "Rejected" is checked BEFORE "Hidden". A rejected entry is also hidden, and labelling it
 * "Hidden" would tell a reviewer it was tucked away by hand when it is in fact on a 90-day
 * clock to deletion — the one thing about it they most need to know.
 */
export const KBStatusBadge = ({
  entry,
  pendingLabel = 'Pending',
  className = '',
  withProvenance = true,
}: {
  entry: KBEntry;
  pendingLabel?: string;
  className?: string;
  /** The detail drawer renders the full provenance block itself; the compact badge would repeat it. */
  withProvenance?: boolean;
}) => {
  if (entry.rejectedAt) {
    const purge = formatPurgeDate(entry.rejectedAt);
    return (
      <Badge
        variant="danger"
        className={className}
        title={
          purge
            ? `Rejected — the AI never uses it. Deleted by the daily cleanup after ${purge} unless approved again.`
            : 'Rejected — the AI never uses it.'
        }
      >
        {/* "after", not "on": the purge is a daily job and takes the row on its first run past
            the date, not at the stroke of it. */}
        {purge ? `Rejected · deleted after ${purge}` : 'Rejected'}
      </Badge>
    );
  }
  // KB consolidation (#873): a merged original is hidden because it lives on in its case —
  // "Hidden" would invite an Unhide the server refuses. Say where it went, and link there.
  const consolidation = entry.consolidation ?? null;
  if (isMergedOriginal(entry)) {
    const caseId = consolidation?.caseId ?? entry.consolidatedInto ?? null;
    const ref = consolidation ? caseRef(consolidation) : `#${caseId}`;
    return (
      <Badge
        className={`text-muted-foreground ${className}`}
        title="Part of a merged case. To change it on its own, Unmerge the case."
      >
        {caseId !== null ? (
          <Link
            to={caseHref(caseId)}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            merged into {ref}
          </Link>
        ) : (
          'merged into a case'
        )}
      </Badge>
    );
  }
  // Detached is a HIDDEN state (the backend sends it only while hidden). An entry shown again
  // reads by its own state — Approved / Pending — never "detached … it stays hidden".
  if (consolidation?.state === 'detached' && entry.hidden) {
    return (
      <Badge
        className={`text-muted-foreground ${className}`}
        title="Its thread moved to another mailbox, so it left the case. It stays hidden."
      >
        {consolidation.caseExists
          ? `detached from case ${caseRef(consolidation)}`
          : 'detached (case removed)'}
      </Badge>
    );
  }
  if (entry.hidden) return <Badge className={`text-muted-foreground ${className}`}>Hidden</Badge>;
  if (entry.approved && isCaseRow(entry)) {
    return (
      <>
        <Badge className={`bg-success text-success-foreground ${className}`}>Approved</Badge>
        <Badge variant="secondary" className={className} title="A merged case">
          Case
        </Badge>
        {withProvenance && <KBApprovalBadge entry={entry} />}
      </>
    );
  }
  if (entry.approved) {
    return (
      <>
        <Badge className={`bg-success text-success-foreground ${className}`}>Approved</Badge>
        {/* "Approved" alone hides whether anyone looked. */}
        {withProvenance && <KBApprovalBadge entry={entry} />}
      </>
    );
  }
  return <Badge className={className}>{pendingLabel}</Badge>;
};
