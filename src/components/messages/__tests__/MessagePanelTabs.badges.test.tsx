import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, useEffect, type ReactNode } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * Tab badges (owner, 2026-09-22): KB = the suggestions + references the tab lists, for THIS
 * thread only. Customer = the number of lookups a press could run (owner, 2026-09-23 — it
 * replaced a dot, knowing the number is per workspace and reads the same on every thread).
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
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: vi.fn(),
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

describe('MessagePanelTabs — Customer count', () => {
  const customerTab = () => screen.getByRole('button', { name: /^Customer/ });
  const settle = async () => {
    await waitFor(() => expect(lookupOptions).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('shows how many lookups a press could run (design v3, owner 2026-09-23)', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue(options(4));
    renderTabs(41);
    await waitFor(() => expect(within(customerTab()).getByText('4')).toBeInTheDocument());
    expect(lookupOptions).toHaveBeenCalledWith('thread');
  });

  it.each([
    ['none are configured', () => Promise.resolve([])],
    [
      'a backend without the route (404)',
      () => Promise.reject(Object.assign(new Error('nf'), { status: 404 })),
    ],
  ])('shows no number when %s', async (_label, answer) => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockImplementation(answer);
    renderTabs(41);
    await settle();
    expect(within(customerTab()).queryByText(/\d/)).not.toBeInTheDocument();
  });

  // The panel tells a customer with no email that identity lookups cannot run; a number saying
  // some are available beside that would contradict it.
  it('shows no number for a customer with no email identity', async () => {
    getKBReferences.mockResolvedValue(refs(0));
    lookupOptions.mockResolvedValue(options(4));
    renderTabs(41, 'anonymous@chat-widget.local');
    await settle();
    expect(within(customerTab()).queryByText(/\d/)).not.toBeInTheDocument();
  });
});
