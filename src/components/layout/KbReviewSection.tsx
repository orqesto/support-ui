import type React from 'react';
import { BookCheck, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  KbConsolidationAlert,
  KbReviewAlert,
  UseKbReviewAlertsResult,
} from '@/hooks/useKbReviewAlerts';
import { useDepartments } from '@/hooks/useDepartments';

// The row counts merge proposals AND quality suggestions (one bell per department, BE
// consolidationBell): it cannot say how many of each, so it names both kinds.
const describeMerges = (pending: number): string =>
  pending === 1
    ? '1 knowledge base suggestion (a merge or a fix to an entry) is waiting for review'
    : `${pending} knowledge base suggestions (merges and fixes to entries) are waiting for review`;

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
            onClick={() => onNavigate('/knowledge-base?status=suggested_change')}
            aria-label="Review knowledge base suggestions"
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
 * The bell only links: Review opens the Knowledge Base list on "Needs your decision", where the
 * capture is decided — the one place to decide (owner rule, 2026-10-21).
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
  const { alerts, consolidations } = review;
  if (alerts.length === 0 && consolidations.length === 0) return null;
  const rowCount = alerts.length + consolidations.length;
  return (
    <>
      {showLabel && <SectionLabel>Knowledge base review ({rowCount})</SectionLabel>}
      {/* One standing row per department — a merge is reviewed side by side in the Knowledge Base
          list, never accepted from here: the moderator has to see the answers being combined. */}
      {consolidations.map((merge) => (
        <MergeReviewRow key={`merge-${merge.id}`} merge={merge} onNavigate={onNavigate} />
      ))}
      {alerts.map((alert) => (
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
                onClick={() => onNavigate('/knowledge-base?status=needs_decision')}
                aria-label="Review"
              >
                Review
              </Button>
              {alert.conversationId !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(`/threads?id=${alert.conversationId}`)}
                  className="px-0 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                >
                  Open thread
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
