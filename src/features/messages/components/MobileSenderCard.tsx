import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { parseRecipients } from './ReceivedAtAddresses';
import { LABEL } from './messageDetailConstants';

type MobileSenderCardProps = {
  /** "Marta Kowalczyk" from "Marta Kowalczyk <marta@…>"; empty for a bare address. */
  name: string;
  /** The sender's address (or the raw sender when it has none). */
  address: string;
  initials: string;
  /** The message's To/Cc/Bcc as the API sent it — read defensively (parseRecipients). */
  recipients: unknown;
  /** The meta rows (Dept / Assigned / Category / Labels) — the header's own HeaderMetaStrip. */
  children?: ReactNode;
};

/**
 * v4 mobile `.mwho` (M2): on a phone the sender is a card under the subject — avatar, name,
 * address and "Details". Expanded, it lists which of our addresses the message reached (the
 * same To/Cc the desktop "received at" line reads) and then the meta rows, so the phone header
 * stays three short rows tall until the agent asks for more.
 *
 * A Button with aria-expanded over a region rather than <details>: the design system has no
 * disclosure, and a native <summary> is not one of its controls.
 */
export function MobileSenderCard({
  name,
  address,
  initials,
  recipients,
  children,
}: MobileSenderCardProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const parsed = parseRecipients(recipients);
  // "Received at" is the first of OUR addresses on the message — what the desktop line shows
  // before its "+N". To, Cc and Bcc follow only when the message carries them (the desktop
  // tooltip lists all three); never an empty row.
  const addressRows: [string, string][] = parsed
    ? ([
        ['Received at', [...parsed.to, ...parsed.cc, ...parsed.bcc][0] ?? ''],
        ['To', parsed.to.join(', ')],
        ['Cc', parsed.cc.join(', ')],
        ['Bcc', parsed.bcc.join(', ')],
      ].filter(([, value]) => value.length > 0) as [string, string][])
    : [];

  return (
    <section
      data-testid="mobile-sender-card"
      className="mx-4 mt-2.5 rounded-[14px] border border-border bg-raised"
    >
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={`w-full h-auto min-h-[52px] justify-start gap-2.5 py-1.5 pl-3 pr-2.5 rounded-[14px] font-sans font-normal text-left hover:bg-transparent ${open ? 'rounded-b-none border-b border-hair' : ''}`}
      >
        <span
          aria-hidden
          className="grid flex-none place-items-center w-8 h-8 rounded-full border border-border bg-muted font-display text-[11px] font-semibold text-muted-foreground"
        >
          {initials}
        </span>
        <span className="flex flex-col flex-1 min-w-0 leading-tight">
          <b className="text-[14px] font-semibold text-foreground truncate">{name || address}</b>
          {name && address && (
            <span className="text-[12px] text-muted-foreground truncate">{address}</span>
          )}
        </span>
        <span className="text-[12px] text-muted-foreground">Details</span>
        <ChevronDown
          aria-hidden
          data-testid="mobile-sender-chevron"
          className={`flex-none w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      <div id={regionId} role="region" aria-label="Sender details" hidden={!open}>
        {open && (
          <>
            {addressRows.length > 0 && (
              <dl className="pl-3 pt-0.5">
                {addressRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex gap-3 items-center pr-3 py-2 min-h-10 text-[13.5px] border-b border-hair"
                  >
                    <dt className={`${LABEL} flex-none w-[84px] text-muted-foreground`}>{label}</dt>
                    {/* Wraps, never truncates: on a phone there is no hover to read the rest. */}
                    <dd className="ml-auto min-w-0 font-mono text-[12.5px] text-right break-words [overflow-wrap:anywhere] text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {children}
          </>
        )}
      </div>
    </section>
  );
}
