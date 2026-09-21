import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { NO_EMAIL_IDENTITY_NOTE } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * The WIRING of the no-email note, not the constant. Audit 2026-09-19: the only test of the note
 * read `NO_EMAIL_IDENTITY_NOTE` directly, so reverting MessagePanelTabs to an inline "Enter a
 * record number…" string kept every message test green. This renders the real MessagePanelTabs
 * with the real panel; only the network edges (the lookup service, the contact-profile fetch) are
 * stubbed, plus the AI analysis section that fetches on mount.
 */

const availability = vi.fn<(surface: string) => Promise<boolean>>();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: vi.fn(),
      availability: (surface: string) => availability(surface),
    },
  };
});

// The customer tab also mounts the AI analysis section, which fetches on mount; it has nothing to
// do with the note and would otherwise fire real XHRs at a host that is not there.
vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));

vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));

const noop = () => {};

const renderTabs = (sender: string) => {
  const props = {
    message: {
      id: 41,
      sender,
      channel: 'telegram',
      createdAt: '2026-09-19T10:00:00Z',
      metadata: {},
    } as unknown as Message,
    tab: 'customer',
    setTab: noop,
    panelOpen: true,
    setPanelOpen: noop,
    notes: [],
    onNoteUpdated: noop,
    onNoteDeleted: noop,
    noteActivityLog: [],
    messageActivity: [],
    sortedThread: [],
    threadRefreshKey: 0,
    currentUserId: 9,
    leadState: null,
    setLeadState: noop,
    leadFieldDefs: [],
    onGhostClick: noop,
    setComposerMode: noop,
    noteEditorRef: createRef(),
  } as unknown as MessagePanelTabsProps;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /*
    ⚠️ A ROUTER, added 2026-09-21. The CUSTOMER tab now offers "Open the full records page" from a
    THREAD (support-service #800), which resolves the customer and navigates — so the panel calls
    `useNavigate` and throws outside a Router. In the app this component only ever renders inside
    `<Routes>`; the harness simply never needed one. The assertions below are untouched.
  */
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<MessagePanelTabs {...props} />, { wrapper });
};

beforeEach(() => {
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('MessagePanelTabs — the no-email note on the lookup panel', () => {
  it('⛔ a sender with no email shows exactly NO_EMAIL_IDENTITY_NOTE', async () => {
    // RED: an inline string in MessagePanelTabs (the "Enter a record number…" copy this replaced)
    // renders something else, and this finds nothing.
    renderTabs('telegram:123');
    await screen.findByText('CONNECTED SYSTEMS');
    expect(screen.getByText(NO_EMAIL_IDENTITY_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/record number/i)).toBeNull();
  });

  it('⛔ the chat widget placeholder counts as NO email, as it does on the backend', async () => {
    // RED: `includes('@')` ⇒ the note is hidden while every identity card says it cannot run.
    renderTabs('Visitor <anonymous@chat-widget.local>');
    await screen.findByText('CONNECTED SYSTEMS');
    expect(screen.getByText(NO_EMAIL_IDENTITY_NOTE)).toBeInTheDocument();
  });

  it('a sender WITH an email shows no note', async () => {
    // Control: the note is keyed on the missing email, not shown to everyone.
    renderTabs('Ana <ana@example.com>');
    await screen.findByText('CONNECTED SYSTEMS');
    expect(screen.queryByText(NO_EMAIL_IDENTITY_NOTE)).toBeNull();
  });
});
