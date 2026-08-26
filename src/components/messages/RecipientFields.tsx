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
  const ccCount = parseTypedAddresses(draft.cc).length;
  const bccCount = parseTypedAddresses(draft.bcc).length;

  /**
   * Reopening shows whichever of Cc/Bcc actually holds an address.
   *
   * Without this, collapsing and reopening would present an empty-looking form that is still
   * addressing people — the fields are hidden by local state while their values live in the
   * parent's draft. The summary line says so too; this makes the expanded view agree with it.
   */
  const expand = () => {
    if (ccCount > 0) setShowCc(true);
    if (bccCount > 0) setShowBcc(true);
    setExpanded(true);
  };

  /** Empty the field AND hide it. Hiding a populated one would conceal a live recipient. */
  const clearAndHide = (field: 'cc' | 'bcc') => {
    onChange({ ...draft, [field]: '' });
    if (field === 'cc') setShowCc(false);
    else setShowBcc(false);
  };

  if (!expanded) {
    return (
      <div className="flex items-center gap-1.5 px-2 pt-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          to <span className="text-foreground">{draft.to.trim() || defaultTo}</span>
        </span>
        {/* Collapsing keeps whatever was typed — the draft belongs to the parent — so the
            summary has to say that Cc/Bcc are populated. Hiding the fields while still
            addressing people the agent can no longer see is the one outcome this must not
            have, and Bcc especially: nobody on the thread can reveal it for us. */}
        {ccCount > 0 && (
          <span className="text-foreground">
            · cc {ccCount}
          </span>
        )}
        {bccCount > 0 && (
          <span className="text-foreground">
            · bcc {bccCount}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={expand}
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
        {/* There was no way back. Opening this was a one-way door, so a mis-click left three
            fields wedged open above the composer for the rest of the reply. Collapsing keeps
            every address — see the summary line, which reports what is still set. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          disabled={disabled}
          aria-label="Collapse recipient fields"
          className="h-auto px-1 py-0 text-xs"
        >
          Done
        </Button>
      </div>
      {showCc && (
        <div className="flex items-center gap-1">
          <Input
            value={draft.cc}
            onChange={(event) => onChange({ ...draft, cc: event.target.value })}
            placeholder="Cc"
            disabled={disabled}
            aria-label="Cc"
            className="h-7 flex-1 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearAndHide('cc')}
            disabled={disabled}
            aria-label="Remove Cc"
            className="h-auto px-1 py-0 text-xs"
          >
            ×
          </Button>
        </div>
      )}
      {showBcc && (
        <div className="flex items-center gap-1">
          <Input
            value={draft.bcc}
            onChange={(event) => onChange({ ...draft, bcc: event.target.value })}
            placeholder="Bcc — hidden from the other recipients"
            disabled={disabled}
            aria-label="Bcc"
            className="h-7 flex-1 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearAndHide('bcc')}
            disabled={disabled}
            aria-label="Remove Bcc"
            className="h-auto px-1 py-0 text-xs"
          >
            ×
          </Button>
        </div>
      )}
      {invalid.length > 0 && (
        <p className="text-xs text-destructive">
          Doesn&apos;t look like an email address: {invalid.join(', ')}
        </p>
      )}
    </div>
  );
};
