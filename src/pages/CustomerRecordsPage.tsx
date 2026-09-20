import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ownershipNotice } from '@/components/messages/CustomApiLookupPanel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { logger } from '@/lib/logger';
import { contactService, type ContactProfile } from '@/services/contact.service';
import {
  customApiLookupService,
  type CustomApiLookupResult,
  type CustomApiStoredRecord,
  type RunnableLookup,
} from '@/services/customApiLookup.service';

/**
 * CA-6 — THE CUSTOMER RECORDS PAGE.
 *
 * 🔴 WHY THIS PAGE EXISTS. Owner, 2026-09-20: "There is no page — that's my point, it's complex,
 * and it's in a popup, why not in a separate page!? Check an order id and All a client's orders →
 * it should be easy to find these features, and I assume you are hiding it, it should be 'native'."
 * Until today every record a connected system knew lived in a ~300px side panel that rendered
 * NOTHING until an agent pressed a button, inside a thread they had to already have open.
 *
 * ⛔ OPENING THIS PAGE CALLS NO VENDOR (D45/SC1). It renders from records we already hold — D37's
 * store, written on every lookup since CA-3 and read by nothing until now. A page that fetched on
 * open would send a customer's identity to a third party because someone opened a tab. Going live
 * is an explicit press: the reference box, or Refresh.
 *
 * ⛔ STORED ROWS CARRY NO OWNERSHIP VERDICT and this page invents none. D35 ran when the record was
 * FETCHED, against the list as it was then. The page dates them instead ("as at"), because what we
 * hold is what the vendor said THEN.
 */

/** A money figure and its currency, formatted from MINOR units. */
const formatMinor = (minor: number | null, currency: string | null): string | null => {
  if (minor === null) return null;
  // ⛔ NEVER a hardcoded /100. The number of minor units in a major one is a property of the
  // CURRENCY — JPY, KRW and IDR have none — so dividing by 100 renders ¥3,485 as ¥34.85, a
  // hundredfold error in a figure an agent quotes to a customer. Ask Intl for the exponent.
  //
  // ⛔ AND WITH NO CURRENCY WE SHOW NOTHING (audit pass 2). `currency` is nullable, and the stored
  // figure is in MINOR units — so printing it bare puts "34850" in a Total column where the truth
  // is €348.50. An agent quoting that is off by a hundred. D23 already settled the principle for
  // this codebase: a money figure without its currency is a misquote waiting to happen. Without
  // the currency we cannot even convert it, so there is nothing honest to print.
  if (!currency) return null;
  try {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minor / 10 ** digits);
  } catch {
    // An unknown or malformed currency code must not blank the row it belongs to.
    return `${minor} ${currency}`;
  }
};

const shortDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString();
};

/**
 * ⛔ DESIGN-SYSTEM TABLE, not a hand-rolled list. This repo's conventions name `DataTable` for a
 * list of records; a bespoke stack of divs drifts from every other list in the app on theming,
 * empty state and small screens — and this page is meant to feel native, which is the whole ask.
 */
const recordColumns: ColumnDef<CustomApiStoredRecord>[] = [
  {
    id: 'reference',
    header: 'Reference',
    card: 'title',
    cell: (record) => <span className="font-medium">{record.recordRef}</span>,
  },
  {
    id: 'source',
    header: 'Lookup',
    card: 'subtitle',
    // D28: an agent cannot read the integration's configuration, so the row must NAME the lookup
    // and the vendor or the page shows bare numbers from an unnamed system.
    cell: (record) => (
      <span className="text-muted-foreground">
        {record.endpointLabel} · {record.connectionName}
      </span>
    ),
  },
  {
    id: 'when',
    header: 'Date',
    card: 'meta',
    cell: (record) => <span>{shortDate(record.occurredAt) ?? '—'}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    card: 'meta',
    cell: (record) => (record.status ? <Badge variant="secondary">{record.status}</Badge> : <>—</>),
  },
  {
    id: 'total',
    header: 'Total',
    align: 'right',
    card: 'meta',
    cell: (record) => <>{formatMinor(record.totalMinor, record.currency) ?? '—'}</>,
  },
];

/** One live result, rendered with the SAME verdict wording the thread panel uses. */
const LiveResult = ({ result }: { result: CustomApiLookupResult }) => {
  const notice = ownershipNotice(result.ownership, result.ownershipReason);
  return (
    <div className="rounded border border-border p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{result.label}</p>
        <p className="text-[11px] text-muted-foreground">{result.connectionName}</p>
      </div>

      {/* ⛔ The flag comes FIRST and is never softened for this surface: an agent must not read a
          record's contents before being told it may not be this customer's (D38). */}
      {notice && (
        <p className={`text-[11px] rounded px-2 py-1 ${notice.className}`}>{notice.text}</p>
      )}

      {result.status === 'ok' && result.rows && result.rows.length > 0 ? (
        <div className="space-y-1">
          {/* A vendor row has no id of its own, so its CONTENT is its identity — an index key
              would reuse a DOM node for a different record when a second check returns fewer. */}
          {result.rows.map((row) => (
            <pre
              key={`${result.endpointId}-${JSON.stringify(row)}`}
              className="text-[11px] whitespace-pre-wrap break-words bg-muted/40 rounded p-2"
            >
              {JSON.stringify(row, null, 1)}
            </pre>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {result.reason ?? 'Nothing found for that reference.'}
        </p>
      )}
    </div>
  );
};

export const CustomerRecordsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);

  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [records, setRecords] = useState<CustomApiStoredRecord[]>([]);
  const [lookups, setLookups] = useState<RunnableLookup[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * ⚠️ TOLD APART ON PURPOSE. "This deployment has no records endpoint yet" (an FE/BE skew — the
   * frontend deploys on a push to `main`, the backend on a tag) is NOT "this customer has no
   * records". Rendering the empty state for the first would state something false about a customer.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [reference, setReference] = useState('');
  const [searching, setSearching] = useState(false);
  const [liveResults, setLiveResults] = useState<CustomApiLookupResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(contactId) || contactId <= 0) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    setNotFound(false);
    /*
      ⛔ A PREVIOUS CUSTOMER'S ANSWERS DO NOT SURVIVE A NAVIGATION. This route re-renders in place
      when the id changes (records page → records page), so without this the live results and the
      typed reference from customer A stay on screen under customer B's name. Audit pass 1.
    */
    setLiveResults(null);
    setReference('');
    setSearchError(null);

    /*
      ⛔ SETTLED, NOT ALL — the same rule the backend's own fan-out follows (SC3). These are three
      independent reads and one failing must not blank the other two. Audit pass 1 found
      `Promise.all` here, which meant an older deployment missing EITHER new route refused to open
      a customer that exists, and — worse — a records route that 404s while the contact loads fine
      fell through to the EMPTY state, telling an agent this customer has no records when the truth
      is that this deployment cannot answer. That is the precise false statement this page was
      written to avoid, and it was in the likeliest skew of all.
    */
    const [profile, stored, options] = await Promise.allSettled([
      contactService.getById(contactId),
      customApiLookupService.storedRecords(contactId),
      customApiLookupService.lookupOptions('contact'),
    ]);

    if (profile.status === 'fulfilled') {
      setContact(profile.value);
    } else {
      logger.error('Failed to load the customer', profile.reason);
      setNotFound(true);
    }

    if (stored.status === 'fulfilled') {
      setRecords(stored.value);
    } else {
      // ⛔ NOT an empty list. `loadFailed` is what stops the empty state claiming something about
      // the customer that we did not learn.
      logger.error('Failed to load stored records', stored.reason);
      setRecords([]);
      setLoadFailed(true);
    }

    if (options.status === 'fulfilled') {
      setLookups(options.value);
    } else {
      // The reference box simply does not appear. An older backend has no options route, and a box
      // that cannot run is worse than no box.
      logger.error('Failed to load lookup options', options.reason);
      setLookups([]);
    }

    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The lookups that take a reference an agent types (D44). */
  const manualLookups = lookups.filter((lookup) => lookup.parameterSource === 'manual');

  const search = async () => {
    const value = reference.trim();
    if (!value || manualLookups.length === 0) return;
    setSearching(true);
    setSearchError(null);
    try {
      // ⛔ ONE call per manual lookup, and ONLY on this press. Every result comes back verified —
      // the backend runs D35 on a named record whichever door it arrives through.
      // ⛔ SETTLED (SC3): one vendor being unreachable must not lose the answers from the others.
      const answers = await Promise.allSettled(
        manualLookups.map((lookup) =>
          customApiLookupService.run({
            contactId,
            endpointId: lookup.endpointId,
            parameter: value,
          })
        )
      );
      const found = answers
        .filter(
          (answer): answer is PromiseFulfilledResult<CustomApiLookupResult[]> =>
            answer.status === 'fulfilled'
        )
        .flatMap((answer) => answer.value);
      setLiveResults(found);
      if (found.length === 0 && answers.some((answer) => answer.status === 'rejected')) {
        setSearchError('That lookup could not be completed. Try again, or check with an admin.');
      }
      // A live answer is also stored by the backend, so the list below can now include it.
      setRecords(await customApiLookupService.storedRecords(contactId));
    } catch (error) {
      logger.error('Record lookup failed', error);
      setSearchError('That lookup could not be completed. Try again, or check with an admin.');
    } finally {
      setSearching(false);
    }
  };

  const refresh = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      // An explicit press, so a vendor call is exactly what the agent asked for.
      const answers = await customApiLookupService.run({ contactId });
      setLiveResults(answers);
      setRecords(await customApiLookupService.storedRecords(contactId));
    } catch (error) {
      logger.error('Refresh failed', error);
      setSearchError('Could not refresh from the connected systems.');
    } finally {
      setSearching(false);
    }
  };

  const heading = contact?.displayName ?? contact?.primaryEmail ?? 'Customer';

  return (
    <Layout>
      <div className="p-4 space-y-4 max-w-4xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
            Back
          </Button>
        </div>

        {notFound ? (
          /*
            ⛔ ONE branch, and only the reachable one. Audit pass 6: this read
            `notFound || (loadFailed && !contact)`, but since pass 1 a failing CONTACT read sets
            `notFound` — so the second half could never be true and the message behind it was
            unreachable. A records read that fails while the customer loads is a different state
            entirely and is handled where the list would be, not here.
            ⚠️ And it says LINK, not "address": this page is keyed on a contact id in the URL, so
            "that address" described something the agent never typed.
          */
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <p className="text-sm font-medium">This customer could not be opened.</p>
              <p className="text-[12px] text-muted-foreground">
                That link does not name a customer in this workspace.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">{heading}</h1>
              {contact?.primaryEmail && contact.displayName && (
                <p className="text-[12px] text-muted-foreground">{contact.primaryEmail}</p>
              )}
            </div>

            {/*
              D44: THE REFERENCE BOX IS VISIBLE WITHOUT PRESSING ANYTHING FIRST. It is the whole
              point of the page — "check an order id" was previously a card that only appeared
              inside a panel after a different press.
            */}
            {manualLookups.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Check a reference</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/*
                    ⚠️ A VISIBLE LABEL, not a placeholder alone. `SearchInput` takes no `aria-label`
                    and renders a bare `<input>`, so a placeholder would be this control's only
                    name — and a placeholder disappears the moment an agent starts typing. The one
                    control this page exists for should not be the unlabelled one.
                  */}
                  <Label htmlFor="ca6-reference">Order or reference number</Label>
                  <SearchInput
                    value={reference}
                    onChange={setReference}
                    placeholder="Order or reference number"
                    showSearchButton
                    onSearch={() => void search()}
                  />
                  {/*
                    ⛔ NO PROMISE HERE. This said "Every answer is checked against this customer
                    before it is shown", and on staging 2026-09-20 it sat directly above an answer
                    reading "this integration cannot verify ownership" — a caption asserting a
                    check the lookup cannot run. Whether ownership CAN be verified is per-lookup
                    configuration (D35: it needs a source lookup listing the customer's own
                    records), so the honest place for that claim is the verdict on each card, which
                    already carries it. Six audit passes missed this because jsdom never rendered
                    an unverifiable result next to the caption.
                  */}
                  <p className="text-[11px] text-muted-foreground">
                    Checked against{' '}
                    {manualLookups.map((lookup) => lookup.connectionName).join(', ')}. Each answer
                    says what we could confirm about it.
                  </p>
                </CardContent>
              </Card>
            )}

            {searchError && <p className="text-[12px] text-destructive">{searchError}</p>}

            <div role="status" aria-live="polite" className="space-y-2">
              {liveResults?.map((result) => (
                <LiveResult key={`${result.endpointId}-${result.label}`} result={result} />
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Records we already hold</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={searching}
                >
                  <RefreshCw className="h-3 w-3 mr-1" aria-hidden />
                  {searching ? 'Refreshing…' : 'Refresh from source'}
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-[12px] text-muted-foreground">Loading…</p>
                ) : loadFailed ? (
                  /*
                    ⛔ THE RECORDS READ FAILED, and that is NOT "this customer has no records".
                    Audit pass 1: the contact loads from a different route, so the likeliest skew of
                    all — an older backend with no records route — left the customer's name on
                    screen above an EMPTY table, which an agent reads as fact about the customer.
                    Say what actually happened, and offer the retry.
                  */
                  <Alert variant="warning">
                    <div className="space-y-2">
                      <p className="text-sm">
                        We could not read this customer&rsquo;s records just now, so this list is
                        not their record of account.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => void load()}>
                        Try again
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <>
                    <DataTable<CustomApiStoredRecord>
                      rows={records}
                      rowKey={(record) => record.id}
                      columns={recordColumns}
                      pagination={{ mode: 'client', pageSize: 25 }}
                      /*
                        ⛔ THE EMPTY STATE IS THE COMMONEST STATE ON DAY ONE, not an edge case: a
                        record exists here only once a lookup has fetched it, so a customer nobody
                        has looked up yet has nothing. It must SAY so and offer the way forward
                        rather than render a blank panel that reads like a broken page.
                      */
                      empty={{
                        message:
                          lookups.length === 0
                            ? 'No records held for this customer yet. No connected system is set up for this workspace yet.'
                            : 'No records held for this customer yet. Check a reference above, or refresh from the connected systems.',
                      }}
                    />
                    {records.length > 0 && (
                      /*
                        ⚠️ DATED, NOT ASSERTED. These are what the vendor said when we FETCHED them,
                        and no ownership check is running now — so the page says so and claims
                        nothing about them being current.
                      */
                      <p className="text-[11px] text-muted-foreground pt-2">
                        Held from earlier lookups, newest first — what each system said when we
                        fetched it, not a live position. Refresh re-runs the lookups available on
                        this page.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
};
