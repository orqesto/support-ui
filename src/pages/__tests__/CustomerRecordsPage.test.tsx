/**
 * CA-6 — the customer records page.
 *
 * 🔴 The gate that matters most is the FIRST one: opening this page must not call a vendor. D45
 * chose "stored on load, live on demand" precisely so a page could exist without reversing SC1,
 * and a regression there is invisible to the eye — the page looks identical either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

const getById = vi.fn();
const storedRecords = vi.fn();
const lookupOptions = vi.fn();
const run = vi.fn();

vi.mock('@/services/contact.service', () => ({
  contactService: { getById },
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: { storedRecords, lookupOptions, run },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { CustomerRecordsPage } = await import('../CustomerRecordsPage');

const CONTACT = { id: 5, displayName: 'Ada Lovelace', primaryEmail: 'ada@example.com' };
const STORED = {
  id: 9,
  recordRef: '137416',
  occurredAt: '2026-09-01T10:00:00.000Z',
  status: 'shipped',
  totalMinor: 34850,
  currency: 'EUR',
  fetchedAt: '2026-09-19T12:00:00.000Z',
  endpointId: 70,
  endpointLabel: 'Their orders',
  connectionName: 'DeusPower',
};
const MANUAL_LOOKUP = {
  endpointId: 20,
  label: 'this order',
  connectionName: 'DeusPower',
  parameterSource: 'manual',
  resultShape: 'one',
  // The backend sends this on every option (CA-6). A fixture omitting it describes a row the API
  // cannot produce, and the empty-state branch that reads it would then be tested against a shape
  // that only exists here.
  storesRecords: true,
};

const renderPage = (id = '5') =>
  render(
    <MemoryRouter initialEntries={[`/contacts/${id}/records`]}>
      <Routes>
        <Route path="/contacts/:id/records" element={<CustomerRecordsPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  getById.mockResolvedValue(CONTACT);
  storedRecords.mockResolvedValue([STORED]);
  lookupOptions.mockResolvedValue([MANUAL_LOOKUP]);
  run.mockResolvedValue([]);
});

describe('CustomerRecordsPage', () => {
  it('⛔ calls NO vendor on open — it renders from the store (D45/SC1)', async () => {
    renderPage();

    await screen.findByText('137416');

    // 🔴 RED: make the page fetch live on open and `run` is called without anyone pressing
    // anything — a customer's identity reaching a third party because a tab was opened.
    expect(run).not.toHaveBeenCalled();
    expect(storedRecords).toHaveBeenCalledWith(5);
  });

  it('names the customer, the lookup and the vendor on each record', async () => {
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Their orders · DeusPower/)).toBeInTheDocument();
  });

  it('⛔ formats money from MINOR units using the currency’s own exponent', async () => {
    renderPage();

    // 34850 minor EUR is 348.50 — RED if anything divides by a hardcoded 100 for every currency
    // or prints the raw minor figure, which is a hundredfold misquote to a customer.
    const total = await screen.findByText(/348[.,]50/);
    expect(total).toBeInTheDocument();
  });

  it('a zero-decimal currency is NOT divided by 100', async () => {
    // ⛔ THE CONTROL THAT CATCHES A HARDCODED /100. JPY has no minor unit: 3485 minor yen is
    // ¥3,485, and a /100 would render ¥34.85 — the error is invisible in a EUR-only fixture.
    storedRecords.mockResolvedValue([{ ...STORED, totalMinor: 3485, currency: 'JPY' }]);

    renderPage();

    expect(await screen.findByText(/3,485|3485/)).toBeInTheDocument();
  });

  it('⛔ a total with NO currency is not printed as a bare number (audit pass 2)', async () => {
    // The stored figure is in MINOR units, so "34850" in a Total column is €348.50 misquoted by a
    // hundredfold. D23: a money figure without its currency is a misquote waiting to happen.
    storedRecords.mockResolvedValue([{ ...STORED, currency: null }]);

    renderPage();

    await screen.findByText('137416');
    expect(screen.queryByText(/34850/)).not.toBeInTheDocument();
    expect(screen.queryByText(/348[.,]50/)).not.toBeInTheDocument();
  });

  it('⛔ shows the reference box WITHOUT pressing anything first (D44)', async () => {
    renderPage();

    // The whole objection: "check an order id" used to be a card that appeared only after a
    // different press, inside a panel, inside a thread.
    expect(await screen.findByPlaceholderText('Order or reference number')).toBeInTheDocument();
  });

  it('⛔ the box does not PROMISE a check the lookup cannot run', async () => {
    /**
     * 🔴 SEEN ON STAGING, 2026-09-20. The caption read "Every answer is checked against this
     * customer before it is shown" and sat directly above an answer reading "this integration
     * cannot verify ownership". Whether ownership can be verified is per-lookup configuration
     * (D35 needs a source lookup listing the customer's own records), so the caption cannot know.
     * RED: restore the promise and this fails.
     */
    renderPage();

    await screen.findByPlaceholderText('Order or reference number');
    expect(screen.queryByText(/Every answer is checked against this customer/i)).toBeNull();
    expect(
      screen.getByText(/Each answer says what we could confirm about it/i)
    ).toBeInTheDocument();
  });

  it('checking a reference runs the manual lookup with that value', async () => {
    run.mockResolvedValue([
      { endpointId: 20, label: 'this order', connectionName: 'DeusPower', status: 'ok', rows: [] },
    ]);
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '999999');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ contactId: 5, endpointId: 20, parameter: '999999' })
    );
  });

  it('⛔ presses landing in the SAME TICK still make one call (the ref, not the state)', async () => {
    /**
     * 🔴 THE CASE THE STATE GUARD CANNOT COVER. React flushes a state update between TASKS, so
     * `if (searching) return` holds for two real clicks and fails for anything reaching the
     * handler twice within one tick — a synthetic double-fire, Enter racing the button, a future
     * caller invoking search() directly. `fireEvent` is synchronous, so these three land in one
     * batch and every handler would read the pre-update state.
     *
     * ⛔ It is also the case staging could NOT settle: three presses produced three POSTs there,
     * which is equally consistent with the guard failing and with each fast lookup finishing
     * first, and two attempts to watch the busy state mid-flight froze the renderer.
     * RED: swap the ref back for `if (searching) return` and this reports three calls.
     */
    let release: (value: unknown[]) => void = () => {};
    run.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();

    const box = await screen.findByPlaceholderText('Order or reference number');
    fireEvent.change(box, { target: { value: '42' } });
    const press = screen.getByRole('button', { name: 'Search' });
    // ⛔ RAW dispatch, NOT `fireEvent`. RTL wraps fireEvent in `act()`, which flushes state between
    // events — so a fireEvent version of this test passes against the STATE guard too and proves
    // nothing. These three land in one tick with no flush between them.
    const click = () => press.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click();
    click();
    click();

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    release([]);
  });

  it('⛔ a second press while a lookup is in flight does not call the vendor again', async () => {
    /**
     * 🔴 AUDIT PASS 2, 2026-09-20. The original press was a `Button` with
     * `disabled={searching || !reference.trim()}`; converting to the design-system `SearchInput`
     * dropped it, because that component takes no `disabled` prop. Every extra press is another
     * call to a CLIENT'S vendor against their rate ceiling, racing its own answer back.
     * RED: remove the `if (searching) return` guard and `run` is called twice.
     */
    let release: (value: unknown[]) => void = () => {};
    run.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '42');
    const press = screen.getByRole('button', { name: 'Search' });
    await userEvent.click(press);
    await userEvent.click(press);
    await userEvent.click(press);

    expect(run).toHaveBeenCalledTimes(1);
    release([]);
  });

  it('⛔ a record that is NOT this customer’s carries the SAME flag the panel uses', async () => {
    // Parity: a page opened from a surface must not rename, recolour or soften what that surface
    // said. RED: write this page its own gentler wording and the same record reads as two
    // different verdicts depending where an agent happens to be standing.
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        status: 'ok',
        rows: [{ id: 1 }],
        ownership: 'mismatch',
      },
    ]);
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '999999');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByText(/This record does NOT belong to this customer/i)
    ).toBeInTheDocument();
  });

  it('⛔ the empty state SAYS SO and offers the way forward', async () => {
    // The commonest state on day one: a record exists only once a lookup fetched it.
    storedRecords.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No records held for this customer yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Check a reference above/i)).toBeInTheDocument();
  });

  it('says something different when the workspace has no connected system at all', async () => {
    // POSITIVE CONTROL for the empty state: "nobody has looked them up" and "nothing is set up"
    // are different problems with different fixes, and one message for both sends an agent to
    // press a button that cannot exist.
    storedRecords.mockResolvedValue([]);
    lookupOptions.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No connected system is set up/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Order or reference number')).not.toBeInTheDocument();
  });

  it('⛔ a failed OPTIONS read is not reported as "nothing is configured"', async () => {
    /**
     * 🔴 AUDIT PASS 4, 2026-09-20 — the same defect pass 1 fixed for the records read, sitting in
     * the call directly below it. Whether any lookup EXISTS is a fact about the customer's
     * workspace; whether we could ASK is a fact about us. A failed options read set `lookups` to
     * `[]`, and the empty state then announced that nothing was configured.
     * RED: drop `optionsFailed` and this reads "No connected system is set up".
     */
    storedRecords.mockResolvedValue([]);
    lookupOptions.mockRejectedValue(new Error('500'));
    renderPage();

    expect(
      await screen.findByText(/could not check which lookups are available/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/No connected system is set up/i)).not.toBeInTheDocument();
  });

  it('⛔ a failed load is not reported as "this customer has no records"', async () => {
    // FE/BE skew: this frontend deploys on a push while the backend ships on a tag, so it WILL
    // meet a deployment with no records route. Rendering the empty state there states something
    // false about a customer.
    getById.mockRejectedValue(new Error('404'));
    storedRecords.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByText(/could not be opened/i)).toBeInTheDocument();
    expect(screen.queryByText(/No records held for this customer yet/i)).not.toBeInTheDocument();
  });

  it('⛔ records failing while the CUSTOMER loads is not "no records" either', async () => {
    /**
     * 🔴 AUDIT PASS 1, 2026-09-20 — the likeliest skew of all, and the one the first version got
     * wrong. The contact comes from a DIFFERENT route than the records, so an older backend with
     * no records route answered the customer fine and failed only the records. The page then
     * rendered the customer's name above an empty table, which an agent reads as a fact about the
     * customer. The earlier test rejected BOTH calls and so never reached this path.
     */
    storedRecords.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/could not read this customer/i)).toBeInTheDocument();
    expect(screen.queryByText(/No records held for this customer yet/i)).not.toBeInTheDocument();
  });

  it('one failing read does not blank the other two (SC3)', async () => {
    // RED against `Promise.all`: an older backend missing the OPTIONS route refused to open a
    // customer who exists, records and all.
    lookupOptions.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByText('137416')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Order or reference number')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be opened/i)).not.toBeInTheDocument();
  });

  it('⛔ one customer’s live answers do not survive onto another customer’s page', async () => {
    // Audit pass 1: the route re-renders in place when the id changes, so without a reset the
    // previous customer's results sat under the new customer's name.
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        status: 'ok',
        rows: [{ secret: 'ada-only' }],
      },
    ]);
    // ⛔ A REAL IN-PLACE NAVIGATION, not a fresh mount. Re-rendering a new tree would remount the
    // component and pass no matter what the code does; the defect only exists when the SAME
    // component instance sees a new :id.
    const Harness = () => {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/contacts/6/records')}>
            go to grace
          </button>
          <Routes>
            <Route path="/contacts/:id/records" element={<CustomerRecordsPage />} />
          </Routes>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={['/contacts/5/records']}>
        <Harness />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/ada-only/)).toBeInTheDocument();

    getById.mockResolvedValue({ id: 6, displayName: 'Grace Hopper', primaryEmail: 'g@x.com' });
    await userEvent.click(screen.getByRole('button', { name: 'go to grace' }));

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/ada-only/)).not.toBeInTheDocument());
  });

  it('⛔ an IN-FLIGHT answer does not land on the customer opened while it was running', async () => {
    /**
     * 🔴 THE OTHER DOOR INTO THE TEST ABOVE. That one covers answers already on screen; this one
     * covers the request still in the air. The route re-renders in place, so `search()` keeps a
     * closure over the OLD contact id, `load()` clears the screen for the new customer, and the
     * late response then paints the previous customer's records under the new customer's name —
     * the one thing this page is written never to do.
     *
     * RED: drop the `shownContactId` checks and Ada's record appears on Grace's page.
     */
    let release: (value: unknown[]) => void = () => {};
    run.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const Harness = () => {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/contacts/6/records')}>
            go to grace
          </button>
          <Routes>
            <Route path="/contacts/:id/records" element={<CustomerRecordsPage />} />
          </Routes>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={['/contacts/5/records']}>
        <Harness />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    // Grace opens while Ada's lookup is still running.
    getById.mockResolvedValue({ id: 6, displayName: 'Grace Hopper', primaryEmail: 'g@x.com' });
    storedRecords.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'go to grace' }));
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();

    // ...and only now does Ada's vendor answer come back.
    release([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        status: 'ok',
        rows: [{ secret: 'ada-only' }],
      },
    ]);

    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());
    expect(screen.queryByText(/ada-only/)).not.toBeInTheDocument();
  });

  it('⛔ the NEW customer’s first press is not swallowed by the old one’s lookup', async () => {
    /**
     * 🔴 AUDIT PASS 3 OF THIS FIX, and a defect the fix itself introduced the conditions for. One
     * boolean ref bounds a route that re-renders in place, so while Ada's lookup was still running
     * Grace's first press did nothing at all — no call, no error, no busy state — until a request
     * about a different customer came back. The bound is keyed on the contact instead.
     *
     * RED: make `inFlight` a boolean again and `run` is never called for Grace.
     */
    let release: (value: unknown[]) => void = () => {};
    run.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const Harness = () => {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate('/contacts/6/records')}>
            go to grace
          </button>
          <Routes>
            <Route path="/contacts/:id/records" element={<CustomerRecordsPage />} />
          </Routes>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={['/contacts/5/records']}>
        <Harness />
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    getById.mockResolvedValue({ id: 6, displayName: 'Grace Hopper', primaryEmail: 'g@x.com' });
    await userEvent.click(screen.getByRole('button', { name: 'go to grace' }));
    await screen.findByText('Grace Hopper');

    // Ada's lookup is STILL in flight. Grace's agent presses Search.
    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ contactId: 6, endpointId: 20, parameter: '2' })
    );
    release([]);
  });

  it('⛔ says WHY the page is empty when no lookup keeps a record', async () => {
    /**
     * 🔴 THE G10 GAP, and the state I read three times on 2026-09-20 as the feature being broken.
     * A record is filed under the field an admin tags as its reference; with none tagged the
     * backend stores nothing, so this page is empty for every customer, for ever, and no press an
     * agent can make will change it. The old copy said "Check a reference above, or refresh" —
     * advice that cannot work, on a page that looks broken.
     *
     * RED: restore the generic message and this fails.
     */
    storedRecords.mockResolvedValue([]);
    lookupOptions.mockResolvedValue([{ ...MANUAL_LOOKUP, storesRecords: false }]);

    renderPage();

    expect(await screen.findByText(/The number the customer quotes/i)).toBeInTheDocument();
    expect(screen.queryByText(/Check a reference above, or refresh/i)).not.toBeInTheDocument();
  });

  it('⚠️ an older backend that does not send the flag is NOT read as "nothing tagged"', async () => {
    /**
     * ⛔ THE SKEW CONTROL. The frontend deploys on a push and the backend on a tag, so this page
     * meets a backend whose options carry no `storesRecords` at all. Absent means "this deployment
     * cannot tell me" — rendering that as "your admin tagged nothing" states something false about
     * a workspace's configuration. RED: use `!lookup.storesRecords` instead of `=== false`.
     */
    storedRecords.mockResolvedValue([]);
    const { storesRecords: _omitted, ...olderBackend } = MANUAL_LOOKUP;
    lookupOptions.mockResolvedValue([olderBackend]);

    renderPage();

    expect(await screen.findByText(/Check a reference above, or refresh/i)).toBeInTheDocument();
    expect(screen.queryByText(/The number the customer quotes/i)).not.toBeInTheDocument();
  });

  it('⛔ a live answer renders as LABELLED FIELDS, like the panel it was opened from', async () => {
    /**
     * 🔴 PARITY WITH THE SURFACE IT CAME FROM. This page is opened from the thread panel, and it
     * rendered raw JSON where that panel renders named fields — a page that flattens what the
     * surface before it said makes an agent doubt which one is true. Both now use the same
     * renderer. RED: restore the `<pre>{JSON.stringify(row)}</pre>` and the label is absent.
     */
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        status: 'ok',
        fields: [{ path: 'status', label: 'Where it is', kind: 'plain' }],
        rows: [{ status: 'out for delivery', customer_ip: '203.0.113.7' }],
      },
    ]);
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('WHERE IT IS')).toBeInTheDocument();
    expect(screen.getByText('out for delivery')).toBeInTheDocument();
  });

  it('⛔ what nobody tagged is NOT in the page until the agent asks for it', async () => {
    /**
     * 🔴 A collapsed `<details>` still renders its children, so "hidden" would have meant "in the
     * DOM, findable by the browser's own search and copied by any select-all". On the measured
     * vendor the untagged remainder is 77 fields including the customer's email, telephone, both
     * addresses, postcode, IP and user-agent — a previous "show everything" put exactly that into
     * the thread view. RED: use `<details>` and the IP is present before anything is clicked.
     */
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        status: 'ok',
        fields: [{ path: 'status', label: 'Where it is', kind: 'plain' }],
        rows: [{ status: 'out for delivery', customer_ip: '203.0.113.7' }],
      },
    ]);
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('WHERE IT IS');

    expect(screen.queryByText(/203\.0\.113\.7/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Everything this system returned/ }));

    expect(await screen.findByText(/203\.0\.113\.7/)).toBeInTheDocument();
  });

  it('⛔ a lookup we never ran does not report "nothing found"', async () => {
    /**
     * 🔴 SEEN ON STAGING, 2026-09-21, by pressing Refresh on a real customer. Refresh runs every
     * eligible lookup, and a MANUAL one has no value to run with — the backend answers
     * `needs_input` carrying no reason, which fell through to "Nothing found for that reference".
     * That is false twice over: no reference was submitted, and nothing was looked up. An agent
     * reads it as "this customer has no such record" and stops looking.
     * RED: restore the bare fallback and this fails.
     */
    run.mockResolvedValue([
      { endpointId: 20, label: 'this order', connectionName: 'DeusPower', status: 'needs_input', rows: [] },
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /Refresh from source/ }));

    expect(await screen.findByText(/Type a reference above to check this one/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing found for that reference/)).toBeNull();
  });

  it('⛔ nor does a lookup that had no address to key on', async () => {
    // `no_identity` is the same class: not asking is not the same answer as asking and finding
    // nothing, and only one of the two says anything about the customer.
    run.mockResolvedValue([
      { endpointId: 20, label: 'their account', connectionName: 'DeusPower', status: 'no_identity', rows: [] },
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /Refresh from source/ }));

    expect(await screen.findByText(/no email address for us to look them up by/)).toBeInTheDocument();
  });

  it('⛔ a real miss still says so — the control', async () => {
    // Without this, copy that never said "nothing found" would pass both tests above while
    // hiding the one state where that sentence is true.
    run.mockResolvedValue([
      { endpointId: 20, label: 'this order', connectionName: 'DeusPower', status: 'no_match', rows: [] },
    ]);
    renderPage();

    await userEvent.type(await screen.findByPlaceholderText('Order or reference number'), '999');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(/Nothing found for that reference/)).toBeInTheDocument();
  });

  it('a non-numeric id is a not-found state, not a request', async () => {
    renderPage('not-a-number');

    expect(await screen.findByText(/could not be opened/i)).toBeInTheDocument();
    expect(getById).not.toHaveBeenCalled();
  });
});
