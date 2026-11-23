import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactsView } from '@/features/messages/components/ContactsView';

/**
 * Website visitors who left no email share one stored requester, so the contacts list returns
 * them as ONE row. They are not one person: the row is named "Website visitors (no email)", opens
 * no profile (notes, labels and a manager on it would be every such visitor's) and does not
 * expand into one list of "topics".
 */
const { getContacts, getContactSubjects } = vi.hoisted(() => ({
  getContacts: vi.fn(),
  getContactSubjects: vi.fn(),
}));
vi.mock('@/services/contact.service', () => ({
  contactService: { getNoteSummary: vi.fn() },
}));
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: { getContacts, getContactSubjects, getById: vi.fn() },
}));
// The stand-in takes the real panel's `email` prop and says which profile was opened.
vi.mock('@/features/contacts/components/ContactProfilePanel', () => ({
  ContactProfilePanel: ({ email }: { email: string }) => (
    <div data-testid="profile-panel">{email}</div>
  ),
}));
vi.mock('@/features/messages/hooks/useLeadsHidden', () => ({ useLeadsHidden: () => false }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitors (no email)';

const row = (sender: string, noteCount = 0) => ({
  sender,
  messageCount: 2,
  subjectCount: 1,
  lastMessageAt: '2026-10-01T00:00:00Z',
  hasUnread: false,
  hasTicket: false,
  isLead: false,
  noteCount,
  latestNote: noteCount > 0 ? { content: 'A note', createdAt: '2026-10-01T00:00:00Z' } : null,
});

const show = async () => {
  getContacts.mockResolvedValue({
    success: true,
    data: [row(PLACEHOLDER, 3), row('ada@example.com', 3)],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1, hasMore: false },
  });
  getContactSubjects.mockResolvedValue({ data: [] });
  render(
    <MemoryRouter>
      <ContactsView apiFilters={{}} onOpenMessage={vi.fn()} />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('ada@example.com')).toBeInTheDocument());
};
/** The row's identity block: the element the profile opens from. */
const identity = (text: string) => screen.getByText(text).parentElement?.parentElement?.parentElement as HTMLElement;

afterEach(() => {
  vi.clearAllMocks();
});

describe('the contacts list and a website visitor with no email', () => {
  it('names the row by the label and never prints the placeholder', async () => {
    await show();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('chat-widget.local');
  });

  it('opens no profile from the row: not a button, a press and Enter do nothing', async () => {
    await show();
    const block = identity(LABEL);
    expect(block.getAttribute('role')).toBeNull();
    expect(block.getAttribute('tabindex')).toBeNull();
    fireEvent.click(screen.getByText(LABEL));
    fireEvent.keyDown(block, { key: 'Enter' });
    expect(screen.queryByTestId('profile-panel')).toBeNull();
  });

  it('CONTROL: a customer with an email opens their profile from the same place', async () => {
    await show();
    const block = identity('ada@example.com');
    expect(block.getAttribute('role')).toBe('button');
    fireEvent.click(screen.getByText('ada@example.com'));
    expect(screen.getByTestId('profile-panel').textContent).toBe('ada@example.com');
  });

  it('shows no notes mark for the shared row; a customer keeps theirs', async () => {
    await show();
    const marks = screen.getAllByRole('button', { name: /note/i });
    expect(marks.some((mark) => identity('ada@example.com').contains(mark))).toBe(true);
    expect(marks.some((mark) => identity(LABEL).contains(mark))).toBe(false);
  });

  it('does not expand: no topics control, no topics count, and the threads are never read as one list', async () => {
    await show();
    const rowEl = identity(LABEL).parentElement as HTMLElement;
    expect(rowEl.querySelector('button[aria-label="Show topics"]')).toBeNull();
    expect(rowEl.textContent).not.toMatch(/topic/);
    // Their threads are still counted.
    expect(rowEl.querySelector('[title="2 threads"]')).not.toBeNull();
    // Nothing in the row can be pressed at all.
    expect(rowEl.querySelector('button, [role="button"]')).toBeNull();
    fireEvent.click(rowEl.firstElementChild as HTMLElement);
    await Promise.resolve();
    expect(getContactSubjects).not.toHaveBeenCalled();
  });

  it('CONTROL: a customer’s row expands into their topics', async () => {
    await show();
    const rowEl = identity('ada@example.com').parentElement as HTMLElement;
    expect(rowEl.textContent).toMatch(/1 topic/);
    fireEvent.click(rowEl.querySelector('button[aria-label="Show topics"]') as HTMLElement);
    await waitFor(() => expect(getContactSubjects).toHaveBeenCalledWith('ada@example.com', {}));
  });
});
