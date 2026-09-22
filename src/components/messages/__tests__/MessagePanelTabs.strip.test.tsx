import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * How the tab strip handles not fitting — the two shapes the v3 design uses:
 *  - sidebar (`.stabs`): WRAPS, five per row;
 *  - rail / phone (`.railtabs`): ONE row that scrolls sideways.
 * Without the scroll the nine tabs squeezed to 27px on a 420px screen and the row overflowed its
 * own box, so the last labels were unreachable (measured in the browser).
 *
 * jsdom computes no layout, so this pins the CLASSES that produce each shape; the widths
 * themselves were verified in a real browser (see the PR).
 */

vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: { run: vi.fn(), availability: vi.fn().mockResolvedValue(false) },
}));

const noop = () => {};

const renderTabs = (variant: 'rail' | 'sidebar') => {
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
    setComposerMode: noop,
    noteEditorRef: createRef(),
  } as unknown as MessagePanelTabsProps;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  render(<MessagePanelTabs {...props} />, { wrapper });
  const strip = screen.getByRole('button', { name: /^AI$/ }).parentElement as HTMLElement;
  return { strip, aiTab: screen.getByRole('button', { name: /^AI$/ }) };
};

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('MessagePanelTabs — the strip when the tabs do not fit', () => {
  it('rail/phone: one scrolling row, and the tabs keep a readable width', () => {
    const { strip, aiTab } = renderTabs('rail');
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).not.toContain('flex-wrap');
    // Squeezing is what made the labels unreadable — the tabs must refuse to shrink.
    expect(aiTab.className).toContain('flex-shrink-0');
    expect(aiTab.className).toContain('min-w-[4.5rem]');
  });

  it('sidebar: wraps at five per row, as the design does — never a scrolling row', () => {
    const { strip, aiTab } = renderTabs('sidebar');
    expect(strip.className).toContain('flex-wrap');
    expect(strip.className).not.toContain('overflow-x-auto');
    expect(aiTab.className).toContain('basis-1/5');
  });
});
