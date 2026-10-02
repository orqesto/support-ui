import type React from 'react';
import { Gauge, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatUtcAndLocal, formatUtcDateAndLocal } from '@/lib/utcClock';
import { isNoLongerInForce, isPastReset, type TokenLimitAlert } from '@/hooks/useTokenLimitAlerts';

// Re-exported so the bell imports its section and hook in one line (it sits at its line cap).
export { useTokenLimitAlerts } from '@/hooks/useTokenLimitAlerts';

const BUCKET_WORDS: Record<string, string> = {
  kb: 'KB processing',
  regular: 'regular work',
};

/** "Resets at 00:00 UTC (02:00 your time)." — the one time style for daily limits. */
export const describeReset = (resetsAt: string | null): string | null => {
  const at = formatUtcAndLocal(resetsAt);
  return at ? `Resets at ${at}.` : null;
};

/**
 * What a limit change did to the work a released notice paused, from the backend's own fields
 * (`partial`, `releaseKind`) — the backend writes both with every KB release (markKbLimitNoticeReleased),
 * and the backend from before the limits has no limit notice at all.
 */
export const describeRelease = (alert: TokenLimitAlert): string => {
  // A REGULAR notice released (be round 12): its own words, never the KB mining ones below —
  // `releaseKind`, if sent, describes KB mining and is not read here. Its effect resumes as soon
  // as the gate re-reads the limit — for NEW mail only: mail sorted during the stop is not re-run
  // (BE `regularLimitReleasedEffect`; its UTC-only time is left out, the footer says it). A
  // partial flag (not expected for regular) is still said (FE audit pass 13, MED).
  if (alert.bucket === 'regular') {
    return `AI drafts, auto-replies and widget answers run again for new mail. Mail the local model sorted while the limit was reached is not re-run now; it may be analysed again with AI after the reset, best effort.${
      alert.releasePartial === true ? ' Some work may still wait for the reset.' : ''
    }`;
  }
  if (alert.bucket !== 'kb') {
    return (
      alert.effect ?? 'A limit setting changed, and this limit no longer stops this workspace.'
    );
  }
  const nightly = 'Knowledge-base consolidation makes proposals again from its next nightly run.';
  if (alert.releaseKind === 'notice_only') {
    return alert.releasePartial
      ? `No paused knowledge-base mining was found to continue, though the search stopped early: some may still wait for the reset. ${nightly}`
      : `No paused knowledge-base mining was waiting here. ${nightly}`;
  }
  return alert.releasePartial
    ? `Paused knowledge-base mining was queued to continue, though some may still wait for the reset (not all of it could be released at once). ${nightly}`
    : `Paused knowledge-base mining was queued to continue. ${nightly}`;
};

/**
 * "Daily AI limit reached" in the bell (workspace admins). The backend's own sentence says what
 * stopped; a measured-only limit says nothing was stopped. Numbers are shown when present and
 * never invented when not.
 */
export const TokenLimitSection = ({
  alerts,
  dismiss,
  now,
  showLabel,
  SectionLabel,
}: {
  alerts: TokenLimitAlert[];
  dismiss: (id: number) => void;
  /** Accepted so the bell can spread the hook's result; not used here. */
  refresh?: () => void;
  badged?: number;
  /** The hook's clock: moves at each reset, so a notice turns past-tense on time. */
  now?: number;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
}) => {
  if (alerts.length === 0) return null;
  return (
    <>
      {showLabel && <SectionLabel>AI limits</SectionLabel>}
      {alerts.map((alert) => {
        const words = BUCKET_WORDS[alert.bucket] ?? 'AI work';
        // An earlier day's notice: the limit has reset since, so nothing in it is stopping work
        // now — past tense, and the backend's present-tense "what stopped" line is left out.
        const clock = now ?? Date.now();
        const past = isPastReset(alert, clock);
        // A limit save released what this notice paused: not a pause still in force — so none of
        // its present-tense lines (the backend's "what stopped", "ask to raise it"). Still badged
        // (`inForce`) when the release was partial: some work may wait for the reset.
        const released = formatUtcDateAndLocal(alert.releasedAt);
        // BE R18: the release's own check time (`releasedAt` is taken after the promotes); the
        // backend writes it with every `releasedAt`.
        const checked = formatUtcDateAndLocal(alert.checkedAt);
        const inForce = !isNoLongerInForce(alert, clock);
        const over = past || released !== null;
        const figures =
          alert.spent !== null && alert.limit !== null
            ? `${alert.spent.toLocaleString()} of ${alert.limit.toLocaleString()} tokens`
            : null;
        const reset = describeReset(alert.resetsAt);
        return (
          <div
            key={alert.id}
            className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
          >
            <Gauge
              className={`mt-0.5 w-4 h-4 shrink-0 ${
                !inForce
                  ? 'text-muted-foreground'
                  : released
                    ? 'text-warning'
                    : alert.enforced
                      ? 'text-destructive'
                      : 'text-warning'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium break-words text-foreground">
                {past
                  ? `Daily AI limit for ${words} was reached on an earlier day`
                  : released
                    ? `Daily AI limit for ${words} was reached; it no longer ${
                        alert.bucket === 'kb' ? 'pauses' : 'stops'
                      } this workspace`
                    : (alert.title ?? `Daily AI limit for ${words} reached`)}
              </p>
              {figures && (
                <p className="mt-0.5 text-muted-foreground">
                  {/* The figures are the notice's snapshot, not a live count: said as such. */}
                  {past
                    ? `${figures} were used that day when the limit was reached.`
                    : `${figures} used today when the limit was reached.`}
                </p>
              )}
              {!past && released && (
                <p className="mt-0.5 text-muted-foreground">{describeRelease(alert)}</p>
              )}
              {!over && alert.enforced && alert.effect && (
                <p className="mt-0.5 text-muted-foreground">{alert.effect}</p>
              )}
              {!over &&
                (alert.enforced ? (
                  // Workspace admins read this; only the platform administrator (console › AI
                  // Spend) can change a daily limit, so "raise it" must say who can.
                  <p className="mt-0.5 text-muted-foreground">
                    Only your platform administrator can change this limit — ask them to raise it if
                    this work is expected.
                  </p>
                ) : (
                  // Measured only: nothing stopped, so there is nothing to raise. The backend's
                  // own sentence here tells THIS reader to raise a limit they cannot edit.
                  <p className="mt-0.5 text-muted-foreground">
                    Nothing has been stopped: this workspace runs on its own AI key and the limit is
                    only measured. If this spend is not expected, tell your platform administrator.
                  </p>
                ))}
              {past ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The limit has reset since; this notice is only a record.
                </p>
              ) : released ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/* BE round 13: a release found by the gate's own re-check (its time is when it
                      NOTICED, BE round 14) or, since BE R15, by a save whose previous settings did
                      not stop the workspace or could not be read — regular rows, and since BE R16
                      KB rows too (the same field, read for either bucket). The BE does not record
                      WHY it is no longer enforced, so, like the BE's "(checked at …)", no cause is
                      claimed (FE audit pass 15, LOW; comment pass 16, NIT). */}
                  {/* BE R18 LOW-1: the time is when the release was CHECKED, not when the
                      setting was saved — "changed at" named the wrong instant; as the backend
                      now says, "checked at …" (no nested parentheses beside "your time"). */}
                  {alert.releaseCause === 'no_longer_enforced'
                    ? `Checked at ${checked}`
                    : `A limit setting changed; checked at ${checked}`}
                  {inForce
                    ? `. ${reset ?? 'The limit resets at 00:00 UTC.'}`
                    : '; this notice is only a record.'}
                </p>
              ) : (
                reset && <p className="mt-0.5 text-xs text-muted-foreground">{reset}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss(alert.id)}
              aria-label="Dismiss this alert"
              // A dismissed notice comes back (unread, new details) when the limit is reached
              // again — the same day too (R8 new occurrence), so no "today"/"next day" claim.
              title="Dismiss — hides this notice until the limit is reached again"
              className="p-1 h-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })}
    </>
  );
};
