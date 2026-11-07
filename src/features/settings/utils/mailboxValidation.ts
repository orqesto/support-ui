/**
 * Client-side mirror of the backend's IMAP field rules
 * (`integrationConfigValidation.ts`).
 *
 * ⚠️ A MIRROR, NOT THE AUTHORITY. The server validates independently and is the thing that
 * actually protects the data — this exists so an admin sees "remove the mailto: prefix" under
 * the field they are typing in, instead of after a round trip. If the two ever disagree, the
 * server wins and the form is the one that is wrong.
 *
 * Kept deliberately as lenient as the backend: it rejects what cannot be right and does NOT
 * require a full RFC address, because plenty of IMAP servers authenticate a bare username
 * with no `@` at all. The connection probe is what decides whether credentials work.
 */

/** Anything of the form `scheme:` at the start — `mailto:`, `http:`, `imap:`. */
const URI_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Why this mailbox value cannot be used, or `null` if it is plausible.
 *
 * Returns `null` for an EMPTY value on purpose: an untouched field is not an error to shout
 * about, it is simply incomplete. `isEmailSourceComplete` covers required-ness.
 */
export const mailboxError = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (URI_SCHEME.test(trimmed)) {
    return 'Remove the "mailto:" prefix — enter just the address, e.g. support@example.com';
  }
  if (/\s/.test(trimmed)) return 'The address cannot contain spaces';
  if ((trimmed.match(/@/g) ?? []).length > 1) return 'The address cannot contain more than one "@"';
  if (trimmed.includes('@') && !/^[^@]+@[^@]+$/.test(trimmed)) {
    return 'The address needs something on both sides of the "@"';
  }
  return null;
};

/** Why this hostname cannot be used, or `null`. Same leniency as the backend. */
export const hostError = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (URI_SCHEME.test(trimmed)) {
    return 'Enter just the hostname, e.g. imap.example.com — not a URL';
  }
  if (/[\s/]/.test(trimmed)) return 'The host cannot contain spaces or slashes';
  return null;
};

/** Why this port cannot be used, or `null`. */
export const portError = (value: number | string): string | null => {
  if (value === '' || value === null || value === undefined) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'Port must be a whole number between 1 and 65535';
  }
  return null;
};

export type EmailSourceFields = {
  host: string;
  port: number | string;
  user: string;
  password: string;
};

/**
 * Can this be submitted at all? Distinct from the per-field errors above: those describe a
 * value that is WRONG, this describes a form that is INCOMPLETE. Save is blocked on both,
 * but only the first should paint a field red while someone is still typing.
 */
export const isEmailSourceComplete = (fields: EmailSourceFields): boolean =>
  fields.host.trim().length > 0 &&
  fields.user.trim().length > 0 &&
  fields.password.length > 0 &&
  String(fields.port).trim().length > 0;

/** Every field-level complaint, so a caller can block Save without re-deriving them. */
export const emailSourceErrors = (fields: EmailSourceFields): string[] =>
  [mailboxError(fields.user), hostError(fields.host), portError(fields.port)].filter(
    (error): error is string => error !== null
  );
