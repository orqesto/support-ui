import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ContactNotesIndicator,
  NOTE_PREVIEW_CHARS,
  notifyContactNotesChanged,
  type LatestNotePreview,
} from '../ContactNotesIndicator';
import { useCustomerNotesMark } from '../useCustomerNoteSummary';
import { ContactsView } from '@/components/messages/ContactsView';

/**
 * The "this customer has notes" icon (2026-10-16): a count and the newest note on hover — a button
 * that opens the notes in the contacts list, a plain mark on the message's Customer tab label
 * (owner, 2026-10-17: on the tab, visible from any tab; a click is the tab's own).
 */
const { getContacts, panelProps, getNoteSummary } = vi.hoisted(() => ({
  getContacts: vi.fn(),
  panelProps: vi.fn(),
  getNoteSummary: vi.fn(),
}));
// Lead UI visibility reads the workspace's lead config through react-query; not under test here.
vi.mock('@/hooks/useLeadsHidden', () => ({ useLeadsHidden: () => false }));
vi.mock('@/services/contact.service', () => ({ contactService: { getNoteSummary } }));
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: { getContacts, getContactSubjects: vi.fn(), getById: vi.fn() },
}));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({
  ContactProfilePanel: (props: { email: string; initialSection?: string }) => {
    panelProps(props);
    return <div data-testid="profile-drawer">{`${props.email}|${props.initialSection ?? ''}`}</div>;
  },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const NOTE: LatestNotePreview = {
  content: 'Prefers a call before noon',
  createdAt: '2026-10-01T09:00:00Z',
  authorFirstName: 'Ada',
  authorLastName: 'Agent',
};

const hover = () => {
  vi.useFakeTimers();
  fireEvent.mouseEnter(screen.getByTestId('contact-notes-indicator').parentElement!);
  act(() => {
    vi.advanceTimersByTime(300);
  });
  vi.useRealTimers();
  return screen.getByTestId('contact-notes-preview');
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ContactNotesIndicator', () => {
  it('renders nothing when the customer has no notes', () => {
    const { container } = render(
      <ContactNotesIndicator count={0} latest={null} onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and, on hover, the newest note with its author and how many more', () => {
    render(<ContactNotesIndicator count={3} latest={NOTE} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '3 notes about this customer' })).toHaveTextContent(
      '3'
    );
    const preview = hover();
    expect(preview).toHaveTextContent('Prefers a call before noon');
    expect(preview).toHaveTextContent('Ada Agent');
    expect(preview).toHaveTextContent('+2 more');
    expect(preview.textContent).not.toContain('…');
  });

  it('a single note says "1 note" and no "+more"', () => {
    render(<ContactNotesIndicator count={1} latest={NOTE} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '1 note about this customer' })).toBeInTheDocument();
    expect(hover().textContent).not.toContain('more');
  });

  it('cuts a long note to the preview length and marks the cut', () => {
    const long = 'y'.repeat(NOTE_PREVIEW_CHARS + 40);
    render(
      <ContactNotesIndicator count={1} latest={{ ...NOTE, content: long }} onOpen={vi.fn()} />
    );
    const preview = hover();
    expect(preview.textContent).toContain(`${'y'.repeat(NOTE_PREVIEW_CHARS)}…`);
    expect(preview.textContent).not.toContain('y'.repeat(NOTE_PREVIEW_CHARS + 1));
  });

  it('marks a note the server already cut', () => {
    render(
      <ContactNotesIndicator count={1} latest={{ ...NOTE, truncated: true }} onOpen={vi.fn()} />
    );
    expect(hover().textContent).toContain('noon…');
  });

  it('a click opens the notes and does not reach the row it sits in', () => {
    const onOpen = vi.fn();
    const onRow = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRow}>
        <ContactNotesIndicator count={2} latest={NOTE} onOpen={onOpen} />
      </div>
    );
    fireEvent.click(screen.getByTestId('contact-notes-indicator'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('keeps Enter/Space from the row but lets other keys (Escape) bubble', () => {
    const onKey = vi.fn();
    render(
      <div
        onKeyDown={(event) => {
          onKey(event.key);
        }}
      >
        <ContactNotesIndicator count={2} latest={NOTE} onOpen={vi.fn()} />
      </div>
    );
    const button = screen.getByTestId('contact-notes-indicator');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onKey.mock.calls).toEqual([['Escape']]);
  });
});

describe('Customer tab label mark', () => {
  const NOTES = [
    {
      id: 2,
      contactId: 1,
      userId: 1,
      content: 'newest',
      createdAt: '2026-10-02T00:00:00Z',
      authorFirstName: 'Ada',
      authorLastName: null,
    },
    {
      id: 1,
      contactId: 1,
      userId: 1,
      content: 'older',
      createdAt: '2026-10-01T00:00:00Z',
      authorFirstName: 'Ada',
      authorLastName: null,
    },
  ];
  const Mark = ({ email, notes }: { email: string; notes?: typeof NOTES }) => (
    <>{useCustomerNotesMark(email, notes).mark}</>
  );

  it('without onOpen it is a plain mark, no button of its own (it sits inside the tab button)', () => {
    render(<ContactNotesIndicator count={2} latest={NOTE} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('2');
    expect(hover()).toHaveTextContent('Prefers a call before noon');
  });

  it('before the profile loads it shows the read-only summary for the sender', async () => {
    getNoteSummary.mockResolvedValue({ count: 3, latest: NOTE });
    render(<Mark email="ann@example.com" />);
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('3')
    );
    expect(getNoteSummary).toHaveBeenCalledWith('ann@example.com');
  });

  it('once the profile is loaded its notes win: count and newest', () => {
    getNoteSummary.mockResolvedValue({ count: 9, latest: NOTE });
    render(<Mark email="ann@example.com" notes={NOTES} />);
    expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('2');
    expect(hover()).toHaveTextContent('newest');
  });

  it('a note changed elsewhere refetches the summary', async () => {
    getNoteSummary.mockResolvedValue({ count: 1, latest: NOTE });
    render(<Mark email="ann@example.com" />);
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('1')
    );
    getNoteSummary.mockResolvedValue({ count: 0, latest: null });
    act(() => notifyContactNotesChanged());
    await waitFor(() =>
      expect(screen.queryByTestId('contact-notes-indicator')).not.toBeInTheDocument()
    );
  });

  it('two quick changes: the older answer landing last does not win (review 2026-10-19)', async () => {
    getNoteSummary.mockResolvedValueOnce({ count: 1, latest: NOTE });
    render(<Mark email="ann@example.com" />);
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('1')
    );
    const answers: Array<(summary: { count: number; latest: LatestNotePreview }) => void> = [];
    getNoteSummary.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    act(() => notifyContactNotesChanged());
    act(() => notifyContactNotesChanged());
    await act(async () => {
      answers[1]({ count: 3, latest: NOTE });
      await Promise.resolve();
    });
    await act(async () => {
      answers[0]({ count: 2, latest: NOTE });
      await Promise.resolve();
    });
    expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('3');
  });

  it('screen readers hear the full count inside the tab, not a bare number', () => {
    render(<ContactNotesIndicator count={2} latest={NOTE} />);
    const mark = screen.getByTestId('contact-notes-indicator');
    expect(mark).not.toHaveAttribute('aria-label');
    expect(mark.querySelector('.sr-only')).toHaveTextContent('2 notes about this customer');
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
  });

  it('[control] a backend without the route (or no access) shows no mark and no error', async () => {
    getNoteSummary.mockRejectedValue(new Error('404'));
    render(<Mark email="ann@example.com" />);
    await waitFor(() => expect(getNoteSummary).toHaveBeenCalled());
    expect(screen.queryByTestId('contact-notes-indicator')).not.toBeInTheDocument();
  });
});

describe('Contacts list', () => {
  const row = (sender: string, extra: object) => ({
    sender,
    messageCount: 1,
    subjectCount: 1,
    lastMessageAt: '2026-10-01T00:00:00Z',
    hasUnread: false,
    hasTicket: false,
    isLead: false,
    ...extra,
  });

  it('flags only customers with notes; the icon opens the drawer on the notes, the row on the profile', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [
        row('noted@example.com', { noteCount: 3, latestNote: NOTE }),
        row('plain@example.com', { noteCount: 0, latestNote: null }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1, hasMore: false },
    });
    render(
      <MemoryRouter>
        <ContactsView apiFilters={{}} onOpenMessage={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getAllByTestId('contact-notes-indicator')).toHaveLength(1));
    expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('3');

    fireEvent.click(screen.getByTestId('contact-notes-indicator'));
    expect(screen.getByTestId('profile-drawer')).toHaveTextContent('noted@example.com|notes');

    fireEvent.click(screen.getByText('plain@example.com'));
    expect(screen.getByTestId('profile-drawer')).toHaveTextContent('plain@example.com|');
    expect(screen.getByTestId('profile-drawer').textContent).not.toContain('notes');
  });

  it('a note changed anywhere refreshes the list in place: rows stay, no skeleton', async () => {
    getContacts.mockResolvedValue({
      success: true,
      data: [row('noted@example.com', { noteCount: 1, latestNote: NOTE })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false },
    });
    render(
      <MemoryRouter>
        <ContactsView apiFilters={{}} onOpenMessage={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('1')
    );
    fireEvent.click(screen.getByTestId('contact-notes-indicator'));
    getContacts.mockResolvedValue({
      success: true,
      data: [row('noted@example.com', { noteCount: 2, latestNote: NOTE })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false },
    });
    // A note added anywhere (here: the drawer) announces itself.
    act(() => notifyContactNotesChanged());
    // Synchronously after the call: a loud refresh would already show the skeleton.
    expect(screen.getByText('noted@example.com')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('2')
    );
    expect(getContacts).toHaveBeenCalledTimes(2);
  });
});
