import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, useEffect, useState, type ReactNode } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * Tab badges (owner, 2026-09-22): KB = the suggestions + references the tab lists, for THIS
 * thread only. Lookups = the number of lookups a press could run (owner, 2026-09-23 — it
 * replaced a dot, knowing the number is per workspace and reads the same on every thread; moved
 * from Customer to its own tab 2026-10-09).
 */

// Suggested-option counts per message; a message missing here never reports (still loading).
const suggestedById: Record<number, number> = {};
vi.mock('../AiTabPanel', () => ({
  AiTabPanel: ({
    message,
    onOptionsLoaded,
  }: {
    message: { id: number };
    onOptionsLoaded?: (n: number) => void;
  }) => {
    useEffect(() => {
      const count = suggestedById[message.id];
      if (count !== undefined) onOptionsLoaded?.(count);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message.id]);
    return null;
  },
}));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
const availability = vi.fn();
const lookupOptions = vi.fn();
const runLookup = vi.fn();
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: (body: unknown) => runLookup(body) as unknown,
    availability: () => availability() as unknown,
    lookupOptions: (surface: string) => lookupOptions(surface) as unknown,
  },
}));
const options = (count: number) =>
  Array.from({ length: count }, (_, idx) => ({ endpointId: idx + 1, label: `l${idx}` }));
const getKBReferences = vi.fn();
vi.mock('@/services/message.service', () => ({
  messageService: { getKBReferences: (id: number) => getKBReferences(id) as unknown },
}));

const noop = () => {};
const props = (id: number, sender = 'a@b.example') =>
  ({
    message: {
      id,
      sender,
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: {},
    } as unknown as Message,
    variant: 'rail',
    tab: 'notes',
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
  }) as unknown as MessagePanelTabsProps;

const renderTabs = (id: number, sender?: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<MessagePanelTabs {...props(id, sender)} />, { wrapper });
};
/** The real host owns the tab; a press needs the Lookups tab actually open. */
const StatefulTabs = ({ id }: { id: number }) => {
  const [tab, setTab] = useState<MessagePanelTabsProps['tab']>('notes');
  const [panelOpen, setPanelOpen] = useState(true);
  return (
    <MessagePanelTabs
      {...props(id)}
      tab={tab}
      setTab={setTab}
      panelOpen={panelOpen}
      setPanelOpen={setPanelOpen}
    />
  );
};
const renderStatefulTabs = (id: number) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <StatefulTabs id={id} />
      </QueryClientProvider>
    </MemoryRouter>
  );
};
const kbTab = () => screen.getByRole('button', { name: /^KB/ });
const refs = (count: number) => ({
  success: true,
  data: Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    type: 'qa_pair',
    title: `r${idx}`,
  })),
});

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
  for (const key of Object.keys(suggestedById)) delete suggestedById[Number(key)];
  availability.mockReset().mockResolvedValue(false);
  lookupOptions.mockReset().mockResolvedValue([]);
  runLookup.mockReset();
  getKBReferences.mockReset();
});

describe('MessagePanelTabs — KB badge', () => {
  it('counts the suggestions and the references the tab lists', async () => {
    suggestedById[41] = 2;
    getKBReferences.mockResolvedValue(refs(1));
    renderTabs(41);
    await waitFor(() => expect(within(kbTab()).getByText('3')).toBeInTheDocument());
  });

  it("does not carry the previous thread's count onto the next one", async () => {
    suggestedById[41] = 2;
    getKBReferences.mockImplementation((id: number) =>
      id === 41 ? Promise.resolve(refs(1)) : new Promise(() => {})
    );
    const { rerender } = renderTabs(41);
    await waitFor(() => expect(within(kbTab()).getByText('3')).toBeInTheDocument());
    rerender(<MessagePanelTabs {...props(42)} />);
    expect(within(kbTab()).queryByText(/\d/)).not.toBeInTheDocument();
  });
});

describe('MessagePanelTabs — Lookups count (moved off Customer, 2026-10-09)', () => {
  const lookupsTab = () => screen.getByRole('button', { name: /^Lookups/ });
  const customerTab = () => screen.getByRole('button', { name: /^Customer/ });
  const settle = async () => {
    await waitFor(() => expect(lookupOptions).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  beforeEach(() => availability.mockResolvedValue(true));

  /*
    Owner, 2026-10-15: the badge was the number of lookups a press COULD run, which read as "4
    results" before anything had been asked. It now counts lookups that FOUND something.
  */
  it('no number before a press; after it, how many lookups found something; gone with the panel', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue(options(4));
    const found = (endpointId: number) => ({
      endpointId,
      label: `l${endpointId}`,
      connectionName: 'Acme',
      resultShape: 'one',
      status: 'ok',
      rows: [{ id: String(endpointId) }],
      fields: [{ path: 'id', label: 'Id', kind: 'plain' }],
    });
    runLookup.mockResolvedValue([
      found(1),
      found(2),
      { ...found(3), status: 'no_match', rows: [] },
    ]);
    renderStatefulTabs(41);
    await settle();
    expect(within(lookupsTab()).queryByText(/\d/)).not.toBeInTheDocument();
    expect(lookupOptions).toHaveBeenCalledWith('thread');

    await userEvent.click(lookupsTab());
    await userEvent.click(await screen.findByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(within(lookupsTab()).getByText('2')).toBeInTheDocument());
    expect(within(customerTab()).queryByText(/\d/)).not.toBeInTheDocument();

    // The results leave with the panel, so the number does too.
    await userEvent.click(customerTab());
    await waitFor(() => expect(within(lookupsTab()).queryByText(/\d/)).not.toBeInTheDocument());
  });

  it('shows no number when none are configured', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue([]);
    renderTabs(41);
    await waitFor(() => expect(lookupsTab()).toBeInTheDocument());
    await settle();
    expect(within(lookupsTab()).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it('⛔ no email identity: the tab is still there (manual lookups run), with no number', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue(options(4));
    renderTabs(41, 'anonymous@chat-widget.local');
    await waitFor(() => expect(lookupsTab()).toBeInTheDocument());
    await settle();
    expect(within(lookupsTab()).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it('no tab at all when lookups are unavailable', async () => {
    availability.mockResolvedValue(false);
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue(options(4));
    renderTabs(41);
    await settle();
    expect(screen.queryByRole('button', { name: /^Lookups/ })).not.toBeInTheDocument();
  });

  it('named after the shared category', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue([{ endpointId: 1, label: 'a', category: 'order' }]);
    renderTabs(41);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Orders/ })).toBeInTheDocument()
    );
  });
});
