/**
 * Why a switched-off (`enabled: false`) message source is not syncing, as far as the row tells:
 * - `awaiting_review` — a Gmail mailbox never polled (`lastCheckAt: null`): connected and saved
 *   paused until its message count is reviewed and the sync started;
 * - `paused` — a source that has been polled before and was switched off (a person paused it);
 * - `unknown` — no `lastCheckAt` on the row, or a source of another kind that was never polled.
 * Null for a source that is on. Polls stamp `lastCheckAt` only since 2026-09, so a mailbox paused
 * before then and never polled since reads `awaiting_review`. The backend sends `lastCheckAt` on
 * every message source it lists (a plain column of the row); absent is read as not known.
 * Its own file, not integrations.service: tests that mock that module would lose it.
 */
export const pausedSourceState = (integration: {
  type: string;
  enabled: boolean;
  lastCheckAt?: string | null;
}): 'awaiting_review' | 'paused' | 'unknown' | null => {
  if (integration.enabled) return null;
  if (typeof integration.lastCheckAt === 'string') return 'paused';
  if (integration.lastCheckAt === null && integration.type === 'gmail') return 'awaiting_review';
  return 'unknown';
};
