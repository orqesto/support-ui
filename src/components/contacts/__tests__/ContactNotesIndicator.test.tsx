import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ContactNotesIndicator,
  NOTE_PREVIEW_CHARS,
  type LatestNotePreview,
} from '../ContactNotesIndicator';
import { CustomerSenderBlock } from '@/components/messages/CustomerTabPanels';
import { ContactsView } from '@/components/messages/ContactsView';
import type { Message } from '@/types';

/**
 * The "this customer has notes" icon (2026-10-16): a count, the newest note on hover, a click that
 * opens the notes — in the contacts list and next to the name on the message's Customer tab.
 */
const { getContacts, panelProps } = vi.hoisted(() => ({
  getContacts: vi.fn(),
  panelProps: vi.fn(),
}));
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

describe('Customer tab — next to the name', () => {
  const message = { sender: 'Ann Example <ann@example.com>', channel: 'email' } as Message;

  it('shows the icon once the profile has notes, newest first, and a click scrolls to them', () => {
    const scrollIntoView = vi.fn();
    render(
      <div>
        <CustomerSenderBlock
          message={message}
          notes={[
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
          ]}
        />
        <div data-contact-notes="" ref={(el) => el && (el.scrollIntoView = scrollIntoView)} />
      </div>
    );
    expect(screen.getByRole('button', { name: '2 notes about this customer' })).toBeInTheDocument();
    expect(hover()).toHaveTextContent('newest');
    fireEvent.click(screen.getByTestId('contact-notes-indicator'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('[control] no icon while the profile is not loaded or has no notes', () => {
    const { rerender } = render(<CustomerSenderBlock message={message} />);
    expect(screen.queryByTestId('contact-notes-indicator')).not.toBeInTheDocument();
    rerender(<CustomerSenderBlock message={message} notes={[]} />);
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

  it('a note added in the drawer refreshes the list in place: rows stay, no skeleton', async () => {
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
    const { onNotesChanged } = panelProps.mock.lastCall![0] as { onNotesChanged: () => void };
    act(() => onNotesChanged());
    // Synchronously after the call: a loud refresh would already show the skeleton.
    expect(screen.getByText('noted@example.com')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('contact-notes-indicator')).toHaveTextContent('2')
    );
    expect(getContacts).toHaveBeenCalledTimes(2);
  });
});
