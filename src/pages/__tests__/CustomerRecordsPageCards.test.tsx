/**
 * The records page shows the thread panel's card (2026-10-14): reference names on the box, one
 * typed value against every typed-value lookup, per-card errors, and the D1 rule for agents.
 * Split from `CustomerRecordsPage.test.tsx` for the file-size limit; same harness, neutral data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

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
const MANUAL_LOOKUP = {
  endpointId: 20,
  label: 'User details',
  connectionName: 'Militech',
  parameterSource: 'manual',
  resultShape: 'one',
  category: null,
  storesRecords: true,
};
const TICKET_LOOKUP = {
  ...MANUAL_LOOKUP,
  endpointId: 21,
  label: 'Ticket',
  connectionName: 'Acme',
  referenceLabel: 'Ticket id',
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/contacts/5/records']}>
      <Routes>
        <Route path="/contacts/:id/records" element={<CustomerRecordsPage />} />
      </Routes>
    </MemoryRouter>
  );

const searchFor = async (box: string, value: string) => {
  await userEvent.type(await screen.findByPlaceholderText(box), value);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
  getById.mockResolvedValue(CONTACT);
  storedRecords.mockResolvedValue([]);
  lookupOptions.mockResolvedValue([MANUAL_LOOKUP]);
  run.mockResolvedValue([]);
});

describe('CustomerRecordsPage — the shared card', () => {
  it('the box is named by the configured reference names', async () => {
    lookupOptions.mockResolvedValue([
      { ...MANUAL_LOOKUP, referenceLabel: 'User id' },
      TICKET_LOOKUP,
    ]);
    renderPage();
    expect(await screen.findByPlaceholderText('User id or Ticket id')).toBeInTheDocument();
    expect(screen.getByText('User id or Ticket id')).toBeInTheDocument();
  });

  it('one typed value runs against every typed-value lookup; each card uses its own name, grey when unknown', async () => {
    lookupOptions.mockResolvedValue([
      { ...MANUAL_LOOKUP, referenceLabel: 'User id' },
      TICKET_LOOKUP,
    ]);
    run.mockImplementation((body: { endpointId: number }) =>
      Promise.resolve(
        body.endpointId === 20
          ? [
              {
                endpointId: 20,
                label: 'User details',
                connectionName: 'Militech',
                status: 'no_match',
                rows: [],
                referenceLabel: 'User id',
                searchedFor: { kind: 'reference', value: '42' },
                // An older backend attached a verdict to a not-found; the card must not show it.
                ownership: 'mismatch',
              },
            ]
          : [
              {
                endpointId: 21,
                label: 'Ticket',
                connectionName: 'Acme',
                status: 'no_match',
                rows: [],
                referenceLabel: 'Ticket id',
                searchedFor: { kind: 'reference', value: '42' },
              },
            ]
      )
    );
    renderPage();
    await searchFor('User id or Ticket id', '42');
    const militech = await screen.findByText('No User id 42 in Militech.');
    expect(militech.className).toContain('text-muted-foreground');
    expect(screen.getByText('No Ticket id 42 in Acme.')).toBeInTheDocument();
    expect(screen.queryByText(/does NOT belong/)).toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('per-card errors: one lookup failing does not hide the other, and is said on ITS card', async () => {
    lookupOptions.mockResolvedValue([MANUAL_LOOKUP, TICKET_LOOKUP]);
    run.mockImplementation((body: { endpointId: number }) => {
      if (body.endpointId === 21) {
        return Promise.reject(Object.assign(new Error('boom'), { status: 500 }));
      }
      return Promise.resolve([
        {
          endpointId: 20,
          label: 'User details',
          connectionName: 'Militech',
          status: 'ok',
          rows: [{ id: '42' }],
          fields: [{ path: 'id', label: 'Id', kind: 'plain' }],
        },
      ]);
    });
    renderPage();
    await searchFor('Reference or Ticket id', '42');
    expect(await screen.findByText('This lookup could not be completed.')).toBeInTheDocument();
    expect(screen.getByText('Ticket')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText(/That lookup could not be completed. Try again/)).toBeNull();
  });

  it('shape_changed no longer reads "Nothing found"; an agent is sent to an admin', async () => {
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'User details',
        connectionName: 'Militech',
        status: 'shape_changed',
        rows: [],
        missing: ['data'],
      },
    ]);
    renderPage();
    await searchFor('Reference', '1');
    expect(
      await screen.findByText('This lookup needs attention from an admin.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing found/)).toBeNull();
  });

  it('⛔ D1 — an older backend’s raw failure text never reaches an agent here either', async () => {
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'User details',
        connectionName: 'Militech',
        status: 'failed',
        rows: [],
        reason: 'HTTP 401 from api.militech.example: key sk-test-123 rejected',
      },
    ]);
    renderPage();
    await searchFor('Reference', '1');
    expect(await screen.findByText('This lookup could not be completed.')).toBeInTheDocument();
    expect(screen.queryByText(/sk-test-123/)).toBeNull();
    expect(screen.getByText('An admin can see the details.')).toBeInTheDocument();
  });

  it('a found record keeps "Everything this system returned" under the shared card', async () => {
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'User details',
        connectionName: 'Militech',
        status: 'ok',
        rows: [{ id: '42', note: 'untagged-value' }],
        fields: [{ path: 'id', label: 'Id', kind: 'plain' }],
        ownership: 'owned',
      },
    ]);
    renderPage();
    await searchFor('Reference', '42');
    expect(await screen.findByText('Belongs to this customer')).toBeInTheDocument();
    expect(screen.queryByText(/untagged-value/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Everything this system returned/ }));
    expect(screen.getByText(/untagged-value/)).toBeInTheDocument();
  });

  it('a lookup request that threw keeps what went wrong for an admin’s Details', async () => {
    useAuthStore.setState({
      selectedOrganizationId: 1,
      user: { id: 9, role: 'user', organizationRole: 'org_admin' } as User,
    });
    run.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 502 }));
    renderPage();
    await searchFor('Reference', '1');
    expect(await screen.findByText('This lookup could not be completed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText('The request failed (HTTP 502).')).toBeInTheDocument();
  });
});
