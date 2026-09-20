import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ownershipNotice } from '@/components/messages/CustomApiLookupPanel';
import { Button } from '@/components/ui/Button';
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
  if (!currency) return String(minor);
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
          {result.rows.map((row, index) => (
            <pre
              key={index}
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
    try {
      // ⛔ Both of these read OUR side only. Neither is a lookup.
      const [profile, stored, options] = await Promise.all([
        contactService.getById(contactId),
        customApiLookupService.storedRecords(contactId),
        customApiLookupService.lookupOptions('contact'),
      ]);
      setContact(profile);
      setRecords(stored);
      setLookups(options);
    } catch (error) {
      logger.error('Failed to load customer records', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
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
      const answers = await Promise.all(
        manualLookups.map((lookup) =>
          customApiLookupService.run({
            contactId,
            endpointId: lookup.endpointId,
            parameter: value,
          })
        )
      );
      setLiveResults(answers.flat());
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

        {notFound || (loadFailed && !contact) ? (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <p className="text-sm font-medium">This customer could not be opened.</p>
              <p className="text-[12px] text-muted-foreground">
                {notFound
                  ? 'That address does not name a customer in this workspace.'
                  : 'The records service did not answer. This can happen while a deployment is part-way through.'}
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
                  <p className="text-[11px] text-muted-foreground">
                    Checked against{' '}
                    {manualLookups.map((lookup) => lookup.connectionName).join(', ')}. Every answer
                    is checked against this customer before it is shown.
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
                        Held from earlier lookups. Newest first. Use Refresh for the live position.
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
