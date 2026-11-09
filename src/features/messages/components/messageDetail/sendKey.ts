import type { MutableRefObject } from 'react';

/**
 * An idempotency key kept after a failed send, with the payload it was minted for.
 *
 * The BE dedups on (workspace, key): a repeated key returns the send it already accepted and sends
 * nothing. So a kept key may only ride on a resend of the SAME payload (a true retry, where a
 * success-but-timeout must dedup); a different reply or template sent with it would never go out.
 */
export interface KeptSendKey {
  key: string;
  payload: string;
}

/** The key for this payload: the kept one when it was minted for the same payload, else a new one. */
export function keyForPayload(ref: MutableRefObject<KeptSendKey | null>, payload: string): string {
  if (ref.current?.payload !== payload) ref.current = { key: crypto.randomUUID(), payload };
  return ref.current.key;
}

/** A file's identity for the payload — the same picked file compares equal across a retry. */
export const fileIdentity = (file: File) => [file.name, file.size, file.type, file.lastModified];
