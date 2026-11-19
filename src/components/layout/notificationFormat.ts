/**
 * "45m over", "2h over", "1h 30m over" — an SLA breach's overrun. Moved out of
 * NotificationCenter unchanged when that file reached its 650-line cap.
 */
export const formatBreachAmount = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m over`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m over` : `${hours}h over`;
};

/**
 * How far over its SLA a breach is NOW. Since 1.1.329 the server stores when the breached wait
 * started and no longer rewrites the row every 5 minutes, so the bell counts the minutes itself:
 * minutes since `waitStartedAt` minus `targetMinutes`, rounded as the server rounds them. A row
 * without both (a recorded breach with fixed minutes, a row written before 1.1.329, an older
 * server) shows the stored `breachAmount`. Never less than the stored figure, so a clock running
 * behind the server's cannot shrink a breach.
 */
export const minutesOver = (
  breach: { breachAmount: number; details: { waitStartedAt?: string; targetMinutes?: number } },
  now: number
): number => {
  const { waitStartedAt, targetMinutes } = breach.details;
  const startedAt = waitStartedAt ? Date.parse(waitStartedAt) : Number.NaN;
  if (!Number.isFinite(startedAt) || typeof targetMinutes !== 'number') return breach.breachAmount;
  const live = Math.round((now - startedAt) / 60_000) - targetMinutes;
  return Math.max(live, breach.breachAmount);
};
