/**
 * CA-6 — the customer records page.
 *
 * 🔴 The gate that matters most is the FIRST one: opening this page must not call a vendor. D45
 * chose "stored on load, live on demand" precisely so a page could exist without reversing SC1,
 * and a regression there is invisible to the eye — the page looks identical either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

  it('⛔ shows the reference box WITHOUT pressing anything first (D44)', async () => {
    renderPage();

    // The whole objection: "check an order id" used to be a card that appeared only after a
    // different press, inside a panel, inside a thread.
    expect(await screen.findByPlaceholderText('Order or reference number')).toBeInTheDocument();
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

  it('a non-numeric id is a not-found state, not a request', async () => {
    renderPage('not-a-number');

    expect(await screen.findByText(/could not be opened/i)).toBeInTheDocument();
    expect(getById).not.toHaveBeenCalled();
  });
});
