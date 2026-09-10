import type React from 'react';
import { MailWarning, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { IngestionGapAlert } from '@/hooks/useIngestionGapAlerts';

/**
 * Minutes of clock skew, said the way a person would. Never "1500 minutes": the number that
 * matters is "a day ahead", and the raw figure is what made the taco checkpoint unreadable in
 * the logs. Whole units only — a gap is not a stopwatch.
 */
export const formatMinutesAhead = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
};

/**
 * "Mail may be missing" — the only section in the bell about mail we do NOT have.
 *
 * ⛔ Rendered FIRST among the fault sections, above unanswered outbound and the AI alerts, and
 * the order is the point: everything else here can be found later by looking harder. This
 * cannot. Taco, 2026-09-08: nine hours of a live client mailbox, invisible for fourteen hours
 * behind a healthy-looking `failed: 0`.
 *
 * Extracted from NotificationCenter because that file hit its 650-line cap — no behaviour
 * change; the section renders exactly as it did inline.
 */
export const IngestionGapSection = ({
  alerts,
  dismiss,
  showLabel,
  SectionLabel,
}: {
  alerts: IngestionGapAlert[];
  dismiss: (id: number) => void;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
}) => {
  if (alerts.length === 0) return null;
  return (
    <>
      {showLabel && <SectionLabel>Mail may be missing</SectionLabel>}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
        >
          <MailWarning className="mt-0.5 w-4 h-4 shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-medium break-words text-foreground">
              {/* ⛔ The backend's own per-cause title, not one sentence for three different events.

                  Only `checkpoint_ahead` means a window was skipped; `cannot_resume` loses nothing

                  (the checkpoint is held) and `day_too_large` is a listing cap. A single hardcoded

                  headline told an operator mail was lost when it was not. It is a whole sentence,

                  so the mailbox goes on its own line rather than being dashed onto the end. */}

              {alert.title ?? 'Mail may be missing'}
            </p>

            <p className="mt-0.5 break-words text-foreground">{alert.mailbox}</p>
            <p className="mt-0.5 text-muted-foreground">
              {/* ⚠️ Reads correctly for every state the row can reach. `cause` is not always
                  skew, and `minutesAhead` is null when it is not — so the skew clause is
                  conditional rather than always rendered with a possibly-null number. A `0` is
                  a real value the hook preserves, and "0 minutes in the future" is not English,
                  so it takes the generic sentence too. */}
              {alert.cause === 'checkpoint_ahead'
                ? alert.minutesAhead !== null && alert.minutesAhead > 0
                  ? `This mailbox's sync position was ${formatMinutesAhead(alert.minutesAhead)} in the future, so mail arriving in that window was never fetched.`
                  : "This mailbox's sync position was in the future, so mail arriving in that window was never fetched."
                : alert.cause === 'day_too_large'
                  ? 'One day held more messages than a single sync can list, and the window cannot be narrowed further \u2014 raise this source\u2019s page limits.'
                  : alert.cause === 'cannot_resume'
                    ? 'The sync cannot work out where to resume, so it re-lists the same window every poll. Nothing is lost \u2014 but nothing older is reached either.'
                    : 'Mail arriving in this window may not have been fetched.'}
            </p>
            {alert.window && (
              <p className="mt-0.5 font-mono text-xs break-words text-muted-foreground">
                {alert.window}
              </p>
            )}
            {alert.recovery && (
              <p className="mt-1 text-xs text-muted-foreground">{alert.recovery}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss(alert.id)}
            aria-label="Dismiss this alert"
            // ⛔ Says "not now", never "the mail is accounted for". Dismissing changes nothing
            // about the gap; only the checkpoint healing does.
            title="Dismiss — records that you have checked this window; a NEW gap is shown again"
            className="p-1 h-auto text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </>
  );
};
