import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import {
  caseHref,
  caseRef,
  isCaseRow,
  isMergedOriginal,
  isSourceRemoved,
} from '@/lib/kbConsolidation';
import { KBApprovalBadge } from './KBApprovalProvenance';
import { Short } from '@/components/kb/KbPendingDecisionBadge';
import { AUTO_SUPERSEDED_NOTE, formatPurgeDate, isAutoSupersededReject } from '@/lib/kbRejection';
import type { KBEntry } from '@/services/kb.service';

/**
 * One entry's review state, the same on the card, the table and the detail drawer.
 *
 * ⛔ "Rejected" is checked BEFORE "Hidden". A rejected entry is also hidden, and labelling it
 * "Hidden" would tell a reviewer it was tucked away by hand when it is in fact on a 90-day
 * clock to deletion — the one thing about it they most need to know.
 *
 * `compact` is the KB table's narrow Status column (a wrapped `rounded-full` pill turned
 * "Rejected · deleted after …" into a circle and the automatic-duplicate note into a tall oval,
 * prod 2026-10-20): short labels, long wording in the `title`, the purge date under the pill as
 * plain text so it stays visible, and a `rounded-md` tag for a label that may still wrap.
 *
 * Neutral states use `variant="secondary"`, never the default (primary) fill with
 * `text-muted-foreground` on top: muted grey on the pale primary pill was near-illegible in dark.
 */
export const KBStatusBadge = ({
  entry,
  pendingLabel = 'Pending',
  className = '',
  withProvenance = true,
  compact = false,
}: {
  entry: KBEntry;
  pendingLabel?: string;
  className?: string;
  /** The detail drawer renders the full provenance block itself; the compact badge would repeat it. */
  withProvenance?: boolean;
  /** Short labels for the table's narrow Status column; the full wording moves to `title`. */
  compact?: boolean;
}) => {
  // One-word labels never wrap; the longer ones ("merged into #KB-208", "Auto duplicate") do not
  // fit the table's Status column on one line, so they may wrap — on a `rounded-md` tag, never
  // a `rounded-full` blob.
  const cls = compact ? `whitespace-nowrap ${className}` : className;
  const wrapCls = compact ? `rounded-md ${className}` : className;
  // Source removed: never used, whatever else it says — not "Approved · Case", and not "merged
  // into #X" as if that case were live.
  if (isSourceRemoved(entry)) {
    return (
      <Badge
        variant="secondary"
        className={wrapCls}
        title="Its source is no longer in the knowledge base, so it is not used."
      >
        {compact ? 'Source removed' : 'Source removed — not used'}
      </Badge>
    );
  }
  if (entry.rejectedAt) {
    const purge = formatPurgeDate(entry.rejectedAt);
    return (
      <>
        <Badge
          variant="danger"
          className={cls}
          title={
            purge
              ? `Rejected — the AI never uses it. Deleted by the daily cleanup after ${purge} unless approved again.`
              : 'Rejected — the AI never uses it.'
          }
        >
          {/* "after", not "on": the purge is a daily job and takes the row on its first run past
              the date, not at the stroke of it. */}
          {purge && !compact ? `Rejected · deleted after ${purge}` : 'Rejected'}
        </Badge>
        {purge && compact && (
          <span className="w-full text-xs text-muted-foreground">deleted after {purge}</span>
        )}
        {/* Nobody rejected it: the backend retired a duplicate automatic capture. */}
        {isAutoSupersededReject(entry) && (
          <Badge
            variant="secondary"
            // The full sentence wraps wherever it is shown: `rounded-md` in both modes.
            className={`rounded-md ${className}`}
            title={AUTO_SUPERSEDED_NOTE}
          >
            {compact ? (
              <Short short="Auto duplicate" full={AUTO_SUPERSEDED_NOTE} />
            ) : (
              AUTO_SUPERSEDED_NOTE
            )}
          </Badge>
        )}
      </>
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
        variant="secondary"
        className={wrapCls}
        title="Part of a merged case. To change it on its own, Unmerge the case."
      >
        {caseId !== null ? (
          <Link
            to={caseHref(caseId)}
            className="text-inherit hover:underline"
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
        variant="secondary"
        className={wrapCls}
        title="Its thread moved to another mailbox, so it left the case. It stays hidden."
      >
        {consolidation.caseExists
          ? `detached from case ${caseRef(consolidation)}`
          : 'detached (case removed)'}
      </Badge>
    );
  }
  if (entry.hidden) {
    return (
      <Badge variant="secondary" className={cls}>
        Hidden
      </Badge>
    );
  }
  if (entry.approved && isCaseRow(entry)) {
    return (
      <>
        <Badge className={`bg-success text-success-foreground ${cls}`}>Approved</Badge>
        <Badge variant="secondary" className={cls} title="A merged case">
          Case
        </Badge>
        {withProvenance && <KBApprovalBadge entry={entry} />}
      </>
    );
  }
  if (entry.approved) {
    return (
      <>
        <Badge className={`bg-success text-success-foreground ${cls}`}>Approved</Badge>
        {/* "Approved" alone hides whether anyone looked. */}
        {withProvenance && <KBApprovalBadge entry={entry} />}
      </>
    );
  }
  return <Badge className={cls}>{pendingLabel}</Badge>;
};
