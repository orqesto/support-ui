import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsView } from '@/components/messages/ContactsView';

/**
 * Contacts come newest ACTIVITY first from the backend (2026-11-01): a customer we just answered
 * moves up even when their last message arrived earlier. "Recent" must keep that order — it used
 * to re-sort each page by received time, so the screen disagreed with how pages are built.
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

const row = (sender: string, lastMessageAt: string, hasUnread = false) => ({
  sender,
  messageCount: 1,
  subjectCount: 1,
  lastMessageAt,
  hasUnread,
  hasTicket: false,
  isLead: false,
  hasOpen: true,
  noteCount: 0,
  latestNote: null,
});

afterEach(() => {
  vi.clearAllMocks();
});

const shownOrder = () =>
  screen
    .getAllByText(/@example\.com$/)
    .map((element) => element.textContent)
    .filter((text, index, all) => all.indexOf(text) === index);

describe('Contacts — "Recent" is the server order', () => {
  it('keeps a customer we just answered first, although their last message arrived earlier', async () => {
    getContacts.mockResolvedValue({
      success: true,
      // Server order: answered@ has the newest activity; newer@ wrote more recently.
      data: [
        row('answered@example.com', '2026-10-01T00:00:00Z'),
        row('newer@example.com', '2026-10-20T00:00:00Z'),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1, hasMore: false },
    });
    render(
      <MemoryRouter>
        <ContactsView apiFilters={{}} onOpenMessage={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('answered@example.com')).toBeInTheDocument());
    expect(shownOrder()).toEqual(['answered@example.com', 'newer@example.com']);
  });
});
