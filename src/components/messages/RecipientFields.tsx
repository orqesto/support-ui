import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * To / Cc / Bcc for the composer.
 *
 * Collapsed by default and showing nothing at all until the agent asks for it:
 * the overwhelmingly common reply goes to the requester and needs no addressing
 * decision, and a permanently-open row of three fields turns that into one.
 *
 * Cc and Bcc reveal independently, the way a mail client does. Bcc is a
 * deliberate act with a consequence the other recipients cannot see, so it does
 * not share a toggle with Cc.
 */

/** Split what the agent typed. Commas and whitespace both separate. */
export const parseTypedAddresses = (value: string): string[] =>
  value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Deliberately permissive — `x@y` passes. This only exists to catch a typo
 * before a round-trip; the authority is the server, which validates every
 * address and caps the list. A strict regex here would reject valid addresses
 * (quoted local parts, new TLDs) that the server accepts.
 */
export const looksLikeAddress = (value: string): boolean => /^[^\s@]+@[^\s@]+$/.test(value);

export type RecipientDraft = {
  to: string;
  cc: string;
  bcc: string;
};

export const emptyRecipientDraft = (): RecipientDraft => ({ to: '', cc: '', bcc: '' });

/**
 * Turn the draft into what the API takes. Empty fields are omitted rather than
 * sent as `[]`: an absent `to` means "the requester", which is not the same
 * statement as "no recipients".
 */
export const draftToRecipients = (
  draft: RecipientDraft
): { to?: string[]; cc?: string[]; bcc?: string[] } => {
  const to = parseTypedAddresses(draft.to);
  const cc = parseTypedAddresses(draft.cc);
  const bcc = parseTypedAddresses(draft.bcc);
  return {
    ...(to.length > 0 && { to }),
    ...(cc.length > 0 && { cc }),
    ...(bcc.length > 0 && { bcc }),
  };
};

/** Every address that doesn't look like one, for a pre-send warning. */
export const invalidAddresses = (draft: RecipientDraft): string[] =>
  [draft.to, draft.cc, draft.bcc]
    .flatMap(parseTypedAddresses)
    .filter((address) => !looksLikeAddress(address));

type RecipientFieldsProps = {
  draft: RecipientDraft;
  onChange: (draft: RecipientDraft) => void;
  /** Shown as the To placeholder when the agent has typed nothing. */
  defaultTo: string;
  disabled?: boolean;
};

export const RecipientFields = ({
  draft,
  onChange,
  defaultTo,
  disabled,
}: RecipientFieldsProps) => {
  const [expanded, setExpanded] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const invalid = invalidAddresses(draft);

  if (!expanded) {
    return (
      <div className="flex items-center gap-1.5 px-2 pt-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          to <span className="text-foreground">{draft.to.trim() || defaultTo}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          className="h-auto px-1 py-0 text-xs"
        >
          Edit recipients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 pt-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={draft.to}
          onChange={(event) => onChange({ ...draft, to: event.target.value })}
          placeholder={defaultTo}
          disabled={disabled}
          aria-label="To"
          className="h-7 flex-1 text-xs"
        />
        {!showCc && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowCc(true)}
            disabled={disabled}
            className="h-auto px-1 py-0 text-xs"
          >
            Cc
          </Button>
        )}
        {!showBcc && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowBcc(true)}
            disabled={disabled}
            className="h-auto px-1 py-0 text-xs"
          >
            Bcc
          </Button>
        )}
      </div>
      {showCc && (
        <Input
          value={draft.cc}
          onChange={(event) => onChange({ ...draft, cc: event.target.value })}
          placeholder="Cc"
          disabled={disabled}
          aria-label="Cc"
          className="h-7 text-xs"
        />
      )}
      {showBcc && (
        <Input
          value={draft.bcc}
          onChange={(event) => onChange({ ...draft, bcc: event.target.value })}
          placeholder="Bcc — hidden from the other recipients"
          disabled={disabled}
          aria-label="Bcc"
          className="h-7 text-xs"
        />
      )}
      {invalid.length > 0 && (
        <p className="text-xs text-destructive">
          Doesn&apos;t look like an email address: {invalid.join(', ')}
        </p>
      )}
    </div>
  );
};
