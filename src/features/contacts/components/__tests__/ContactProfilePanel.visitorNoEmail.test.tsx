/**
 * The contact drawer never prints the placeholder a website visitor without an email is stored
 * under: its heading, the address line and a linked contact read "Website visitor (no email)" /
 * "no email". The real drawer and its real details; only the data hooks are supplied.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactProfilePanel } from '../ContactProfilePanel';

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitor (no email)';

const { state, noop } = vi.hoisted(() => ({
  state: { contact: null as unknown },
  noop: () => {},
}));
const contact = (over: Record<string, unknown>) => ({
  id: 9,
  primaryEmail: 'ada@example.com',
  displayName: null,
  assignedUserId: null,
  assignedUserFirstName: null,
  assignedUserLastName: null,
  createdAt: '2026-10-01T10:00:00Z',
  labels: [],
  notes: [],
  profiles: [],
  linkedContacts: [],
  stats: { messageCount: 0, lastMessageAt: null },
  recentMessages: [],
  recentTickets: [],
  ...over,
});

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ABC' }));
vi.mock('@/features/custom-api/components/lookupsTab', () => ({
  useLookupsTab: () => ({ available: false, count: 0, label: 'Lookups' }),
}));
// Every key ContactProfilePanel destructures; booleans false, inputs empty.
vi.mock('@/features/contacts/hooks/useContactProfile', () => ({
  useContactProfile: () => ({
    contact: state.contact,
    loading: false,
    users: [],
    availableLabels: [],
    editingName: false,
    setEditingName: noop,
    nameInput: '',
    setNameInput: noop,
    savingName: false,
    handleSaveName: noop,
    noteInput: '',
    setNoteInput: noop,
    addingNote: false,
    handleAddNote: noop,
    handleDeleteNote: noop,
    showLabelPicker: false,
    setShowLabelPicker: noop,
    handleAddLabel: noop,
    handleRemoveLabel: noop,
    handleCreateLabel: noop,
    creatingLabel: false,
    handleAssign: noop,
    profileTypeInput: 'email',
    setProfileTypeInput: noop,
    profileValueInput: '',
    setProfileValueInput: noop,
    profileLabelInput: '',
    setProfileLabelInput: noop,
    addingProfile: false,
    showProfileForm: false,
    setShowProfileForm: noop,
    handleAddProfile: noop,
    handleDeleteProfile: noop,
    linkEmailInput: '',
    setLinkEmailInput: noop,
    linkingEmail: false,
    handleLinkEmail: noop,
    handleUnlink: noop,
  }),
}));

const show = (record: Record<string, unknown>) => {
  state.contact = contact(record);
  render(
    <MemoryRouter>
      <ContactProfilePanel email="ada@example.com" onClose={noop} />
    </MemoryRouter>
  );
};
const noPlaceholder = () => expect(document.body.innerHTML).not.toContain('chat-widget.local');

afterEach(cleanup);

describe('the contact drawer and a website visitor with no email', () => {
  it('is headed by the label, with "no email" where the address would be', () => {
    show({ primaryEmail: PLACEHOLDER });
    expect(screen.getByRole('heading', { name: LABEL })).toBeInTheDocument();
    expect(screen.getByText('no email')).toBeInTheDocument();
    noPlaceholder();
  });

  it('keeps a name', () => {
    show({ primaryEmail: PLACEHOLDER, displayName: 'Dana' });
    expect(screen.getByRole('heading', { name: 'Dana' })).toBeInTheDocument();
    expect(screen.getByText('no email')).toBeInTheDocument();
    noPlaceholder();
  });

  it('names a linked contact that is such a visitor, with and without a name', () => {
    show({
      linkedContacts: [
        { id: 31, primaryEmail: PLACEHOLDER, displayName: null },
        { id: 32, primaryEmail: PLACEHOLDER, displayName: 'Dana' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getByText('no email')).toBeInTheDocument();
    noPlaceholder();
  });

  it('CONTROL: a customer and a linked contact with an email are shown by it', () => {
    show({ linkedContacts: [{ id: 31, primaryEmail: 'bo@example.com', displayName: null }] });
    expect(screen.getByRole('heading', { name: 'ada@example.com' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('bo@example.com')).toBeInTheDocument();
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});
