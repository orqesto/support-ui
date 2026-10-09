import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactProfilePanel } from '../ContactProfilePanel';

/**
 * The contact drawer's Lookups tab (spec CUSTOM-API-LOOKUPS-TAB 2026-10-09): third after Activity
 * and Details, only when lookups are available, named by the shared-category rule; the lookup
 * panel left Details. The drawer's own data and sub-panels are stubbed — this pins the TABS.
 */
const { lookupsTab, CONTACT, noop } = vi.hoisted(() => ({
  lookupsTab: vi.fn(),
  CONTACT: {
    id: 9,
    primaryEmail: 'c@d.example',
    displayName: 'C D',
    labels: [],
    stats: { messageCount: 0, lastMessageAt: null },
    recentMessages: [],
    recentTickets: [],
    notes: [],
    assignedUserFirstName: null,
  },
  noop: () => {},
}));
vi.mock('@/components/messages/lookupsTab', () => ({
  useLookupsTab: (surface: string) => lookupsTab(surface) as unknown,
}));
vi.mock('@/components/messages/CustomApiLookupPanel', () => ({
  CustomApiLookupPanel: ({ contactId }: { contactId: number }) => (
    <div data-testid="lookup-panel">{contactId}</div>
  ),
}));
vi.mock('@/components/contacts/ContactProfileDetails', () => ({
  ContactProfileDetails: () => <div data-testid="contact-details" />,
}));
vi.mock('@/components/contacts/ContactProfileActivity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ContactProfileActivity: () => <div data-testid="contact-activity" />,
}));
vi.mock('@/components/contacts/ContactAvatar', () => ({ ContactAvatar: () => null }));
vi.mock('@/components/contacts/contactFacts', () => ({ customerSince: () => null }));
// Every key ContactProfilePanel destructures; booleans false, inputs empty.
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({
    contact: CONTACT,
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
    profileTypeInput: '',
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

const drawer = () => (
  <MemoryRouter>
    <ContactProfilePanel email="c@d.example" onClose={noop} />
  </MemoryRouter>
);
const TAB_WORDS = ['Activity', 'Details', 'Lookups', 'Orders'];
const tabNames = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent ?? '')
    .filter((text) => TAB_WORDS.includes(text));

beforeEach(() => lookupsTab.mockReset());

describe('ContactProfilePanel — Lookups tab (spec 2026-10-09)', () => {
  it('third tab, named by the rule, holds the panel; Details no longer does', () => {
    lookupsTab.mockReturnValue({ available: true, count: 2, label: 'Orders' });
    render(drawer());
    expect(tabNames()).toEqual(['Activity', 'Details', 'Orders']);
    expect(lookupsTab).toHaveBeenCalledWith('contact');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByTestId('contact-details')).toBeInTheDocument();
    expect(screen.queryByTestId('lookup-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByTestId('lookup-panel')).toHaveTextContent('9');
    expect(screen.queryByTestId('contact-details')).not.toBeInTheDocument();
  });

  it('no Lookups tab when unavailable; it opens on Activity as before', () => {
    lookupsTab.mockReturnValue({ available: false, count: 0, label: 'Lookups' });
    render(drawer());
    expect(tabNames()).toEqual(['Activity', 'Details']);
    expect(screen.getByTestId('contact-activity')).toBeInTheDocument();
  });

  it('⛔ on Lookups when it becomes unavailable ⇒ back to Activity, never blank', () => {
    lookupsTab.mockReturnValue({ available: true, count: 1, label: 'Lookups' });
    const { rerender } = render(drawer());
    fireEvent.click(screen.getByRole('button', { name: 'Lookups' }));
    expect(screen.getByTestId('lookup-panel')).toBeInTheDocument();
    lookupsTab.mockReturnValue({ available: false, count: 0, label: 'Lookups' });
    rerender(drawer());
    expect(screen.queryByTestId('lookup-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('contact-activity')).toBeInTheDocument();
    expect(tabNames()).toEqual(['Activity', 'Details']);
  });
});
