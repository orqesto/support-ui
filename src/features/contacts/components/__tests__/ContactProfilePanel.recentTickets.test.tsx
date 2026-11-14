import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactProfilePanel } from '../ContactProfilePanel';

/**
 * The contact drawer's activity feed names a ticket by its own ID (`TES-SUP-T-4`), with `#22`
 * before it has a number — not by its row id. Data and sub-panels are stubbed.
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
    recentTickets: [
      {
        id: 21,
        title: 'Numbered',
        status: 'open',
        priority: 'medium',
        createdAt: '2026-10-20T10:00:00Z',
        reference: 'SUP-T-4',
      },
      {
        id: 22,
        title: 'Not numbered',
        status: 'open',
        priority: 'medium',
        createdAt: '2026-10-19T10:00:00Z',
        reference: null,
      },
    ],
    notes: [],
    assignedUserFirstName: null,
  },
  noop: () => {},
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
vi.mock('@/features/custom-api/components/lookupsTab', () => ({
  useLookupsTab: (surface: string) => lookupsTab(surface) as unknown,
}));
vi.mock('@/features/custom-api/components/CustomApiLookupPanel', () => ({
  CustomApiLookupPanel: ({ contactId }: { contactId: number }) => (
    <div data-testid="lookup-panel">{contactId}</div>
  ),
}));
vi.mock('@/features/contacts/components/ContactProfileDetails', () => ({
  ContactProfileDetails: () => (
    <div data-testid="contact-details">
      <div data-testid="notes-section" data-contact-notes="" />
    </div>
  ),
}));
vi.mock('@/features/contacts/components/ContactProfileActivity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ContactProfileActivity: ({
    activity,
  }: {
    activity: Array<{ key: string; meta: string; at: string }>;
  }) => (
    <ul>
      {activity.map((item) => (
        <li key={item.key} data-key={item.key} data-at={item.at}>
          {item.meta}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock('@/features/contacts/components/ContactAvatar', () => ({ ContactAvatar: () => null }));
vi.mock('@/features/contacts/components/contactFacts', () => ({ customerSince: () => null }));
// Every key ContactProfilePanel destructures; booleans false, inputs empty.
vi.mock('@/features/contacts/hooks/useContactProfile', () => ({
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
describe('ContactProfilePanel — recent tickets', () => {
  it('shows each ticket by its own ID, and #id before it has a number', () => {
    lookupsTab.mockReturnValue({ available: false, count: 0, label: 'Lookups' });
    render(drawer());
    expect(screen.getByText('TES-SUP-T-4')).toBeInTheDocument();
    expect(screen.getByText('#22')).toBeInTheDocument();
    expect(screen.queryByText('#21')).toBeNull();
  });
});

/**
 * taco thread 234601: created 10-21, the customer wrote again 11-12. The feed must place it by
 * when it was last active, not by when it began.
 */
describe('ContactProfilePanel — recent threads', () => {
  const keysInOrder = (): Array<[string | null, string | null]> =>
    Array.from(document.querySelectorAll('li[data-key]')).map((li) => [
      li.getAttribute('data-key'),
      li.getAttribute('data-at'),
    ]);

  it('places a thread by its last activity, above newer tickets', () => {
    lookupsTab.mockReturnValue({ available: false, count: 0, label: 'Lookups' });
    (CONTACT as { recentMessages: unknown[] }).recentMessages = [
      {
        id: 234601,
        subject: 'Order',
        status: 'client_replied',
        channel: 'email',
        createdAt: '2026-10-01T10:00:00Z',
        lastActivityAt: '2026-11-12T08:00:00Z',
      },
    ];
    render(drawer());
    expect(keysInOrder()[0]).toEqual(['m234601', '2026-11-12T08:00:00Z']);
  });

  it('[control] falls back to creation time when the server sends no lastActivityAt', () => {
    lookupsTab.mockReturnValue({ available: false, count: 0, label: 'Lookups' });
    (CONTACT as { recentMessages: unknown[] }).recentMessages = [
      {
        id: 7,
        subject: 'Old',
        status: 'resolved',
        channel: 'email',
        createdAt: '2026-10-01T10:00:00Z',
      },
    ];
    render(drawer());
    expect(keysInOrder()).toEqual([
      ['t21', '2026-10-20T10:00:00Z'],
      ['t22', '2026-10-19T10:00:00Z'],
      ['m7', '2026-10-01T10:00:00Z'],
    ]);
  });
});
