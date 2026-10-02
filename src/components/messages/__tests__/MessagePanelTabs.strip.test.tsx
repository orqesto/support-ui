import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';
import type * as MessageService from '@/services/message.service';

/**
 * How the tab strip handles not fitting. Design v4 (one row, not v3's five-per-row wrap, so the
 * tabs keep one order and one place): BOTH the sidebar (`.stabs`) and the rail / phone (`.railtabs`) are ONE
 * sentence-case row that scrolls sideways, each tab `flex: 1 0 auto` so it shares the width when
 * there is room and never shrinks below its label.
 * Without the scroll the nine tabs squeezed to 27px on a 420px screen and the row overflowed its
 * own box, so the last labels were unreachable (measured in the browser).
 *
 * jsdom computes no layout, so this pins the CLASSES that produce each shape; the widths
 * themselves were verified in a real browser (see the PR).
 */

vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
// MessageKBReferences (the Thread/AI tab footer) fetches on mount; without this every render sent a
// real GET /api/messages/<id>/kb-references at a host that is not there (CI noise, and a late
// response can land after the environment is torn down).
vi.mock('@/services/message.service', async () => {
  const actual = await vi.importActual<typeof MessageService>('@/services/message.service');
  return {
    ...actual,
    messageService: {
      ...actual.messageService,
      getKBReferences: () => Promise.resolve({ success: true, data: [] }),
    },
  };
});
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: { run: vi.fn(), availability: vi.fn().mockResolvedValue(false) },
}));

const noop = () => {};

const renderTabs = (variant: 'rail' | 'sidebar', over: Partial<MessagePanelTabsProps> = {}) => {
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
    ...over,
  } as unknown as MessagePanelTabsProps;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  const { rerender } = render(<MessagePanelTabs {...props} />, { wrapper });
  const strip = screen.getByRole('button', { name: /^AI$/ }).parentElement as HTMLElement;
  return {
    strip,
    aiTab: screen.getByRole('button', { name: /^AI$/ }),
    rerenderWith: (next: Partial<MessagePanelTabsProps>) =>
      rerender(<MessagePanelTabs {...props} {...next} />),
  };
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

  it('sidebar: ONE row that scrolls — never wraps (v4)', () => {
    const { strip, aiTab } = renderTabs('sidebar');
    expect(strip.className).toContain('flex-nowrap');
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).not.toMatch(/\bflex-wrap\b/);
    expect(aiTab.className).not.toContain('basis-1/5');
    // Shares spare width (grow) and refuses to shrink below its label.
    expect(aiTab.className).toContain('grow');
    expect(aiTab.className).toContain('flex-shrink-0');
  });

  it.each(['rail', 'sidebar'] as const)(
    '%s: labels are sentence case, 12.5px / 500 — not the uppercase LABEL face',
    (variant) => {
      const { aiTab } = renderTabs(variant);
      expect(aiTab.className).not.toMatch(/(^|\s)uppercase(\s|$)/);
      expect(aiTab.className).toContain('text-[12.5px]');
      expect(aiTab.className).toContain('font-medium');
      expect(screen.getByRole('button', { name: /^Customer/ }).textContent).toMatch(/^Customer/);
    }
  );

  it('the right-edge fade appears only while there is more to scroll to', () => {
    const { strip } = renderTabs('rail');
    // jsdom lays nothing out: scrollWidth = clientWidth = 0 ⇒ nothing to scroll ⇒ no fade.
    expect(strip.dataset.fade).toBe('false');
    expect(strip.className).not.toContain('mask-image');
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 380 });
    fireEvent.scroll(strip);
    expect(strip.dataset.fade).toBe('true');
    expect(strip.className).toContain('mask-image');
    // Scrolled to the end ⇒ nothing more to the right ⇒ the fade goes.
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: 220 });
    fireEvent.scroll(strip);
    expect(strip.dataset.fade).toBe('false');
  });

  it('a badge that arrives after mount re-measures: the fade turns on without a scroll', () => {
    const { strip, rerenderWith } = renderTabs('rail', { tab: 'ai' });
    expect(strip.dataset.fade).toBe('false');
    // The strip now overflows — but nothing has measured it yet (no scroll, no resize).
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 380 });
    // CONTROL: a re-render that changes no tab or badge does not re-measure.
    rerenderWith({ panelOpen: true });
    expect(strip.dataset.fade).toBe('false');
    // A note arrives: the Notes tab gains its count badge, so the tabs' widths changed.
    rerenderWith({
      notes: [
        { id: 1, content: 'Called the customer', createdAt: '2026-09-22T11:00:00Z' },
      ] as unknown as MessagePanelTabsProps['notes'],
    });
    expect(strip.dataset.fade).toBe('true');
    expect(strip.className).toContain('mask-image');
  });
});
