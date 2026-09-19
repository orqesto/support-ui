import { useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCustomApiLookup, useCustomApiLookupAvailability } from '@/hooks/useCustomApiLookup';
import type { CustomApiLookupResult, LookupField } from '@/services/customApiLookup.service';
import { MONO } from './messageDetailConstants';

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
 *   shape changed — the vendor's response no longer matches what was configured, fields NAMED, so
 *                   a dead integration is never mistaken for a customer we have no data for (SC4b)
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

/** Every status this build renders a body for; anything else falls back to the backend's reason. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'ok',
  'no_match',
  'no_identity',
  'failed',
  'shape_changed',
  'needs_input',
]);

interface Props {
  conversationId?: number;
  contactId?: number;
  /** Shown when the customer has no email to key an identity lookup on (D30). */
  identityNote?: string;
  /** Spacing from the host. On the panel's own root, so a hidden panel leaves no gap behind. */
  className?: string;
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
  unknown: 'Not confirmed as this customer’s record — ownership could not be checked.',
};

const ownershipNotice = (
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
        className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40',
      };
    default:
      return null;
  }
};

/**
 * How many fields to preview when an admin has chosen none. Small on purpose: see the note where
 * it is used — the alternative is the vendor's whole record, PII included, in the thread view.
 */
const UNCONFIGURED_FIELD_PREVIEW = 6;

/**
 * A vendor value is `unknown` — the shape is whatever that vendor returned, discovered at run time.
 *
 * ⛔ Never `String(value)` on it: a configured path that resolves to an object renders as
 * "[object Object]" in front of an agent, which looks like data and is not. A nested value is
 * shown as JSON instead, so it is at least readable and obviously structured.
 */
const asText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

/** D23: a money figure without its currency is a misquote waiting to happen. */
const renderValue = (row: Record<string, unknown>, field: LookupField): string => {
  const value = asText(row[field.path]);
  if (value === null) return '—';
  if (field.kind !== 'money') return value;
  // The currency is either configured as a literal or travels WITH the row, because on a vendor
  // that prices per row the same figure means different currencies from different endpoints.
  const currency = field.currency ?? asText(row[`${field.path}__currency`]);
  return currency ? `${value} ${currency}` : value;
};

const ResultCard = ({
  result,
  onRunManual,
  busy,
}: {
  result: CustomApiLookupResult;
  onRunManual: (endpointId: number, parameter: string) => void;
  busy: boolean;
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
  const fallbackKeys = Object.keys(result.rows?.[0] ?? {}).filter(
    (key) => !key.endsWith('__currency')
  );
  const usingFallback = !result.fields?.length;
  const fields: LookupField[] = usingFallback
    ? fallbackKeys
        .slice(0, UNCONFIGURED_FIELD_PREVIEW)
        .map((key) => ({ path: key, label: key, kind: 'plain' as const }))
    : (result.fields ?? []);

  return (
    <div className="rounded border border-border p-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground">{result.label}</p>
        <p className={`${MONO} text-muted-foreground`}>{result.connectionName}</p>
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

      {!KNOWN_STATUSES.has(result.status) && (
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
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          This vendor’s response no longer matches what was configured
          {result.missing?.length ? `: ${result.missing.join(', ')} not found.` : '.'}
        </p>
      )}

      {result.status === 'ok' &&
        (result.rows?.length ? (
          <div className="space-y-1.5">
            {result.rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-0.5">
                {fields.map((field) => (
                  <div key={field.path} className="contents">
                    <p className={`${MONO} text-muted-foreground`}>{field.label.toUpperCase()}</p>
                    <p className="text-[11px] text-foreground break-words">
                      {renderValue(row, field)}
                    </p>
                  </div>
                ))}
              </div>
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
}: Props) => {
  const { results, loading, hasRun, error, unavailable, run } = useCustomApiLookup({
    conversationId,
    contactId,
  });

  // ⛔ ASK FIRST, RENDER ONLY ON A YES. Mirrors the backend: a conversation runs the THREAD
  // surface, anything else the CONTACT surface. Nothing is looked up by asking (SC1).
  const available = useCustomApiLookupAvailability(conversationId ? 'thread' : 'contact');
  if (!available) return null;

  // ⚠️ FE/BE SKEW: this deployment has no lookup endpoint yet. Show nothing rather than a button
  // that fails — a broken-looking control reads as a broken integration, not as a feature that has
  // not shipped. A push to `main` deploys this frontend; the backend ships on a tag.
  if (unavailable) return null;

  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <p className={`${MONO} text-muted-foreground`}>CONNECTED SYSTEMS</p>
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
          />
        ))}
      </div>
    </div>
  );
};
