/**
 * The idempotency keys of replies THIS tab sent, so the `message:replied` echo of our own send
 * does not reload the thread, the open message, the list and the board a second time — the send
 * path already did all of that when the request returned.
 *
 * The backend echoes the key it was sent (`idempotencyKey` on `message:replied`). An echo without
 * one (an older backend) or with a key we never sent (another agent, another tab of ours) is not
 * ours, and reloads as before.
 *
 * Module-level on purpose: the thread view and the page that hosts it both listen to the echo.
 * Bounded: a tab that sends all day keeps only the latest few keys.
 */
const MAX_KEYS = 32;
const keys: string[] = [];

/** Record a key BEFORE the request goes out: the echo can arrive before the HTTP answer. */
export const rememberOwnSend = (key: string): void => {
  if (keys.includes(key)) return;
  keys.push(key);
  if (keys.length > MAX_KEYS) keys.splice(0, keys.length - MAX_KEYS);
};

/** A send that failed: an echo for it (the server did deliver) must reload as anyone's would. */
export const forgetOwnSend = (key: string): void => {
  const index = keys.indexOf(key);
  if (index !== -1) keys.splice(index, 1);
};

/** True when a `message:replied` payload carries a key this tab sent. */
export const isOwnSendEcho = (payload: unknown): boolean => {
  const key = (payload as { idempotencyKey?: unknown } | null | undefined)?.idempotencyKey;
  return typeof key === 'string' && key.length > 0 && keys.includes(key);
};

/** Tests only. */
export const resetOwnSends = (): void => {
  keys.length = 0;
};
