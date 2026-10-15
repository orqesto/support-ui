import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CATEGORY_RECORD_LABELS, readCategory } from '@/components/settings/customApi/categories';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePermissions } from '@/hooks/usePermissions';
import type { CustomApiLookupResult } from '@/services/customApiLookup.service';
import { Permission } from '@/types/roles';
import {
  ADMIN_CAN_SEE_DETAILS,
  failureSentence,
  notFoundText,
  referenceNameOf,
  SHAPE_CHANGED_FOR_AGENTS,
  skippedText,
} from './customApiLookupText';
import { projectFields, RowFields, UNCONFIGURED_FIELD_PREVIEW } from './customApiRowFields';
import type { AddOutcome } from './recordInsertOutcome';

/**
 * The ONE lookup result card (2026-10-14), moved out of `CustomApiLookupPanel.tsx` so the records
 * page renders exactly what the panel does. The four outcomes, and why each looks as it does, are
 * described at the top of the panel file.
 */

/**
 * Every status this build renders a body for; anything else falls back to the backend's reason.
 * `satisfies` ties it to the generated union: a status added to the contract and not here fails
 * type-check instead of rendering a blank card (or two bodies, if a branch is added without it).
 */
const KNOWN_STATUSES = {
  ok: true,
  no_match: true,
  no_identity: true,
  failed: true,
  shape_changed: true,
  needs_input: true,
} satisfies Record<CustomApiLookupResult['status'], true>;
const isKnownStatus = (status: string): boolean => Object.hasOwn(KNOWN_STATUSES, status);

/**
 * Why an `unverified` verdict could not be checked, in words that are TRUE for that reason. The
 * old single sentence blamed the integration even when it CAN verify and it was the customer who
 * had no email. An older backend sends no reason ⇒ the neutral fallback, true in every case.
 */
const UNVERIFIED_TEXT: Record<
  NonNullable<CustomApiLookupResult['ownershipReason']> | 'unknown',
  string
> = {
  not_supported:
    'Not confirmed as this customer’s record — this integration cannot verify ownership.',
  no_customer_email:
    'Not confirmed as this customer’s record — this customer has no email address to check it against.',
  check_failed: 'Not confirmed as this customer’s record — the ownership check failed.',
  /**
   * An identity lookup whose answer carried no address to check against. ⛔ Worded as a FACT about
   * the answer, not a doubt about the customer: an order or a parcel rarely echoes an address, so
   * this is the ordinary case for most vendors and must not read like a warning.
   */
  identity_not_returned:
    'Not confirmed as this customer’s record — this system’s answer contains no address to check it against.',
  /**
   * ⛔ A FACT ABOUT OUR SEARCH, NOT ABOUT THE RECORD. The check walks the vendor's answer under
   * bounds; where it hits one it stopped reading, and saying "no address here" would be a claim it
   * did not earn. Before 2026-09-20 an unread row was skipped as though it were empty, which let a
   * matching row elsewhere answer `owned` for it.
   */
  /**
   * ⛔ ABOUT THE TAG, NOT THE ANSWER — and the distinction is not pedantic. Seen on staging
   * 2026-09-20: `name` ("Leanne Graham") was tagged as the customer's address on a vendor that
   * returns the same stranger to everyone, so the check went quiet and the panel told the agent
   * the answer carried no address — while it carried a real one at the next key. An agent cannot
   * act on that sentence; an admin reading this one can.
   */
  tagged_field_has_no_address:
    'Not confirmed as this customer’s record — the field set up as the customer’s address does not hold one. An admin can fix this in the lookup’s settings.',
  check_truncated:
    'Not confirmed as this customer’s record — there was more than we could read, so the check did not finish.',
  unknown: 'Not confirmed as this customer’s record — ownership could not be checked.',
};

/**
 * ⛔ EXPORTED FOR PARITY, not for convenience. CA-6's records page shows the same verdicts, and a
 * page opened from a surface must not rename, recolour or soften what that surface said — the same
 * record must not be "does NOT belong to this customer" in the panel and something gentler on the
 * page. One definition, both surfaces.
 *
 * 2026-10-14: an OWNED record now says so in green — "Belongs to this customer", or "Matches
 * {email}" when the agent looked up as another email, because then the check compared against
 * THAT person, not the ticket's customer.
 */
export const ownershipNotice = (
  ownership: CustomApiLookupResult['ownership'],
  reason?: CustomApiLookupResult['ownershipReason'],
  lookedUpAs?: string | null
): { text: string; className: string; icon: 'check' | 'warn' } | null => {
  switch (ownership) {
    case 'owned':
      return {
        text: lookedUpAs ? `Matches ${lookedUpAs}` : 'Belongs to this customer',
        className: 'bg-success/15 text-success border border-success/40',
        icon: 'check',
      };
    case 'mismatch':
      // ⛔ D38. The owner chose to SHOW a record that is not this customer's rather than strand an
      // agent whose customer wrote from a second address — knowing a guessed number then exposes
      // someone else's data. The flag is the whole mitigation, so it is unmissable and never a
      // muted hint. Every view of one of these is written to the workspace audit log.
      return {
        text: 'This record does NOT belong to this customer. Check before quoting anything from it.',
        className: 'bg-destructive/15 text-destructive border border-destructive/40',
        icon: 'warn',
      };
    case 'unverified':
      // Not an error and not a reassurance: we could not check. Either the vendor cannot list this
      // customer's records at all (a carrier knows a parcel number, not who emailed us) or the
      // check itself failed. Saying nothing here would let it read as confirmed.
      return {
        // `?? 'unknown'` AND the lookup's own fallback: a reason this build does not know yet (a
        // newer backend) must not render as `undefined`.
        text: UNVERIFIED_TEXT[reason ?? 'unknown'] ?? UNVERIFIED_TEXT.unknown,
        className: 'bg-warning/15 text-warning border border-warning/40',
        icon: 'warn',
      };
    default:
      return null;
  }
};

/** Admin-only raw text, behind a press (D1). Not in the DOM until opened. */
const Details = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-0 text-[11px]"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Hide details' : 'Details ▸'}
      </Button>
      {open && <p className="text-[10.5px] text-muted-foreground break-words">{text}</p>}
    </div>
  );
};

interface CardProps {
  result: CustomApiLookupResult;
  busy: boolean;
  /** `card`: this card carries the reference input (thread panel). `page`: the page's box does. */
  referenceInput: 'card' | 'page';
  onRunManual?: (endpointId: number, parameter: string) => void;
  /** L2 P4. Absent where there is no composer to add a note to (the records page). */
  onUseInReply?: (note: string) => AddOutcome;
  /** The email the backend CONFIRMED this run used ("Look up another email"). */
  lookedUpAs?: string | null;
  /** A3: under an identity no-match, when the same connection has a typed-value lookup. */
  referenceHint?: string | null;
  /** The value typed for this card, for an older backend that does not echo `searchedFor`. */
  typedValue?: string;
  /** Extra content under a found record (the records page's "Everything this system returned"). */
  footer?: ReactNode;
}

/**
 * ONE lookup result, as the thread panel, the contact drawer AND the records page show it
 * (2026-10-14). D38 parity: a page opened from a surface must not rename, recolour or soften what
 * that surface said — one component is the only way that stays true.
 */
export const CustomApiResultCard = ({
  result,
  busy,
  referenceInput,
  onRunManual,
  onUseInReply,
  lookedUpAs,
  referenceHint,
  typedValue,
  footer,
}: CardProps) => {
  const { hasPermission } = usePermissions();
  // D1: the same rule the backend strips by. With a newer backend a non-admin never receives the
  // raw text at all; this also keeps an OLDER backend's raw reasons away from agents.
  const canSeeDetails = hasPermission(Permission.MANAGE_INTEGRATIONS);
  // D36: the number found in the CUSTOMER'S message is pre-filled — into a field the agent can
  // overwrite. A suggestion is a suggestion; nothing is sent to a vendor without a press.
  const [value, setValue] = useState(result.suggestions?.[0] ?? '');
  const hasRows = result.status === 'ok' && !!result.rows?.length;
  // ⛔ B2 (2026-10-14): only a FOUND record gets an ownership line. A value that does not exist is
  // nobody's. Computed here as well as on the backend because this frontend reaches production
  // first, and an older backend attaches the list verdict to a not-found too.
  const notice = hasRows
    ? ownershipNotice(result.ownership, result.ownershipReason, lookedUpAs)
    : null;
  const referenceName = referenceNameOf(result.referenceLabel);
  const skipped = result.skippedBecause;
  const notFound = notFoundText(result, typedValue ?? (value.trim() || undefined));
  // ⛔ FALL BACK TO THE ROW'S OWN KEYS. `fieldPaths` DEFAULTS to empty, and the backend returns
  // rows unprojected in that case — so mapping over `fields` alone rendered a BLANK card while
  // holding data, on the commonest configuration state there is. Found by audit pass 2.
  // The `__currency` companions are the projection's own bookkeeping, not vendor fields.
  // ⛔ THE FALLBACK IS CAPPED, AND THAT IS THE POINT. When no fields are configured — the DEFAULT
  // state — the backend returns rows UNPROJECTED. On the measured vendor that is 77 fields
  // including the customer's email, telephone, both addresses, postcode, IP and user-agent.
  // Audit pass 2 replaced a blank card with this fallback; audit pass 3 found that the fallback
  // then dumped all of it into the thread view. Showing a bounded preview and naming the rest is
  // the honest middle: the agent can see there IS data, without the panel becoming a dossier.
  const { fields, fallbackKeys, usingFallback } = projectFields(result);
  /*
    ⛔ Narrowed here, not trusted. The backend sends `category` as a plain string precisely so an
    older or newer deploy cannot make this panel throw — which means a word this build has no label
    for arrives as an ordinary value. `readCategory` turns that into null, and the heading simply
    says what it always said. The file header's FE/BE skew note is the reason this is not a cast.
  */
  const category = readCategory((result as { category?: unknown }).category);

  return (
    // v4 `.k-c`: one card per lookup; a failed one is edged in red so it is found at a glance.
    <div
      data-testid="lookup-card"
      // `minmax(0,1fr)`: the card's one column may shrink to the screen, so its rows wrap or
      // truncate inside it instead of widening it (390 px, 2026-10-14).
      className={`grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg border bg-card px-[9px] py-2 ${
        result.status === 'failed' ? 'border-destructive-line' : 'border-border'
      }`}
    >
      {/* v4 `.k-ch`: the admin's label · the category, then the connection and the row count. */}
      <div className="flex items-baseline gap-1.5 text-[12px] min-w-0">
        <b className="font-semibold text-foreground truncate">{result.label}</b>
        {category && (
          /* ⛔ Beside the admin's own label, never instead of it. The label is what the agents of
             THIS workspace call the lookup ("This customer's orders"); the category is what the
             product knows the records to be. Replacing one with the other would rename a thing
             an admin deliberately named — the parity rule an audit caught on 2026-09-09, where a
             page renamed what the list it was opened from had said. */
          <span className="text-[10.5px] text-faint-foreground whitespace-nowrap">
            · {CATEGORY_RECORD_LABELS[category]}
          </span>
        )}
        <span className="flex-1" />
        <span className="min-w-0 truncate text-[10.5px] text-faint-foreground">
          {result.connectionName}
          {result.status === 'ok' && result.rows?.length
            ? ` · ${
                typeof result.total === 'number' && result.total > result.rows.length
                  ? `${result.rows.length} of ${result.total}`
                  : result.rows.length
              }`
            : ''}
        </span>
      </div>

      {notice && (
        <p className={`text-[11px] rounded px-2 py-1 flex gap-1.5 ${notice.className}`}>
          {notice.icon === 'check' ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          )}
          <span>{notice.text}</span>
        </p>
      )}

      {result.status === 'needs_input' &&
        (referenceInput === 'card' ? (
          // D4: the field is named by what THIS workspace calls the value ("Reference" unset).
          <div className="flex gap-1.5">
            <Input
              size="sm"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={referenceName}
              aria-label={`${referenceName} for ${result.label}`}
              className="text-[11px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] whitespace-nowrap"
              disabled={busy || !value.trim() || !onRunManual}
              onClick={() => onRunManual?.(result.endpointId, value.trim())}
            >
              Look up
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Type the {referenceName} above to check this one.
          </p>
        ))}

      {result.status === 'no_match' && (
        // ⛔ ORDINARY. Plain text, no red, no warning icon — visibly different from a failure, or
        // agents learn to ignore both and a real outage reads as a customer with no records.
        // 2026-10-14 (A3/A4/B3): it names what was searched, or which lookup stopped a chain.
        <div className="space-y-0.5">
          <p className="text-[11px] text-muted-foreground">
            {skipped ? skippedText(skipped) : notFound}
          </p>
          {referenceHint && <p className="text-[11px] text-muted-foreground">{referenceHint}</p>}
        </div>
      )}

      {result.status === 'no_identity' && (
        // ⛔ ORDINARY, like `no_match`: a Telegram or anonymous-widget customer simply has no email
        // to key on. Red here taught agents the same thing as red on a real vendor outage.
        // (An older backend still sends this as `failed`, which renders red — no worse than before.)
        <p className="text-[11px] text-muted-foreground">
          {skipped
            ? skippedText(skipped)
            : (result.reason ?? 'This customer has no email address, so this lookup cannot run.')}
        </p>
      )}

      {!isKnownStatus(result.status) && (
        // A status this build does not know yet — a NEWER backend (this frontend ships from `main`,
        // the backend on a tag, so either can lead). Say what the backend said, muted: never a
        // blank card, and never red for a state this build cannot judge.
        // D1 (2026-10-14): the backend strips raw text only from the states it knows, so an
        // unknown state's reason is shown to admins only.
        <p className="text-[11px] text-muted-foreground">
          {(canSeeDetails ? result.reason : undefined) ??
            'This lookup returned a result this version cannot display.'}
        </p>
      )}

      {result.status === 'failed' && (
        /*
          ⛔ D1 (2026-10-14): an agent reads a sentence per failure CLASS — never the raw reason,
          which can carry API-key hints, Ray IDs, hosts and vendor error text. An admin gets the
          same sentence and the raw text behind Details. The "no longer available" card is about
          our own configuration, says everything in its sentence, and has no details to hide.
        */
        <div className="space-y-0.5">
          {skipped && <p className="text-[11px] text-muted-foreground">{skippedText(skipped)}</p>}
          <p className="text-[11px] text-destructive">
            {failureSentence(result.agentReason, result.connectionName)}
          </p>
          {result.agentReason !== 'unavailable' &&
            (canSeeDetails ? (
              result.reason && <Details text={result.reason} />
            ) : (
              <p className="text-[10.5px] text-muted-foreground">{ADMIN_CAN_SEE_DETAILS}</p>
            ))}
        </div>
      )}

      {result.status === 'shape_changed' && (
        <p className="text-[11px] text-warning">
          {/*
            ⛔ "NO LONGER" IS A CLAIM ABOUT HISTORY, and it is false for the case this status now
            also carries: a lookup whose RECORD LIST was never found never matched in the first
            place. Both readings send the agent to an admin, but only one of them describes what
            happened. ⚠️ An older backend sends no `missingKind` — keep the original wording there
            rather than asserting either.
          */}
          {/* D1 (2026-10-14): the paths are configuration detail; an agent is sent to an admin. */}
          {!canSeeDetails
            ? SHAPE_CHANGED_FOR_AGENTS
            : result.missingKind === 'records'
              ? 'We reached this system but could not find any records in its answer. An admin needs to say where they are.'
              : `This vendor’s response no longer matches what was configured${
                  result.missing?.length ? `: ${result.missing.join(', ')} not found.` : '.'
                }`}
        </p>
      )}

      {result.status === 'ok' &&
        (result.rows?.length ? (
          <div className="space-y-1.5">
            {result.rows.map((row, index) => (
              <RowFields
                key={index}
                row={row}
                fields={fields}
                category={category}
                lookupLabel={result.label}
                ownership={result.ownership}
                onUseInReply={onUseInReply}
              />
            ))}
            {usingFallback && fallbackKeys.length > UNCONFIGURED_FIELD_PREVIEW && (
              <p className="text-[10px] text-muted-foreground">
                No fields chosen for this lookup, so this is a preview of{' '}
                {UNCONFIGURED_FIELD_PREVIEW} of {fallbackKeys.length} fields the vendor returned.
              </p>
            )}
            {/* D19/SC7: the cap is not decorative — say how many actually exist. */}
            {typeof result.total === 'number' && result.total > result.rows.length ? (
              <p className="text-[10px] text-muted-foreground">
                Showing {result.rows.length} of {result.total}.
              </p>
            ) : (
              /*
               * ⛔ The list was cut and the vendor sent no count: without this the agent reads the
               * first N as ALL of them. (Absent from an older backend ⇒ nothing is said, as before.)
               */
              result.more === true && (
                <p className="text-[10px] text-muted-foreground">
                  Showing the first {result.rows.length} — there may be more.
                </p>
              )
            )}
            {footer}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">{notFound}</p>
        ))}
    </div>
  );
};
