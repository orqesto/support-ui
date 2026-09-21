import type React from 'react';
import { MailWarning, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  CUSTOMER_REPLY_IN_SPAM_KIND,
  type UnansweredOutboundAlert,
} from '@/hooks/useUnansweredOutboundAlerts';

/**
 * "for 9 days" — what the bell says about a thread nobody has answered.
 *
 * ⛔ Returns null rather than a number for anything that is not a positive count of hours.
 * The backend publishes the age it measured WITHOUT clamping it, so a thread whose
 * `created_at` came from a sender's clock can be negative, and rows published before this
 * feature existed carry no age at all. "Unanswered for 0 hours" and "for -6 hours" are both
 * worse than saying nothing: the first describes the worst state in the mildest words, which
 * is the mistake `IngestionDarkSection` documents for "never polled".
 */
const formatUnansweredFor = (ageHours: number | null): string | null => {
  if (ageHours === null || !Number.isFinite(ageHours) || ageHours < 1) return null;
  if (ageHours < 48) return `${Math.floor(ageHours)} hours`;
  return `${Math.floor(ageHours / 24)} days`;
};

/**
 * "Unanswered outbound" — one-sided threads and replies Google filed as spam.
 *
 * ⛔ These rows exist BECAUSE the previous design hid them: a global-admin-only lens nobody
 * opened, which is how a chargeback negotiation and a delivery claim went unowned for two days
 * on a live workspace. Visible in the queue is the primary fix; this is what makes sure nobody
 * has to notice.
 *
 * Extracted from NotificationCenter unchanged when that file hit its 650-line cap. Behaviour is
 * identical — `notificationCenterSurfacesOutbound.test.tsx` covers it and was green across the
 * move.
 */
export const UnansweredOutboundSection = ({
  alerts,
  visible,
  truncated,
  dismiss,
  showLabel,
  SectionLabel,
  setOpen,
}: {
  alerts: UnansweredOutboundAlert[];
  visible: UnansweredOutboundAlert[];
  truncated: boolean;
  dismiss: (id: number) => void;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
  setOpen: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  if (alerts.length === 0) return null;
  /** Rows this section holds but the peek cap does not render. Distinct from `truncated`,
   *  which is the API saying ITS list was cut — those rows never reached the client. */
  const hidden = alerts.length - visible.length;
  return (
    <>
      {showLabel && <SectionLabel>Unanswered outbound</SectionLabel>}
      {visible.map((alert) => {
        const isSpam = alert.kind === CUSTOMER_REPLY_IN_SPAM_KIND;
        // Escalated rows are the ones the backend raised to `critical` — past the threshold
        // and still with no customer message. They are the reason a dismissed alert can be
        // back on this list at all, so they must not look identical to a fresh one.
        const escalated = !isSpam && alert.escalated;
        const unansweredFor = isSpam ? null : formatUnansweredFor(alert.ageHours);
        return (
          <div
            key={alert.id}
            className={
              escalated
                ? 'flex gap-3 items-start p-3 text-sm rounded-lg border bg-destructive/5 border-destructive/40'
                : 'flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border'
            }
          >
            <MailWarning
              className={
                escalated
                  ? 'mt-0.5 w-4 h-4 shrink-0 text-destructive'
                  : 'mt-0.5 w-4 h-4 shrink-0 text-warning'
              }
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium break-words text-foreground">
                {isSpam
                  ? 'Customer replies were filed as spam'
                  : // ⛔ The escalated sentence names the ELAPSED TIME, not a bigger adjective.
                    // "Still" plus a duration is what tells an operator this is the same thread
                    // they saw last week; "Urgent" would just be louder.
                    escalated && unansweredFor
                    ? `Still unanswered after ${unansweredFor}`
                    : 'No customer message in this thread'}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {isSpam
                  ? `${typeof alert.recovered === 'number' ? `${alert.recovered} ` : ''}recovered from the mailbox spam folder — check the mailbox filter`
                  : escalated
                    ? 'We sent, nobody replied, and nobody here has picked it up since. This alert came back because the thread got older, not because anything changed.'
                    : unansweredFor
                      ? `We sent ${unansweredFor} ago, nobody replied, and no one has picked it up`
                      : 'We sent, nobody replied, and no one has picked it up'}
              </p>
              {!isSpam && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/messages/${alert.entityId}`);
                  }}
                  className="px-0 mt-1 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                >
                  Open thread
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss(alert.id)}
              aria-label="Dismiss this alert"
              title={
                isSpam
                  ? 'Dismiss — it returns if the filter eats another reply'
                  : // ⛔ Honest about what dismissal does here, and it was not before: it is
                    // NOT final. The sweep re-announces a still-unanswered thread after its
                    // re-alert window and escalates it past the critical threshold, which
                    // un-hides a dismissal on its own.
                    'Dismiss — the thread stays in the queue, and this returns while the customer is still unanswered'
              }
              className="p-1 h-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })}
      {(hidden > 0 || truncated) && (
        // Capped like the learning sections. This panel is one `max-h-96`
        // scroller and the shared notifications page holds 20 rows, so an
        // uncapped section can push the SLA breaches below it out of sight.
        //
        // ⛔ Deliberately says nothing about WHERE the rest are. It used to read
        // "more in the inbox, badged Awaiting customer" — true only for the
        // one-sided kind. A `customer_reply_in_spam` alert is keyed on the
        // MAILBOX: it has no inbox row and no badge, so that sentence sent the
        // reader to look for something that does not exist. Sorting (see the
        // hook) puts the urgent kind in the visible five instead.
        <p className="px-3 pb-1 text-xs text-muted-foreground">
          {hidden > 0
            ? `+${hidden}${truncated ? ' or more' : ''} not shown`
            : // Nothing is hidden by the CAP here, but the endpoint said its own list was
              // truncated, so what this section holds is still a floor. Saying "+0 or more
              // not shown" — which is what taco rendered on 2026-09-10 — reads as a broken
              // counter and sends the reader after rows this section does not know about.
              // No row count is claimed, because there is no honest one to claim.
              'There may be more — the notification list is capped'}
        </p>
      )}
    </>
  );
};
