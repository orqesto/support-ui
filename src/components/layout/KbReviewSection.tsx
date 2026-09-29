import type React from 'react';
import { BookCheck, Check, Layers, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  KbConsolidationAlert,
  KbReviewAlert,
  UseKbReviewAlertsResult,
} from '@/hooks/useKbReviewAlerts';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import { useDepartments } from '@/hooks/useDepartments';

/** Where the bell's "Review" goes: the page listing every pending merge proposal. */
export const KB_MERGES_REVIEW_PATH = '/knowledge-base/merges';

const describeMerges = (pending: number): string =>
  pending === 1
    ? '1 proposed merge of similar knowledge base answers is waiting for review'
    : `${pending} proposed merges of similar knowledge base answers are waiting for review`;

const describe = (alert: KbReviewAlert): string => {
  const what = alert.entryCount === 1 ? '1 entry' : `${alert.entryCount} entries`;
  const how = alert.capturedVia === 'manual_promote' ? 'added from' : 'saved from';
  const thread = alert.conversationPublicId ?? (alert.subject ? `“${alert.subject}”` : 'a thread');
  return `${what} ${how} ${thread}`;
};

/**
 * A department's standing "merges waiting" row. Its own component so the department lookup (a
 * query) only runs when there is such a row — the bell renders this section on every page.
 */
const MergeReviewRow = ({
  merge,
  onNavigate,
}: {
  merge: KbConsolidationAlert;
  onNavigate: (path: string) => void;
}) => {
  const { data: departments = [] } = useDepartments();
  const deptName =
    merge.departmentId !== null
      ? departments.find((dept) => dept.id === merge.departmentId)?.name
      : undefined;
  return (
    <div className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border">
      <Layers className="mt-0.5 w-4 h-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="font-medium break-words text-foreground">{describeMerges(merge.pending)}</p>
        {deptName && <p className="mt-0.5 text-muted-foreground">{deptName}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-2">
          <Button
            size="sm"
            onClick={() => onNavigate(KB_MERGES_REVIEW_PATH)}
            aria-label="Review proposed merges"
          >
            Review
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * "Saved to the knowledge base — waiting for your review." The backend shows these rows only
 * to members who may review the KB; everyone else never receives them.
 *
 * Approve / Reject decide the whole capture here, in the bell, because that is the job: a
 * reviewer who had to find the entry in the KB list first is the reviewer who never did — the
 * KB review queue was used 0 times in 204 before a notification pointed at it.
 */
export const KbReviewSection = ({
  review,
  showLabel,
  SectionLabel,
  onNavigate,
}: {
  review: UseKbReviewAlertsResult;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
  /** Close the panel and go — the caller owns the router and the open state. */
  onNavigate: (path: string) => void;
}) => {
  const { alerts, consolidations, decide, actingId, error } = review;
  if (alerts.length === 0 && consolidations.length === 0) return null;
  const rowCount = alerts.length + consolidations.length;
  return (
    <>
      {showLabel && <SectionLabel>Knowledge base review ({rowCount})</SectionLabel>}
      {/* One standing row per department — a merge is reviewed side by side on its own page,
          never accepted from here: the moderator has to see the answers being combined. */}
      {consolidations.map((merge) => (
        <MergeReviewRow key={`merge-${merge.id}`} merge={merge} onNavigate={onNavigate} />
      ))}
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      {alerts.map((alert) => {
        const acting = actingId === alert.id;
        return (
          <div
            key={alert.id}
            className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
          >
            <BookCheck className="mt-0.5 w-4 h-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium break-words text-foreground">{describe(alert)}</p>
              <p className="mt-0.5 text-muted-foreground">
                The AI does not use it until it is approved.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-2">
                <Button
                  size="sm"
                  onClick={() => void decide(alert, 'approve')}
                  disabled={acting}
                  aria-label="Approve for the knowledge base"
                >
                  <Check className="mr-1 w-3.5 h-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decide(alert, 'reject')}
                  disabled={acting}
                  title={`Hidden now, deleted after ${REJECTED_RETENTION_DAYS} days unless approved again`}
                  aria-label="Reject"
                >
                  <X className="mr-1 w-3.5 h-3.5" />
                  Reject
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('/knowledge-base?status=pending')}
                  className="px-0 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                >
                  Read or edit first
                </Button>
                {alert.conversationId !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(`/messages?id=${alert.conversationId}`)}
                    className="px-0 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                  >
                    Open thread
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
