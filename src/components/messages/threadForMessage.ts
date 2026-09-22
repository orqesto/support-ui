/**
 * Which loaded thread does the open message belong to?
 *
 * The page records the open conversation's `threadId` when a row is CLICKED. Opened any other
 * way — a deep link, a page reload, the browser's back button — nothing recorded it, so J/K had
 * no starting point and did nothing, and a status change fell back to a full board refetch
 * instead of moving the card (owner-visible: "J/K do nothing after opening a thread from a link").
 *
 * A `Message` carries no threadId, so the only honest link is the message the thread itself
 * exposes: its latest message, or its latest INCOMING one (the id the list prefers when opening).
 * A message deeper in a thread matches neither — then this returns null and the caller keeps the
 * old behaviour rather than guessing a neighbouring thread.
 */
export const threadIdForMessage = <
  T extends {
    threadId: string;
    latestMessage: { id: number } | null;
    latestIncomingMessage: { id: number } | null;
  },
>(
  threads: readonly T[],
  messageId: number | null | undefined
): string | null => {
  if (messageId === null || messageId === undefined) return null;
  const match = threads.find(
    (thread) =>
      thread.latestMessage?.id === messageId || thread.latestIncomingMessage?.id === messageId
  );
  return match?.threadId ?? null;
};
