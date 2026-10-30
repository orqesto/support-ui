/**
 * Mark imported mail read + label it in the source mailbox (support-service#1229).
 *
 * Stored on the source config as `markImported: { enabled, label }` — under `email` for an IMAP
 * source, under `gmail` for a Gmail one. Off unless the customer turns it on; the label defaults
 * to "Odly". A Gmail source can use it only once its Google grant includes `gmail.modify`, which
 * Odly does not request yet: the backend stores the grant's scopes as `gmail.grantedScopes`.
 */
import type { MarkImportedWarning } from '@/services/integrations.service';

export type MarkImportedSetting = { enabled: boolean; label?: string };

export const DEFAULT_MARK_IMPORTED_LABEL = 'Odly';
export const MARK_IMPORTED_LABEL_MAX = 100;
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

/** The stored setting, tolerating anything an older or hand-edited config holds. */
export const readMarkImported = (raw: unknown): MarkImportedSetting => {
  if (typeof raw !== 'object' || raw === null) return { enabled: false };
  const { enabled, label } = raw as { enabled?: unknown; label?: unknown };
  return {
    enabled: enabled === true,
    ...(typeof label === 'string' ? { label } : {}),
  };
};

/**
 * The setting as saved. The label is always sent (blank = the server's default): the Gmail edit is
 * a PATCH the server deep-merges, so leaving the key out would keep the old label.
 */
export const toSavedMarkImported = (
  setting: MarkImportedSetting
): Required<MarkImportedSetting> => ({
  enabled: setting.enabled,
  label: setting.label?.trim() ?? '',
});

/** Whether a Gmail source's stored grant allows modifying mail (the masked list config). */
export const gmailCanModify = (config: unknown): boolean => {
  const gmail = (config as { gmail?: { grantedScopes?: unknown } } | null)?.gmail;
  return (
    typeof gmail?.grantedScopes === 'string' &&
    gmail.grantedScopes.split(/\s+/).includes(GMAIL_MODIFY_SCOPE)
  );
};

export const describeMarkImportedWarning = (warning: MarkImportedWarning): string =>
  warning.status === 'label_unsupported'
    ? 'This mail server does not accept new labels, so imported messages are marked read without one.'
    : `Imported messages could not be marked read or labelled in the mailbox${
        warning.error ? `: ${warning.error}` : '.'
      } Odly still imports them and retries on the next check.`;
