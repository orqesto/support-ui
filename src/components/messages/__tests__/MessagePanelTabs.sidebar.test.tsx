import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * The full page's sidebar tabs (v3) sit BESIDE the composer, so pressing one must not switch
 * the composer's mode: flipping a half-written internal note to Reply put it one ⌘↵ from the
 * customer. The slide-over keeps its existing behaviour (the control below).
 */

vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: { run: vi.fn(), availability: vi.fn().mockResolvedValue(false) },
}));

const noop = () => {};

const renderTabs = (variant: 'rail' | 'sidebar', setComposerMode: () => void) => {
  const props = {
    message: {
      id: 41,
      sender: 'a@b.example',
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: {},
    } as unknown as Message,
    variant,
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
    setComposerMode,
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
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('MessagePanelTabs — sidebar tabs leave the composer alone', () => {
  it('pressing AI in the sidebar does not switch the composer mode', () => {
    const setComposerMode = vi.fn();
    renderTabs('sidebar', setComposerMode);
    fireEvent.click(screen.getByRole('button', { name: /^AI$/ }));
    expect(setComposerMode).not.toHaveBeenCalled();
  });

  it('CONTROL: in the slide-over the same press still switches to Reply', () => {
    const setComposerMode = vi.fn();
    renderTabs('rail', setComposerMode);
    fireEvent.click(screen.getByRole('button', { name: /^AI$/ }));
    expect(setComposerMode).toHaveBeenCalledWith('reply');
  });
});
