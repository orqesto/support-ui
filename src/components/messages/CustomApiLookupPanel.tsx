import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  useCustomApiLookup,
  useCustomApiLookupAvailabilityState,
  useCustomApiLookupOptions,
} from '@/hooks/useCustomApiLookup';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { conversationContactService } from '@/services/conversationContact.service';
import type { AddOutcome } from './recordInsertOutcome';
import type { CustomApiLookupResult, RunnableLookup } from '@/services/customApiLookup.service';
import { relativeTime } from './messageDetailConstants';
import { CustomApiResultCard } from './CustomApiResultCard';
import { referenceOf, trackingOf, type TrackingItem } from './customApiRowFields';
import {
  LOOKUPS_NOT_ON_SERVER,
  lookupListLine,
  pressPrompt,
  referenceHintText,
  referenceNameOf,
} from './customApiLookupText';

/** Moved to the shared card (2026-10-14); re-exported for existing importers. */
export { ownershipNotice } from './CustomApiResultCard';

/**
 * What the connected integrations know about THIS customer (CA-3).
 *
 * ⛔ ONE component, rendered in BOTH the thread's Lookups tab and the contact drawer's.
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

/** Moved to the sentence module (2026-10-14, the records page says it too); re-exported. */
export { LOOKUPS_NOT_ON_SERVER } from './customApiLookupText';

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
  onUseInReply?: (note: string) => AddOutcome;
  /**
   * The address a press looks up, named in the prompt before a press (2026-10-15). Optional: the
   * prompt says "this customer" without it.
   */
  customerEmail?: string;
  /**
   * The Lookups tab's badge (2026-10-15): how many lookups FOUND something for this customer. 0
   * before a press and when the panel goes away, because its results go with it.
   */
  onFoundChange?: (found: number) => void;
}

/**
 * v4 `.k-sum`: how the press went, counted by outcome, above the cards — so "1 failed" is seen
 * before scrolling past three cards to find it. Only non-zero counts. It counts what the CARDS
 * say: an `ok` with no rows renders "No matching records", so it is a no match here too.
 * `shape_changed` is not in v4's list; it is counted ("needs an admin") rather than left out, or a
 * dead integration would vanish from the summary while its card says it needs fixing. Same for a
 * record the ownership check REJECTED ("not this customer’s"). A status this build does not know
 * is not counted: its card shows the backend's own words, muted.
 */
const hasRows = (result: CustomApiLookupResult) => result.status === 'ok' && !!result.rows?.length;

/**
 * Lookups that found something for this customer — the summary's "found" and the tab's badge.
 * ⛔ A record the ownership check says is SOMEONE ELSE'S is not "found" for this customer: its card
 * says "does NOT belong to this customer" (D38), and neither count may contradict it.
 */
export const countFound = (results: CustomApiLookupResult[]): number =>
  results.filter((result) => hasRows(result) && result.ownership !== 'mismatch').length;

export const summariseLookup = (
  results: CustomApiLookupResult[]
): { key: string; text: string; tone: 'ok' | 'ask' | 'warn' | 'bad' | 'plain' }[] => {
  const count = (test: (result: CustomApiLookupResult) => boolean) => results.filter(test).length;
  const plural = (amount: number, one: string, many: string) =>
    `${amount} ${amount === 1 ? one : many}`;
  const found = countFound(results);
  const notTheirs = count((result) => hasRows(result) && result.ownership === 'mismatch');
  const ask = count((result) => result.status === 'needs_input');
  const noMatch = count(
    (result) => result.status === 'no_match' || (result.status === 'ok' && !result.rows?.length)
  );
  const noIdentity = count((result) => result.status === 'no_identity');
  const changed = count((result) => result.status === 'shape_changed');
  const failed = count((result) => result.status === 'failed');
  const parts: {
    key: string;
    amount: number;
    text: string;
    tone: 'ok' | 'ask' | 'warn' | 'bad' | 'plain';
  }[] = [
    { key: 'found', amount: found, text: `${found} found`, tone: 'ok' },
    { key: 'not_theirs', amount: notTheirs, text: `${notTheirs} not this customer’s`, tone: 'bad' },
    { key: 'ask', amount: ask, text: plural(ask, 'needs a number', 'need a number'), tone: 'ask' },
    { key: 'no_match', amount: noMatch, text: `${noMatch} no match`, tone: 'plain' },
    {
      key: 'no_identity',
      amount: noIdentity,
      text: `${noIdentity} can’t run — no email`,
      tone: 'plain',
    },
    {
      key: 'changed',
      amount: changed,
      text: plural(changed, 'needs an admin', 'need an admin'),
      tone: 'warn',
    },
    { key: 'failed', amount: failed, text: `${failed} failed`, tone: 'bad' },
  ];
  return parts
    .filter((part) => part.amount > 0)
    .map(({ key, text, tone }) => ({ key, text, tone }));
};

const SUMMARY_TONE: Record<ReturnType<typeof summariseLookup>[number]['tone'], string> = {
  ok: 'bg-success-muted text-success',
  ask: 'bg-primary-muted text-primary',
  warn: 'bg-warning-muted text-warning',
  bad: 'bg-destructive-muted text-destructive',
  plain: 'bg-sunken text-muted-foreground',
};

const LookupSummary = ({ results }: { results: CustomApiLookupResult[] }) => {
  const parts = summariseLookup(results);
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-[5px]" data-testid="lookup-summary">
      {parts.map((part) => (
        <Badge
          key={part.key}
          variant="secondary"
          data-tone={part.tone}
          className={`rounded-[5px] px-[7px] py-0.5 font-sans text-[11px] font-medium cursor-default ${SUMMARY_TONE[part.tone]}`}
        >
          {part.text}
        </Badge>
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
  customerEmail,
  onFoundChange,
}: Props) => {
  const { results, loading, hasRun, ranAt, error, run, lookedUpAs } = useCustomApiLookup({
    conversationId,
    contactId,
  });
  /**
   * LOOK UP ANOTHER EMAIL (2026-09-29). A shop's order notification names the buyer only in its
   * body, so the ticket's customer is the shop and every identity lookup keys on the wrong address.
   * The agent types the buyer's email and the whole panel runs as them — account, orders, and the
   * "is this order theirs" check on a typed number. Open by default when there is no customer email.
   */
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const typedEmail = emailValue.trim().toLowerCase();
  const typedEmailValid = hasLookupEmailIdentity(typedEmail);
  const showEmailField = emailOpen || Boolean(identityNote);
  // The panel is REUSED when the agent opens another thread; an address typed for the last one
  // must not sit in the field, one press away from being looked up from this one.
  useEffect(() => {
    setEmailValue('');
    setEmailOpen(false);
  }, [conversationId, contactId]);
  const found = countFound(results);
  useEffect(() => {
    onFoundChange?.(found);
  }, [found, onFoundChange]);
  // The results leave with the panel, so the badge does too.
  useEffect(() => () => onFoundChange?.(0), [onFoundChange]);
  const runAsTyped = () => {
    if (typedEmailValid) void run(undefined, typedEmail);
  };

  // ⛔ ASK FIRST, RENDER ONLY ON A YES. Mirrors the backend: a conversation runs the THREAD
  // surface, anything else the CONTACT surface. Nothing is looked up by asking (SC1).
  const surface = conversationId ? 'thread' : 'contact';
  const availability = useCustomApiLookupAvailabilityState(surface);
  // Configuration only, the same cached query as the tab's badge — no vendor call (SC1).
  const options = useCustomApiLookupOptions(surface);
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * The parcels of every record opened in a details card on this thread, keyed
   * `${detailsEndpointId}:${reference}` — so an order keeps its tracking under its row in the list
   * after the details card moves on to another order. ⛔ Cleared with the customer: a different
   * thread, or a different looked-up email, is a different person's orders. A record the
   * ownership check said is someone else's is never copied into this customer's list.
   */
  const [openedTracking, setOpenedTracking] = useState<Record<string, TrackingItem[]>>({});
  useEffect(() => {
    setOpenedTracking({});
  }, [conversationId, contactId, lookedUpAs]);
  useEffect(() => {
    const read = results.flatMap((result): [string, TrackingItem[]][] => {
      const row = result.rows?.[0];
      if (result.status !== 'ok' || result.rows?.length !== 1 || !row) return [];
      if (result.ownership === 'mismatch') return [];
      const fields = result.fields ?? [];
      const reference = referenceOf(row, fields);
      const items = trackingOf(row, fields);
      return reference === null || items.length === 0
        ? []
        : [[`${result.endpointId}:${reference}`, items]];
    });
    if (read.length > 0) setOpenedTracking((known) => ({ ...known, ...Object.fromEntries(read) }));
  }, [results]);
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
  // ⚠️ FE/BE SKEW: this deployment has no lookup endpoint yet. Never a button that fails — a
  // broken-looking control reads as a broken integration, not as a feature that has not shipped.
  // A push to `main` deploys this frontend; the backend ships on a tag. One line, not nothing:
  // since 2026-10-09 this panel is its tab's only content, and nothing left a blank tab.
  // 2026-10-14: decided by the AVAILABILITY route's own 404 only; a press 404 means "not visible".
  if (availability === 'not_on_server')
    return <p className="text-[11px] text-muted-foreground">{LOOKUPS_NOT_ON_SERVER}</p>;
  if (availability !== 'available') return null;

  const systems = [
    ...new Set((options ?? []).map((option) => option.connectionName).filter(Boolean)),
  ];
  const lookupLabels = (options ?? []).map((option) => option.label);
  /**
   * A3 (2026-10-14): under an identity no-match, point at a typed-value lookup of the SAME
   * connection, by its own reference name. The options know which lookups take a typed value; an
   * older backend without options falls back to the cards on screen that are waiting for one.
   */
  const referenceHintFor = (result: CustomApiLookupResult): string | null => {
    if (result.status !== 'no_match' || result.searchedFor?.kind !== 'email') return null;
    const typedLookup =
      (options ?? []).find(
        (option) =>
          option.parameterSource === 'manual' && option.connectionName === result.connectionName
      ) ??
      results.find(
        (other) => other.status === 'needs_input' && other.connectionName === result.connectionName
      );
    return typedLookup ? referenceHintText(referenceNameOf(typedLookup.referenceLabel)) : null;
  };

  /**
   * A record in a LIST (a customer's orders) opens in the typed-value lookup of the same
   * connection and category (the order's details) — the card that carries its tracking. Read off
   * the options: only they say which lookup takes a typed value. Null when there is none on screen.
   */
  const detailsLookupFor = (result: CustomApiLookupResult): number | null => {
    const sameKind = (option: RunnableLookup) =>
      option.category === result.category && option.connectionName === result.connectionName;
    const source = (options ?? []).find((option) => option.endpointId === result.endpointId);
    if (!result.category || !source || source.parameterSource === 'manual') return null;
    const details = (options ?? []).find(
      (option) =>
        option.parameterSource === 'manual' &&
        sameKind(option) &&
        results.some((other) => other.endpointId === option.endpointId)
    );
    return details?.endpointId ?? null;
  };

  /** Look the record up in its details card (one vendor call, ownership-checked), then show it. */
  const openRecord = async (endpointId: number, reference: string) => {
    if (loading) return;
    await run({ endpointId, parameter: reference }, lookedUpAs ?? undefined);
    rootRef.current
      ?.querySelector(`[data-endpoint-id="${endpointId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    // `data-lookup-root`: the composer's "Look up" button opens the Lookups tab, then scrolls this
    // into view, focuses it (tabIndex -1: reachable by script, not a Tab stop) and flashes it.
    // Harmless in the contact drawer.
    <div
      ref={rootRef}
      data-lookup-root
      role="group"
      aria-label="Connected systems"
      tabIndex={-1}
      className={`focus:outline-none ${className ? `space-y-2 ${className}` : 'space-y-2'}`}
    >
      {/*
        No visible heading: the tab that holds this panel names it (spec 2026-10-09).
        2026-10-15: what a press does sits BESIDE the button, read first; it wraps under the
        sentence at phone width. After a run the sentence gives way to "ran …".
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-48">
          {!hasRun && !loading ? (
            <>
              <p className="text-[12px] text-foreground break-words">
                {pressPrompt(systems, lookedUpAs ?? customerEmail)}
              </p>
              {lookupListLine(lookupLabels) && (
                <p className="text-[11px] text-muted-foreground break-words">
                  {lookupListLine(lookupLabels)}
                </p>
              )}
            </>
          ) : (
            ranAt && (
              <span className="text-[10.5px] text-faint-foreground">ran {relativeTime(ranAt)}</span>
            )
          )}
        </div>
        <Button
          size="sm"
          variant={ranAt ? 'outline' : 'primary'}
          className="h-7 text-[11px] shrink-0"
          disabled={loading}
          onClick={() => run(undefined, lookedUpAs ?? undefined)}
        >
          {ranAt ? (
            <RotateCw className="h-3 w-3 mr-1" aria-hidden />
          ) : (
            <Search className="h-3 w-3 mr-1" aria-hidden />
          )}
          {loading ? 'Looking up…' : ranAt ? 'Look up again' : 'Look up'}
        </Button>
      </div>

      {identityNote && <p className="text-[11px] text-muted-foreground">{identityNote}</p>}

      {showEmailField ? (
        <div className="flex gap-1.5">
          <Input
            size="sm"
            type="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runAsTyped();
            }}
            placeholder="Customer email"
            aria-label="Look up another email"
            className="text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] whitespace-nowrap"
            disabled={loading || !typedEmailValid}
            onClick={runAsTyped}
          >
            Look up as
          </Button>
        </div>
      ) : null}

      {lookedUpAs && (
        /* ⛔ Only on the backend's own confirmation (see the hook), and never dismissable while its
           results are on screen: every card below is about this person, not the ticket's customer. */
        <div className="flex items-center justify-between gap-2 rounded border border-primary/40 bg-primary/10 px-2 py-1">
          <p className="text-[11px] text-foreground">
            Showing results for <span className="font-medium">{lookedUpAs}</span>, not this ticket’s
            customer.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px]"
            disabled={loading}
            onClick={() => void run()}
          >
            Back to the customer
          </Button>
        </div>
      )}

      {/*
        CA-6: the way OUT of the panel. The owner's objection on 2026-09-20 was that records lived
        only here — a popup an agent had to know to press, with no URL to link or return to.
      */}
      {/*
        2026-10-15: the panel's two links share ONE row, each in a wrapper of its own with a gap —
        loose in one block they once ran together as one line of text ("…emailOpen the full…",
        staging 2026-10-09); stacked, they pushed the results a screen down.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!showEmailField && (
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-0 text-[11px] text-primary hover:underline"
              onClick={() => setEmailOpen(true)}
            >
              Look up another email
            </Button>
          </div>
        )}
        <div>
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
                className="h-6 px-0 text-[11px] text-primary hover:underline"
                disabled={resolving}
                onClick={() => void openRecords()}
              >
                {resolving ? 'Opening…' : 'Open the full records page'}
              </Button>
            )
          )}
        </div>
      </div>
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

        {results.length > 0 && <LookupSummary results={results} />}

        {results.map((result) => {
          const detailsId = detailsLookupFor(result);
          return (
            <CustomApiResultCard
              key={result.endpointId}
              result={result}
              busy={loading}
              referenceInput="card"
              lookedUpAs={lookedUpAs}
              referenceHint={referenceHintFor(result)}
              onRunManual={(endpointId, parameter) =>
                run({ endpointId, parameter }, lookedUpAs ?? undefined)
              }
              onUseInReply={onUseInReply}
              onOpenRecord={
                detailsId === null
                  ? undefined
                  : (reference) => void openRecord(detailsId, reference)
              }
              trackingFor={
                detailsId === null
                  ? undefined
                  : (reference) => openedTracking[`${detailsId}:${reference}`]
              }
            />
          );
        })}
      </div>
    </div>
  );
};
