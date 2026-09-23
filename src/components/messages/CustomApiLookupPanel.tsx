import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCustomApiLookup, useCustomApiLookupAvailability } from '@/hooks/useCustomApiLookup';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { conversationContactService } from '@/services/conversationContact.service';
import type { CustomApiLookupResult } from '@/services/customApiLookup.service';
import { CATEGORY_RECORD_LABELS, readCategory } from '@/components/settings/customApi/categories';
import { LABEL } from './messageDetailConstants';
import { projectFields, RowFields, UNCONFIGURED_FIELD_PREVIEW } from './customApiRowFields';

/**
 * What the connected integrations know about THIS customer (CA-3).
 *
 * ⛔ ONE component, rendered in BOTH the thread's customer tab and the standalone contact drawer.
 * Not two copies of the outcome states: a page opened from a list must not rename, recolour or
 * flatten what that list said, and two copies are two places to fix every future state.
 *
 * The four outcomes are deliberately distinguishable at a glance:
 *   ok            — rows, money with its currency (D23)
 *   no match      — ORDINARY text. A shipping API not knowing a customer who never ordered is the
 *                   commonest case there is, not an error (SC2)
 *   shape changed — TWO readings, told apart by `missingKind` (2026-09-19): `fields` = the rows are
 *                   there but the configured fields have gone, NAMED, so a dead integration is
 *                   never mistaken for a customer we have no data for (SC4b); `records` = we could
 *                   not find the record list at all, which is true of a lookup that never worked —
 *                   so it must not be described as "no longer" matching
 *   failed        — a reason, and the OTHER cards still show their rows (SC3)
 */

/**
 * The note on a thread whose customer has no email (D30: identity lookups key on email only).
 * ⛔ It must not promise a place to type a number: availability is true for identity-only
 * workspaces too, where no lookup takes manual input — and before a press there is no field
 * anywhere, since the input exists only on a `needs_input` card.
 */
export const NO_EMAIL_IDENTITY_NOTE =
  'This customer has no email address, so identity-based lookups cannot run.';

/**
 * Does this sender carry an email an identity lookup can key on? The SAME rule as the backend's
 * `lookupEmail` (customApiLookupService): a real address shape, and not the chat widget's
 * `anonymous@chat-widget.local` placeholder. `includes('@')` alone called that placeholder an
 * email, so the note stayed hidden while every identity card said it could not run.
 * ⛔ A COPY. The source of truth is `isRealCustomerEmail` in the backend's
 * `src/shared/email/customerEmail.ts` (a separate repo) — change both together.
 */
const LOOKUP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const hasLookupEmailIdentity = (value: string): boolean => {
  const email = value.trim();
  return LOOKUP_EMAIL_RE.test(email) && !email.toLowerCase().endsWith('@chat-widget.local');
};

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

interface Props {
  conversationId?: number;
  contactId?: number;
  /** Shown when the customer has no email to key an identity lookup on (D30). */
  identityNote?: string;
  /** Spacing from the host. On the panel's own root, so a hidden panel leaves no gap behind. */
  className?: string;
  /**
   * L2 P4: add a record to the agent's note for the AI draft. Says what happened, so the control can
   * tell the agent instead of the fact quietly vanishing.
   *
   * ⛔ Optional, and the control is not rendered without it. The same panel is used on the
   * contact drawer and the records page, where there is no composer — a button that could not
   * work anywhere it is shown is how an agent learns to stop trusting buttons.
   */
  onUseInReply?: (note: string) => 'added' | 'duplicate' | 'full';
}

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
    'Not confirmed as this customer’s record — the answer was too large to check all of it.',
  unknown: 'Not confirmed as this customer’s record — ownership could not be checked.',
};

/**
 * ⛔ EXPORTED FOR PARITY, not for convenience. CA-6's records page shows the same verdicts, and a
 * page opened from a surface must not rename, recolour or soften what that surface said — the same
 * record must not be "does NOT belong to this customer" in the panel and something gentler on the
 * page. One definition, both surfaces.
 */
export const ownershipNotice = (
  ownership: CustomApiLookupResult['ownership'],
  reason?: CustomApiLookupResult['ownershipReason']
): { text: string; className: string } | null => {
  switch (ownership) {
    case 'mismatch':
      // ⛔ D38. The owner chose to SHOW a record that is not this customer's rather than strand an
      // agent whose customer wrote from a second address — knowing a guessed number then exposes
      // someone else's data. The flag is the whole mitigation, so it is unmissable and never a
      // muted hint. Every view of one of these is written to the workspace audit log.
      return {
        text: 'This record does NOT belong to this customer. Check before quoting anything from it.',
        className: 'bg-destructive/15 text-destructive border border-destructive/40',
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
      };
    default:
      return null;
  }
};

const ResultCard = ({
  result,
  onRunManual,
  busy,
  onUseInReply,
}: {
  result: CustomApiLookupResult;
  onRunManual: (endpointId: number, parameter: string) => void;
  busy: boolean;
  /** L2 P4. Absent where there is no composer to add a note to (the records page). */
  onUseInReply?: (note: string) => 'added' | 'duplicate' | 'full';
}) => {
  // D36: the number found in the CUSTOMER'S message is pre-filled — into a field the agent can
  // overwrite. A suggestion is a suggestion; nothing is sent to a vendor without a press.
  const [value, setValue] = useState(result.suggestions?.[0] ?? '');
  const notice = ownershipNotice(result.ownership, result.ownershipReason);
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
    <div className="rounded border border-border p-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground">
          {result.label}
          {category && (
            /* ⛔ Beside the admin's own label, never instead of it. The label is what the agents of
               THIS workspace call the lookup ("This customer's orders"); the category is what the
               product knows the records to be. Replacing one with the other would rename a thing
               an admin deliberately named — the parity rule an audit caught on 2026-09-09, where a
               page renamed what the list it was opened from had said. */
            <span className={`${LABEL} ml-1.5 font-normal text-muted-foreground`}>
              · {CATEGORY_RECORD_LABELS[category]}
            </span>
          )}
        </p>
        <p className={`${LABEL} text-muted-foreground`}>{result.connectionName}</p>
      </div>

      {notice && (
        <p className={`text-[11px] rounded px-2 py-1 flex gap-1.5 ${notice.className}`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          <span>{notice.text}</span>
        </p>
      )}

      {result.status === 'needs_input' && (
        <div className="flex gap-1.5">
          <Input
            size="sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Record number"
            aria-label={`Record number for ${result.label}`}
            className="text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={busy || !value.trim()}
            onClick={() => onRunManual(result.endpointId, value.trim())}
          >
            Look up
          </Button>
        </div>
      )}

      {result.status === 'no_match' && (
        // ⛔ ORDINARY. Plain text, no red, no warning icon — visibly different from a failure, or
        // agents learn to ignore both and a real outage reads as a customer with no orders.
        <p className="text-[11px] text-muted-foreground">No matching records for this customer.</p>
      )}

      {result.status === 'no_identity' && (
        // ⛔ ORDINARY, like `no_match`: a Telegram or anonymous-widget customer simply has no email
        // to key on. Red here taught agents the same thing as red on a real vendor outage.
        // (An older backend still sends this as `failed`, which renders red — no worse than before.)
        <p className="text-[11px] text-muted-foreground">
          {result.reason ?? 'This customer has no email address, so this lookup cannot run.'}
        </p>
      )}

      {!isKnownStatus(result.status) && (
        // A status this build does not know yet — a NEWER backend (this frontend ships from `main`,
        // the backend on a tag, so either can lead). Say what the backend said, muted: never a
        // blank card, and never red for a state this build cannot judge.
        <p className="text-[11px] text-muted-foreground">
          {result.reason ?? 'This lookup returned a result this version cannot display.'}
        </p>
      )}

      {result.status === 'failed' && (
        <p className="text-[11px] text-destructive">{result.reason ?? 'This lookup failed.'}</p>
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
          {result.missingKind === 'records'
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
            {typeof result.total === 'number' && result.total > result.rows.length && (
              <p className="text-[10px] text-muted-foreground">
                Showing {result.rows.length} of {result.total}.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No matching records for this customer.
          </p>
        ))}
    </div>
  );
};

export const CustomApiLookupPanel = ({
  conversationId,
  contactId,
  identityNote,
  className,
  onUseInReply,
}: Props) => {
  const { results, loading, hasRun, error, unavailable, run } = useCustomApiLookup({
    conversationId,
    contactId,
  });

  // ⛔ ASK FIRST, RENDER ONLY ON A YES. Mirrors the backend: a conversation runs the THREAD
  // surface, anything else the CONTACT surface. Nothing is looked up by asking (SC1).
  const available = useCustomApiLookupAvailability(conversationId ? 'thread' : 'contact');
  const navigate = useNavigate();
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  /**
   * Take the agent from this thread to the customer's records page, resolving (and if necessary
   * creating) the contact on the way — your decision, 2026-09-20: "resolve or create on click".
   *
   * ⛔ The failure is SAID, not swallowed. A conversation with no customer address answers 400,
   * and an agent who pressed a link that silently did nothing would reasonably conclude the page
   * is broken — which is exactly the reading this feature already cost three times.
   */
  const openRecords = async () => {
    if (resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      const resolved = await conversationContactService.resolve(conversationId as number);
      if (resolved?.contactId) navigate(`/contacts/${resolved.contactId}/records`);
      else setResolveError('That customer could not be opened.');
    } catch (error) {
      logger.error('Failed to resolve the conversation contact', error);
      setResolveError(
        getApiErrorMessage(error) ?? 'That customer could not be opened from this thread.'
      );
    } finally {
      setResolving(false);
    }
  };
  if (!available) return null;

  // ⚠️ FE/BE SKEW: this deployment has no lookup endpoint yet. Show nothing rather than a button
  // that fails — a broken-looking control reads as a broken integration, not as a feature that has
  // not shipped. A push to `main` deploys this frontend; the backend ships on a tag.
  if (unavailable) return null;

  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <p className={`${LABEL} text-muted-foreground`}>CONNECTED SYSTEMS</p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={loading}
          onClick={() => run()}
        >
          <Search className="h-3 w-3 mr-1" aria-hidden />
          {loading ? 'Looking up…' : 'Look up'}
        </Button>
      </div>

      {identityNote && <p className="text-[11px] text-muted-foreground">{identityNote}</p>}

      {/*
        CA-6: the way OUT of the panel. The owner's objection on 2026-09-20 was that records lived
        only here — a popup an agent had to know to press, with no URL to link or return to.
      */}
      {contactId !== undefined ? (
        <Link
          to={`/contacts/${contactId}/records`}
          className="text-[11px] text-primary hover:underline inline-block"
        >
          Open the full records page
        </Link>
      ) : (
        conversationId !== undefined && (
          /*
            ⛔ THE THREAD SURFACE, which had no way there at all. It mounts this panel with a
            conversation and no contact id, because a link that GUESSED one would open a stranger's
            page — so until support-service #800 the page simply did not exist from a thread, which
            is the half of "easy to find" that stayed unmet.
            It is a BUTTON, not a Link: resolving the customer may CREATE a contact row, and that
            must be an agent's press rather than something a hover or a prefetch can trigger.
          */
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-0 text-[11px] text-primary hover:underline"
            disabled={resolving}
            onClick={() => void openRecords()}
          >
            {resolving ? 'Opening…' : 'Open the full records page'}
          </Button>
        )
      )}
      {resolveError && <p className="text-[11px] text-destructive">{resolveError}</p>}

      {/*
        The results arrive asynchronously after a press, and a screen reader is given no reason to
        look at them — on a panel whose entire job is delivering information an agent then quotes to
        a customer. `polite` rather than `assertive`: it should be announced, not interrupt.
      */}
      <div role="status" aria-live="polite" className="space-y-2">
        {loading && <p className="sr-only">Looking up…</p>}
        {error && <p className="text-[11px] text-destructive">{error}</p>}

        {/*
        ⛔ Nothing is fetched until the button is pressed, so before that there is no empty state to
        show. An "empty" panel on open would read as "we know nothing about this customer", which is
        a different and wrong claim.
      */}
        {hasRun && results.length === 0 && !error && (
          <p className="text-[11px] text-muted-foreground">
            No lookups are available to you right now.
          </p>
        )}

        {results.map((result) => (
          <ResultCard
            key={result.endpointId}
            result={result}
            busy={loading}
            onRunManual={(endpointId, parameter) => run({ endpointId, parameter })}
            onUseInReply={onUseInReply}
          />
        ))}
      </div>
    </div>
  );
};
