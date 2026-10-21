import {
  Bot,
  CheckCircle,
  Eye,
  EyeOff,
  FileText,
  Maximize2,
  Split,
  MessageSquare,
  Trash2,
  XCircle,
} from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { KBStatusBadge } from './KBStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import { kbSourceConversationId } from '@/lib/kbSource';
import type { KBEntry, KbPendingDecision } from '@/services/kb.service';
import { KbPendingDecisionBadge } from './KbPendingDecisionBadge';
import { KbReviewDecisionButton } from './KbReviewDecisionButton';
import {
  isCaseRow,
  isMergedOriginal,
  kbRef,
  mayRemoveCase,
  offersReviewActions,
} from '@/lib/kbConsolidation';

import { RESTORE_AUTO_TITLE } from './KbStatusFilter';
import { KbAutoUndoButton } from './KbAutoUndoButton';
import { autoUndoOf, type KbAutoRestore } from './useKbAutoRestore';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'qa_pair':
      return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
    case 'document':
      return <FileText className="w-4 h-4 text-success" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
};

const getQualityColor = (score: number) => {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
};

type KBTableViewProps = {
  entries: KBEntry[];
  loading: boolean;
  onView: (entry: KBEntry) => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  /**
   * Show a hidden entry again WITHOUT approving it (PATCH /unhide, D5). A REJECTED entry is not
   * unhidden: its eye is "Restore", which approves it (the backend clears the rejection).
   */
  onUnhide: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
  /** May approve / reject / hide (manage_knowledge_base). Without it the server answers 403. */
  canReview: boolean;
  /** Undo a merged case (manage_knowledge_base). Shown only on case rows. */
  onUnmerge?: (entry: KBEntry) => void;
  /** Open the review for a merge / rewrite / removal suggestion waiting on this entry. */
  onReviewDecision?: (decision: KbPendingDecision) => void;
  /** Under "Removed automatically": a removed row's Restore undoes the automatic removal. */
  autoRestore?: KbAutoRestore;
  /** Bulk selection: a leading checkbox column, only on rows `selectable` accepts. */
  selection?: {
    selected: ReadonlySet<number>;
    toggle: (id: number, on: boolean) => void;
    selectable: (entry: KBEntry) => boolean;
  };
};

export const KBTableView = ({
  entries,
  loading,
  onView,
  onApprove,
  onHide,
  onUnhide,
  onReject,
  onDelete,
  canReview,
  onUnmerge,
  onReviewDecision,
  autoRestore,
  selection,
}: KBTableViewProps) => (
  <div className="hidden rounded-lg border md:block">
    <table className="w-full table-fixed">
      <colgroup>
        {selection && <col className="w-8" />}
        <col className="w-10" />
        <col />
        <col className="hidden w-16 md:table-column" />
        <col className="hidden w-24 lg:table-column" />
        <col className="hidden w-24 xl:table-column" />
        <col className="hidden w-16 sm:table-column" />
        <col className="hidden w-14 lg:table-column" />
        <col className="w-28" />
        <col className="w-48" />
      </colgroup>
      <thead className="bg-muted/50">
        <tr className="border-b">
          {selection && <th className="w-8 px-2 py-3" aria-label="Select" />}
          <th className="px-2 py-3 text-sm font-medium text-left">Type</th>
          <th className="px-3 py-3 text-sm font-medium text-left">Title</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center md:table-cell">Source</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-left lg:table-cell">Category</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-left xl:table-cell">
            Department
          </th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center sm:table-cell">
            Quality
          </th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center lg:table-cell">Usage</th>
          <th className="px-3 py-3 text-sm font-medium text-center">Status</th>
          <th className="px-2 py-3 text-sm font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={selection ? 10 : 9} className="px-4 py-8 text-center">
              Loading...
            </td>
          </tr>
        ) : entries.length === 0 ? (
          <tr>
            <td
              colSpan={selection ? 10 : 9}
              className="px-4 py-8 text-center text-muted-foreground"
            >
              No entries found
            </td>
          </tr>
        ) : (
          entries.map((entry) => (
            <tr key={entry.id} className="border-b hover:bg-muted/50">
              {selection && (
                <td className="px-2 py-3">
                  {selection.selectable(entry) && (
                    <Checkbox
                      aria-label={`Select ${entry.title}`}
                      checked={selection.selected.has(entry.id)}
                      onChange={(event) => selection.toggle(entry.id, event.target.checked)}
                    />
                  )}
                </td>
              )}
              <td className="px-2 py-3">{getTypeIcon(entry.type)}</td>
              <td className="px-3 py-3">
                <div className="font-medium truncate">
                  {/* The entry's own number — what the search box finds it by ("#KB-134"; an
                      entry without a public id is "#77", which a bare "77" finds). */}
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {kbRef(entry.publicId, entry.id)}
                  </span>
                  {entry.title}
                </div>
                <div className="text-sm text-muted-foreground line-clamp-1">{entry.content}</div>
              </td>
              <td className="hidden px-3 py-3 text-center md:table-cell">
                {kbSourceConversationId(entry) !== null ? (
                  <a
                    href={`/threads?id=${kbSourceConversationId(entry)}`}
                    className="font-mono text-sm text-primary hover:text-primary/80 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    #{kbSourceConversationId(entry)}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <Badge className="max-w-full truncate">{entry.category}</Badge>
              </td>
              <td className="hidden px-3 py-3 xl:table-cell">
                <DepartmentBadge departmentId={entry.departmentId} />
              </td>
              <td className="hidden px-3 py-3 text-center sm:table-cell">
                <span className={`font-medium ${getQualityColor(entry.qualityScore)}`}>
                  {(entry.qualityScore * 100).toFixed(0)}%
                </span>
              </td>
              <td className="hidden px-3 py-3 text-center lg:table-cell">{entry.usageCount}</td>
              <td className="px-3 py-3 text-center">
                <div className="flex flex-wrap gap-1 justify-center items-center">
                  {/* See KBEntryCard: a reviewer approving an AI-drafted answer is
                      what would turn the model's own output into ground truth. */}
                  {entry.metadata?.authorProvenance === 'ai_drafted' && (
                    <Badge
                      variant="secondary"
                      className="gap-1"
                      title="This answer was drafted by AI and sent by an agent — review it before approving."
                    >
                      <Bot className="w-3 h-3" />
                      AI
                    </Badge>
                  )}
                  <KBStatusBadge entry={entry} compact />
                </div>
                <KbPendingDecisionBadge
                  decision={entry.pendingDecision}
                  others={entry.otherPendingDecisions}
                  setAsideReason={entry.setAsideReason}
                  compact
                />
              </td>
              <td className="px-2 py-3 text-right">
                {/* A Pending entry offers five actions (View, Approve, Reject, Hide, Delete). At
                    `size="sm"` (42px each) they were wider than this column, and a `justify-end`
                    row that overflows spills out of its START edge — the View button sat on the
                    end of the Status column's "Pending" pill (demo, 2026-10-15). Square 32px
                    icon buttons fit five in the column; `flex-wrap` keeps a sixth (a case row's
                    Unmerge) inside the cell instead of over its neighbour. */}
                <div
                  data-testid="kb-row-actions"
                  className="flex flex-wrap gap-1 justify-end [&>button]:h-8 [&>button]:w-8 [&>button]:px-0"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onView(entry)}
                    title="View details"
                    aria-label="View details"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                  <KbReviewDecisionButton
                    entry={entry}
                    onReview={onReviewDecision}
                    className="!w-auto !px-2"
                  />
                  <KbAutoUndoButton
                    entry={entry}
                    autoRestore={autoRestore}
                    className="!w-auto !px-2"
                  />
                  {canReview && offersReviewActions(entry) && !entry.approved && !entry.hidden && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onApprove(entry.id)}
                        title="Approve"
                        aria-label="Approve"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      {mayRemoveCase(entry) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject(entry.id)}
                          title={`Reject — hidden now, deleted after ${REJECTED_RETENTION_DAYS} days`}
                          aria-label="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </>
                  )}
                  {canReview &&
                    offersReviewActions(entry) &&
                    (entry.hidden || mayRemoveCase(entry)) &&
                    (!entry.hidden ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onHide(entry.id)}
                        title="Hide"
                        aria-label="Hide"
                      >
                        <EyeOff className="w-4 h-4" />
                      </Button>
                    ) : autoRestore && autoUndoOf(entry) ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          entry.rejectedAt && autoRestore
                            ? autoRestore.restore(entry.id)
                            : entry.rejectedAt
                              ? onApprove(entry.id)
                              : onUnhide(entry.id)
                        }
                        title={
                          entry.rejectedAt && autoRestore
                            ? RESTORE_AUTO_TITLE
                            : entry.rejectedAt
                              ? 'Approve again — restores the rejected entry'
                              : 'Unhide'
                        }
                        disabled={autoRestore?.pending.has(entry.id) === true}
                        aria-label={
                          entry.rejectedAt ? (autoRestore ? 'Restore' : 'Approve again') : 'Unhide'
                        }
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    ))}
                  {canReview && isCaseRow(entry) && mayRemoveCase(entry) && onUnmerge && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUnmerge(entry)}
                      title="Unmerge — undo this case and restore its original entries"
                      aria-label="Unmerge"
                    >
                      <Split className="w-4 h-4" />
                    </Button>
                  )}
                  {/* A merged original is deleted only by unmerging its case (the server
                      answers 409), so the list does not offer it. */}
                  {!isMergedOriginal(entry) && mayRemoveCase(entry) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(entry)}
                      title="Delete"
                      aria-label="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
