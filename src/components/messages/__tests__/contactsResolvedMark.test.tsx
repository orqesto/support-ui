import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsView } from '@/components/messages/ContactsView';

/**
 * Contacts lists resolved customers beside open ones (2026-10-20), so a contact with no open
 * thread carries a "Resolved" mark — under "All" only, where the flag covers every lifecycle.
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
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const row = (sender: string, hasOpen: boolean | undefined) => ({
  sender,
  messageCount: 1,
  subjectCount: 1,
  lastMessageAt: '2026-10-01T00:00:00Z',
  hasUnread: false,
  hasTicket: false,
  isLead: false,
  noteCount: 0,
  latestNote: null,
  ...(hasOpen === undefined ? {} : { hasOpen }),
});

const show = async (apiFilters: Record<string, string>) => {
  getContacts.mockResolvedValue({
    success: true,
    data: [
      row('done@example.com', false),
      row('busy@example.com', true),
      row('old-api@example.com', undefined),
    ],
    pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
  });
  render(
    <MemoryRouter>
      <ContactsView apiFilters={apiFilters} onOpenMessage={vi.fn()} />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('done@example.com')).toBeInTheDocument());
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('the Resolved mark in Contacts', () => {
  it('marks only the contact with no open thread under "All"', async () => {
    await show({});
    expect(screen.getAllByText('Resolved')).toHaveLength(1);
    expect(screen.getByText('done@example.com').parentElement).toHaveTextContent('Resolved');
  });

  it('CONTROL: a backend without the field marks nobody', async () => {
    await show({});
    expect(screen.getByText('old-api@example.com').parentElement).not.toHaveTextContent('Resolved');
  });

  it('CONTROL: under a status filter the flag covers only that filter, so nobody is marked', async () => {
    await show({ view: 'resolved' });
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
  });
});
