import type React from 'react';
import { BookCheck, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { KbReviewAlert, UseKbReviewAlertsResult } from '@/hooks/useKbReviewAlerts';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';

const describe = (alert: KbReviewAlert): string => {
  const what = alert.entryCount === 1 ? '1 entry' : `${alert.entryCount} entries`;
  const how = alert.capturedVia === 'manual_promote' ? 'added from' : 'saved from';
  const thread = alert.conversationPublicId ?? (alert.subject ? `“${alert.subject}”` : 'a thread');
  return `${what} ${how} ${thread}`;
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
  const { alerts, decide, actingId, error } = review;
  if (alerts.length === 0) return null;
  return (
    <>
      {showLabel && <SectionLabel>Knowledge base review ({alerts.length})</SectionLabel>}
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      {alerts.map((alert) => {
        const acting = actingId === alert.id;
        return (
          <div
            key={alert.id}
            className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
          >
            <BookCheck className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
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
