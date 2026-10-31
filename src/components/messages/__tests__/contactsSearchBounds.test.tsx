import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsView } from '@/components/messages/ContactsView';
import { SurfaceCount } from '@/components/messages/filters/SurfaceCount';

/**
 * The contacts list under the backend's bounds (2026-10-31). A common word made the list group
 * every match with no limit (21–27 s on staging); it now stops at the list's time limit and says
 * so. An unfinished answer must never read as "no contacts", and a lower-bound count never as exact.
 */
const { getContacts } = vi.hoisted(() => ({ getContacts: vi.fn() }));
vi.mock('@/services/contact.service', () => ({
  contactService: { getNoteSummary: vi.fn() },
}));
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: { getContacts, getContactSubjects: vi.fn(), getById: vi.fn() },
}));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/hooks/useLeadsHidden', () => ({ useLeadsHidden: () => false }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const row = (sender: string) => ({
  sender,
  messageCount: 1,
  subjectCount: 1,
  lastMessageAt: '2026-10-01T00:00:00Z',
  hasUnread: false,
  hasTicket: false,
  isLead: false,
  hasOpen: true,
  noteCount: 0,
  latestNote: null,
});

const show = (apiFilters: Record<string, string>) =>
  render(
    <MemoryRouter>
      <ContactsView apiFilters={apiFilters} onOpenMessage={vi.fn()} />
    </MemoryRouter>
  );

afterEach(() => {
  vi.clearAllMocks();
});

describe('Contacts when the backend stopped the list', () => {
  it('a search that ran out of time says so, and never "No senders match"', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasMore: false,
        totalCapped: true,
        countTimedOut: true,
      },
      timedOut: true,
    });
    show({ search: 'parcel' });
    await waitFor(() =>
      expect(screen.getByText(/This search took too long and was stopped/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/No senders match/)).not.toBeInTheDocument();
  });

  it('a plain list that ran out of time asks for a refresh, not a narrower search', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
      timedOut: true,
    });
    show({});
    await waitFor(() =>
      expect(screen.getByText(/This list took too long to load/)).toBeInTheDocument()
    );
  });

  it('CONTROL: an empty answer that finished still says nobody matches', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
      timedOut: false,
    });
    show({ search: 'zzqxw' });
    await waitFor(() => expect(screen.getByText(/No senders match/)).toBeInTheDocument());
    expect(screen.queryByText(/took too long/)).not.toBeInTheDocument();
  });

  it('a count that is a lower bound shows as "N+"; an exact one without the plus (CONTROL)', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [row('a@example.com')],
      pagination: {
        page: 1,
        limit: 50,
        total: 51,
        totalPages: 2,
        hasMore: true,
        totalCapped: true,
        countTimedOut: true,
      },
      timedOut: false,
    });
    const { unmount } = show({ search: 'parcel' });
    // The header and the pagination both say it.
    await waitFor(() => expect(screen.getAllByText('51+').length).toBeGreaterThan(0));
    unmount();
    getContacts.mockResolvedValue({
      success: true,
      data: [row('a@example.com')],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false },
      timedOut: false,
    });
    show({ search: 'parcel' });
    await waitFor(() => expect(screen.getByText('a@example.com')).toBeInTheDocument());
    expect(screen.queryByText('1+')).not.toBeInTheDocument();
  });
});

describe('the header count on Contacts', () => {
  const base = { page: 1, limit: 50 };
  it('a lower bound reads "N+ contacts"', () => {
    render(<SurfaceCount noun="contacts" pagination={{ ...base, total: 51, totalCapped: true }} />);
    expect(screen.getByText('51+')).toBeInTheDocument();
  });

  it('a count that did not finish is "not counted", never "No contacts"', () => {
    render(
      <SurfaceCount
        noun="contacts"
        pagination={{ ...base, total: 0, totalCapped: true, countTimedOut: true }}
      />
    );
    expect(screen.getByText('Contacts not counted')).toBeInTheDocument();
    expect(screen.queryByText('No contacts')).not.toBeInTheDocument();
  });

  it('CONTROL: a finished count of zero is "No contacts"', () => {
    render(<SurfaceCount noun="contacts" pagination={{ ...base, total: 0 }} />);
    expect(screen.getByText('No contacts')).toBeInTheDocument();
  });
});
