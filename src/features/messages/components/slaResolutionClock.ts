import type { Message } from '@/types';

/**
 * The thread RESOLUTION clock (owner 2026-11-11/12, backend 0238): from the first unanswered
 * customer message after the latest resolve (`slaResolutionStartedAt`) against the thread's
 * resolution target (`slaResolutionMinutes`). Decided as the backend's filters and alerts decide:
 * breached when now > start + target, at risk in 80–100%.
 *
 * - `undefined`: the backend does not send the field (older than 0238) — no resolution clock shown.
 * - `null`: no resolution clock (none set, finished, spam, or the reply clock does not run).
 *
 * Pure and free of inboxCardHelpers (which imports it): the caller passes whether an SLA clock runs.
 */
export type ClockReading = { elapsed: number; target: number; breached: boolean; atRisk: boolean };

export const resolutionClock = (
  message: Message,
  clockRuns: boolean,
  nowMs: number = Date.now()
): ClockReading | null | undefined => {
  if (message.slaResolutionStartedAt === undefined) return undefined;
  const target = message.slaResolutionMinutes;
  if (!clockRuns || !target || !message.slaResolutionStartedAt) return null;
  // Never negative: a start ahead of this browser's clock reads as "just started".
  const elapsedMs = Math.max(0, nowMs - new Date(message.slaResolutionStartedAt).getTime());
  const breached = elapsedMs > target * 60_000;
  const atRisk = !breached && elapsedMs > target * 0.8 * 60_000;
  return { elapsed: Math.floor(elapsedMs / 60_000), target, breached, atRisk };
};
