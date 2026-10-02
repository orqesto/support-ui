import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MessagePanelTabs, type MessagePanelTabsProps } from '../MessagePanelTabs';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';
import type * as MessageService from '@/services/message.service';

/**
 * The strip fade is re-measured on resize (a ResizeObserver on the strip, disconnected on
 * unmount) and when the Files tab gains its count. jsdom has no ResizeObserver, so one is stubbed.
 * Harness copied from MessagePanelTabs.strip.test.tsx.
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
  const { rerender, unmount } = render(<MessagePanelTabs {...props} />, { wrapper });
  const strip = screen.getByRole('button', { name: /^AI$/ }).parentElement as HTMLElement;
  return {
    strip,
    aiTab: screen.getByRole('button', { name: /^AI$/ }),
    unmount,
    rerenderWith: (next: Partial<MessagePanelTabsProps>) =>
      rerender(<MessagePanelTabs {...props} {...next} />),
  };
};

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

const observers = vi.hoisted(() => ({
  instances: [] as {
    callback: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[],
}));

class FakeResizeObserver {
  callback: () => void;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(callback: () => void) {
    this.callback = callback;
    observers.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  observers.instances = [];
});

describe('MessagePanelTabs — the fade re-measures on resize', () => {
  it('observes the strip, re-measures on a resize callback, disconnects on unmount', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { strip, unmount } = renderTabs('rail');
    const live = observers.instances.filter((obs) =>
      obs.observe.mock.calls.some((call) => call[0] === strip)
    );
    expect(live.length).toBeGreaterThan(0);
    expect(strip.dataset.fade).toBe('false');
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 380 });
    act(() => live[live.length - 1].callback());
    expect(strip.dataset.fade).toBe('true');
    const current = live[live.length - 1];
    expect(current.disconnect).not.toHaveBeenCalled();
    unmount();
    expect(current.disconnect).toHaveBeenCalled();
  });

  it('the Files tab gaining attachments re-measures without a scroll or resize', () => {
    const { strip, rerenderWith } = renderTabs('rail', { attachments: [] });
    expect(strip.dataset.fade).toBe('false');
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 380 });
    rerenderWith({
      attachments: [
        { id: 3, originalFilename: 'a.pdf', filename: 'a.pdf', mimeType: 'application/pdf' },
      ] as unknown as MessagePanelTabsProps['attachments'],
    });
    expect(strip.dataset.fade).toBe('true');
  });
});
