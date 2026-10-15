import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * Activity rows must wrap a long unbroken value (a routing rule's text) at phone width.
 * jsdom has no layout, so this pins the wrapping classes on the label span.
 */
vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: vi.fn(),
    availability: () => Promise.resolve(false),
    lookupOptions: () => Promise.resolve([]),
  },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getKBReferences: () => Promise.resolve({ success: true, data: [] }) },
}));

const noop = () => {};
const LONG = 'palletlabelpalletlabelpalletlabelpalletlabelpalletlabelpalletlabel';
const props = {
  message: { id: 1, sender: 'a@b.example', channel: 'email', createdAt: '2026-09-22T10:00:00Z', metadata: {} } as unknown as Message,
  variant: 'rail',
  tab: 'activity',
  setTab: noop,
  panelOpen: false,
  setPanelOpen: noop,
  notes: [],
  onNoteUpdated: noop,
  onNoteDeleted: noop,
  noteActivityLog: [{ label: `Rule ${LONG} applied`, who: 'Ana', time: '2026-09-22T10:00:00Z' }],
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

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('MessagePanelTabs — Activity label wraps', () => {
  it('the label span can break a long unbroken value', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
    render(<MessagePanelTabs {...props} />, { wrapper });
    const label = screen.getByText(new RegExp(LONG));
    expect(label.className).toContain('break-words');
    expect(label.className).toContain('[overflow-wrap:anywhere]');
  });
});
