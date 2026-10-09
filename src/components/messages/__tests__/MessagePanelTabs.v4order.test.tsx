import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * v4 tab order (AI, Customer, KB, Files, Activity, Notes, Conflict, Lead) in BOTH variants, and the
 * Customer tab's contact lookup key: the same address the sender block shows (parseSender), not
 * the first `<…>` of the raw sender line. Audit pass 10.
 */

vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
const lookedUp = vi.fn<(email: string) => void>();
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: (email: string) => {
    lookedUp(email);
    return { loading: false, contact: null };
  },
}));
// The tab badges fetch KB references on mount; every message-service call answers empty here so no
// real XHR leaks past the test.
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) }),
}));
const availability = vi.fn<(surface: string) => Promise<boolean>>();
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: vi.fn(),
    availability: (surface: string) => availability(surface),
    lookupOptions: () => Promise.resolve([]),
  },
}));

const noop = () => {};

const renderTabs = (
  variant: 'rail' | 'sidebar',
  { sender = 'a@b.example', isLead = false, tab = 'notes' } = {}
) => {
  const props = {
    message: {
      id: 41,
      sender,
      isLead,
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: {},
    } as unknown as Message,
    variant,
    tab,
    setTab: noop,
    panelOpen: false,
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<MessagePanelTabs {...props} />, { wrapper });
};

beforeEach(() => {
  availability.mockReset();
  availability.mockResolvedValue(false);
  lookedUp.mockClear();
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

const tabLabels = () =>
  within(screen.getByTestId('panel-tabs-root').firstElementChild as HTMLElement)
    .getAllByRole('button')
    .map((tab) => tab.textContent?.replace(/\d+$/, '').trim())
    .filter((label) => label !== 'Thread');

const V4_ORDER = ['AI', 'Customer', 'KB', 'Files', 'Activity', 'Notes', 'Conflict', 'Lead'];

describe('MessagePanelTabs — v4 tab order', () => {
  it.each(['sidebar', 'rail'] as const)(
    '%s: AI, Customer, KB, Files, Activity, Notes, Conflict, Lead',
    (variant) => {
      renderTabs(variant, { isLead: true });
      expect(tabLabels()).toEqual(V4_ORDER);
    }
  );

  it('not a lead: the same order without Lead', () => {
    renderTabs('sidebar');
    expect(tabLabels()).toEqual(V4_ORDER.slice(0, -1));
  });

  it.each(['sidebar', 'rail'] as const)(
    '%s: with lookups available, Lookups sits right after Customer',
    async (variant) => {
      availability.mockResolvedValue(true);
      renderTabs(variant, { isLead: true });
      await waitFor(() =>
        expect(tabLabels()).toEqual([
          'AI',
          'Customer',
          'Lookups',
          'KB',
          'Files',
          'Activity',
          'Notes',
          'Conflict',
          'Lead',
        ])
      );
    }
  );
});

describe('MessagePanelTabs — the Customer lookup key matches the sender block', () => {
  it('a quoted name with brackets: looks up the address, not "Sales"', () => {
    renderTabs('sidebar', { sender: '"Smith <Sales>" <s@x.com>', tab: 'customer' });
    expect(lookedUp).toHaveBeenLastCalledWith('s@x.com');
  });

  it('CONTROL: a plain "Name <email>" sender still looks up the email', () => {
    renderTabs('sidebar', { sender: 'Ada <a@x.io>', tab: 'customer' });
    expect(lookedUp).toHaveBeenLastCalledWith('a@x.io');
  });

  it('CONTROL: a chat handle in brackets (no @) keeps its handle as the key (D17)', () => {
    renderTabs('sidebar', { sender: 'Ada <@ada_tg>', tab: 'customer' });
    expect(lookedUp).toHaveBeenLastCalledWith('@ada_tg');
  });

  it('CONTROL: no "@" anywhere — the earlier resolution (first <…>) is left as it was', () => {
    renderTabs('sidebar', { sender: '<Sales> <ada_tg>', tab: 'customer' });
    expect(lookedUp).toHaveBeenLastCalledWith('Sales');
  });

  it('CONTROL: a bare handle with no brackets is the key', () => {
    renderTabs('sidebar', { sender: 'ada_tg', tab: 'customer' });
    expect(lookedUp).toHaveBeenLastCalledWith('ada_tg');
  });
});
