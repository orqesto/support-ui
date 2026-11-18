/**
 * The backend's "No reply needed" thread marker (support-service ai noReplyNeeded.ts, owner
 * 2026-11-17): `metadata.noReplyNeeded = {eventId, at}` — the customer's latest email only thanked
 * or confirmed, so no AI draft was made. The backend keeps it only while that email is the
 * customer's latest (cleared at arrival, after every move, by a stored draft, on unmerge), so the
 * app trusts it and adds no rule of its own beyond what a row or the loaded thread plainly shows.
 * ONE parser for the inbox card and the thread view. A marker of another shape is none.
 */
export const readNoReplyMarker = (
  metadata: Record<string, unknown> | null | undefined
): { eventId: number } | null => {
  const marker = metadata?.noReplyNeeded as { eventId?: unknown } | null | undefined;
  return marker && typeof marker.eventId === 'number' ? { eventId: marker.eventId } : null;
};
