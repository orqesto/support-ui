import { Tooltip } from '@/components/ui/Tooltip';
import type { MessageRecipients } from '@/types';

/**
 * "Received at info@coresarms.info" — which of our addresses a message was
 * actually delivered to.
 *
 * A mailbox answers to more than one address, so the integration's own name
 * cannot answer this; only the message's To/Cc can. Everything ingested before
 * the BE began recording it has no value at all, which is why this renders
 * nothing rather than an empty row when `recipients` is missing: "we don't know"
 * must not look like "sent to nobody".
 */

/**
 * Read a recipients value off an API payload without trusting its shape.
 *
 * Returns null for absent, malformed, or entirely-empty values so callers get
 * one "nothing to show" case instead of three. The FE ships from main on merge
 * while the BE ships separately, so this field is missing from live payloads
 * until the BE catches up — reaching into `.to` directly is the shape of bug
 * that white-screens a page during the gap.
 */
export const parseRecipients = (value: unknown): MessageRecipients | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const asList = (field: unknown): string[] =>
    Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string') : [];
  const parsed = { to: asList(raw.to), cc: asList(raw.cc), bcc: asList(raw.bcc) };
  if (parsed.to.length === 0 && parsed.cc.length === 0 && parsed.bcc.length === 0) return null;
  return parsed;
};

/** Every address, in header order, for the tooltip and the detail view. */
const allAddresses = (recipients: MessageRecipients): string[] => [
  ...recipients.to,
  ...recipients.cc,
  ...recipients.bcc,
];

type ReceivedAtAddressesProps = {
  recipients: unknown;
  /**
   * `card` is the one-line form for the inbox list and kanban: it shows the
   * first address and a "+N" for the rest, with the full set in a tooltip. A
   * five-recipient thread would otherwise push the card's other rows out of
   * shape.
   * `detail` lists To/Cc/Bcc in full, the way a mail client does.
   */
  variant?: 'card' | 'detail';
  className?: string;
};

export const ReceivedAtAddresses = ({
  recipients,
  variant = 'card',
  className,
}: ReceivedAtAddressesProps) => {
  const parsed = parseRecipients(recipients);
  if (!parsed) return null;

  const addresses = allAddresses(parsed);

  if (variant === 'card') {
    const [first, ...rest] = addresses;
    const label = rest.length > 0 ? `${first} +${rest.length}` : first;
    return (
      <Tooltip content={<AddressBreakdown recipients={parsed} />} size="sm">
        <span
          className={`inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground ${className ?? ''}`}
        >
          <span className="shrink-0">to</span>
          <span className="truncate">{label}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <div className={`text-xs text-muted-foreground ${className ?? ''}`}>
      <AddressBreakdown recipients={parsed} />
    </div>
  );
};

/**
 * To/Cc/Bcc as separate labelled rows. Bcc appears here at all because a shared
 * support inbox has to be able to answer "who else received this" after the
 * send — it is recorded on our own outbound messages, and is never present on
 * inbound mail, where a blind copy is unrecoverable by definition.
 */
const AddressBreakdown = ({ recipients }: { recipients: MessageRecipients }) => (
  <div className="space-y-0.5">
    {(
      [
        ['To', recipients.to],
        ['Cc', recipients.cc],
        ['Bcc', recipients.bcc],
      ] as const
    )
      .filter(([, list]) => list.length > 0)
      .map(([label, list]) => (
        <div key={label} className="flex gap-1.5">
          <span className="shrink-0 font-medium">{label}</span>
          <span className="break-all">{list.join(', ')}</span>
        </div>
      ))}
  </div>
);
