import type React from 'react';
import { MailX, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { IngestionDarkAlert } from '@/hooks/useIngestionDarkAlerts';

/**
 * How long a mailbox has been quiet, said the way a person would.
 *
 * Whole units only. "97 minutes" is a stopwatch reading; "2 hours" is the thing an operator
 * decides on. The raw figure is what made the taco checkpoint unreadable in the logs.
 */
export const formatMinutesDark = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
};

/**
 * "This mailbox stopped being polled" — a fault happening RIGHT NOW.
 *
 * ⛔ Deliberately a separate section from "Mail may be missing", not a second row inside it.
 * The two say different things and ask for different actions: a gap is a window we can never
 * go back for and the operator's job is to check it; this is a live condition that the backend
 * is ALREADY fixing by itself. Merging them would put "go check for lost mail" next to "we are
 * restarting it" under one heading.
 *
 * 2026-09-17: 73 minutes dark on a live client. Queues healthy, zero failed jobs, container
 * healthy, `/api/health/status` saying so in plain English the entire time — and a customer
 * chasing a refund as the alerting mechanism.
 */
export const IngestionDarkSection = ({
  alerts,
  dismiss,
  showLabel,
  SectionLabel,
}: {
  alerts: IngestionDarkAlert[];
  dismiss: (id: number) => void;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
}) => {
  if (alerts.length === 0) return null;
  return (
    <>
      {showLabel && <SectionLabel>Mailbox not being polled</SectionLabel>}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
        >
          <MailX className="mt-0.5 w-4 h-4 shrink-0 text-destructive" />
          <div className="flex-1 min-w-0">
            <p className="font-medium break-words text-foreground">
              {/* ⛔ "Not checked", NEVER "no mail received". `minutesSince` measures the time
                  since we last POLLED, not since mail last arrived — a quiet mailbox checked
                  every 5 minutes is perfectly healthy. An earlier draft of this read "No mail
                  collected for 68 minutes", which tells an operator their customers went quiet
                  when the truth is that we stopped looking. Caught auditing this diff.

                  "Never polled" is also a different sentence, not a bigger number. A source that
                  has never run once has never worked at all — the case a newly connected
                  integration hits — and telling an operator it is "0 minutes behind" would
                  describe the worst state in the mildest words. */}
              {alert.neverPolled
                ? 'This mailbox has never been checked'
                : alert.minutesSince !== null
                  ? `Not checked for ${formatMinutesDark(alert.minutesSince)}`
                  : 'This mailbox has stopped being checked'}
            </p>

            <p className="mt-0.5 break-words text-foreground">{alert.mailbox}</p>

            <p className="mt-0.5 text-muted-foreground">
              {/* ⚠️ Says what is ALREADY happening, so the alert does not read as a demand for
                  action that is already under way — except in the one case where it genuinely
                  is. A locked source cannot be fixed by the restart: restarting polling does
                  not clear a lock a previous run still holds, so the watchdog would restart it
                  every 15 minutes for ever while the mailbox stayed dark. */}
              {alert.locked
                ? 'A previous sync never released its lock, so restarting polling will NOT clear it. This one needs a person.'
                : 'Polling is being restarted automatically. If this alert returns, the restart is not fixing it.'}
            </p>

            {alert.neverPolled && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check the connection settings for this source — it has not completed a single sync.
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss(alert.id)}
            aria-label="Dismiss this alert"
            // ⛔ Honest about what dismissal does, and it is the OPPOSITE of the gap alert's.
            // The condition may still be live; the backend escalates warning → critical, which
            // re-surfaces a dismissed row. Saying so is what stops this becoming
            // `one_sided_outbound`, where dismissal is final and four broken threads on taco
            // have no path back to anyone's attention.
            title="Dismiss — if the mailbox stays dark, this comes back"
            className="p-1 h-auto text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </>
  );
};
