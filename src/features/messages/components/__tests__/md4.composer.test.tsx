/**
 * Message detail v4 — composer and layout (areas C2, L1 below; C1, the AI panel's note box, is
 * gone — the editor is AI draft's only input, see ComposerAiActions.test.tsx).
 *
 *   C2  The Lookups tab falls back to AI when lookups become unavailable (the composer's own
 *       Look up button was removed 2026-11-11 — the tab is the way in).
 *   L1  Full page: sidebar `clamp(312px,30vw,520px)`, page frame full width; below 1024px
 *       the page keeps the one-column (rail) layout.
 *
 * MessageDetail, MessageComposer, ComposerAiActions and MessageDetailPage are REAL. Stubbed: the
 * TipTap editor, the side panel (MessagePanelTabs — another surface, reported through data-*),
 * bubbles, dialogs and the services.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactModule from 'react';
import type { Message } from '@/types';

const { serviceMock, svc, lookup } = vi.hoisted(() => {
  const serviceMock = () => {
    const fns: Record<string, ReturnType<typeof vi.fn>> = {};
    return new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    });
  };
  return {
    serviceMock,
    svc: { message: null as unknown as Record<string, ReturnType<typeof vi.fn>> },
    lookup: {
      availability: null as unknown as ReturnType<
        typeof vi.fn<(...args: unknown[]) => Promise<boolean>>
      >,
    },
  };
});

vi.mock('@/services/message.service', () => {
  svc.message = serviceMock();
  return { messageService: svc.message };
});
vi.mock('@/features/custom-api/services/customApiLookup.service', () => {
  lookup.availability = vi.fn<(...args: unknown[]) => Promise<boolean>>();
  return {
    customApiLookupService: {
      availability: (...args: unknown[]) => lookup.availability(...args),
      lookupOptions: () => Promise.resolve([]),
    },
  };
});
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/features/tickets/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
vi.mock('@/lib/api-client', () => ({ apiClient: serviceMock() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(() => null),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ departments: [] }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
const aiDrafts = vi.hoisted(() => ({ off: false }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));
const media = vi.hoisted(() => ({ wide: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => media.wide }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
// organizationId set, so the availability query is ENABLED (it is keyed on the org).
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) =>
    select({ user: { id: 7, organizationId: 3, firstName: 'Dana' }, selectedOrganizationId: 3 }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/components/shared/RichTextEditor', async () => {
  const { forwardRef, useImperativeHandle, useRef } =
    await vi.importActual<typeof ReactModule>('react');
  // Forwards focus() as the real editor's handle does, so the R / N shortcuts can be checked.
  const Editor = forwardRef<
    { focus: () => void },
    { content?: string; onChange?: (val: string) => void; placeholder?: string }
  >(({ onChange, placeholder }, ref) => {
    const area = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));
    return (
      <textarea
        ref={area}
        data-testid="rich-text-editor"
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  });
  return { default: Editor, extractImageFiles: () => [] };
});
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
// The side panel is another agent's surface — report what MessageDetail asked of it; its one
// button stands in for the agent pressing the Lookups tab.
vi.mock('../MessagePanelTabs', () => ({
  MessagePanelTabs: ({
    variant,
    tab,
    setTab,
    panelOpen,
    setPanelOpen,
  }: {
    variant?: string;
    tab: string;
    setTab: (next: string) => void;
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
  }) => (
    <div
      data-testid="panel-tabs"
      data-variant={variant ?? 'rail'}
      data-tab={tab}
      data-open={String(panelOpen)}
    >
      <button
        type="button"
        onClick={() => {
          setTab('lookups');
          setPanelOpen(true);
        }}
      >
        Lookups tab
      </button>
    </div>
  ),
}));
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/features/contacts/components/ContactProfilePanel', () => ({
  ContactProfilePanel: () => null,
}));
vi.mock('@/features/messages/components/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MessageDetail } from '../MessageDetail';
import { MessageDetailPage } from '@/pages/MessageDetailPage';
import { PHONE_QUERY } from '../useIsPhone';

const baseMessage = {
  id: 101,
  subject: 'Where is my order?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
  channel: 'email',
  status: 'open',
  lastReplyFromClient: null,
  assigneeId: null,
  metadata: {},
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const renderDetail = (
  overrides: Partial<Message> = {},
  props: Partial<React.ComponentProps<typeof MessageDetail>> = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={{ ...baseMessage, ...overrides }} onClose={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const setPhone = () =>
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
const panel = () => screen.getByTestId('panel-tabs');

beforeEach(() => {
  lookup.availability.mockResolvedValue(true);
  svc.message.composeReply = vi.fn().mockResolvedValue({
    data: { text: 'Your parcel is at the border.', language: 'en' },
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
});
afterEach(() => {
  media.wide = false;
  delete (window as { matchMedia?: unknown }).matchMedia;
  aiDrafts.off = false;
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── C2 ───────────────────────────────────────────────────────────────────────

describe('C2 — the Lookups tab', () => {
  const renderWithClient = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MessageDetail message={baseMessage} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    return client;
  };

  it('⛔ on Lookups when lookups become unavailable ⇒ the panel falls back to AI, never blank', async () => {
    const client = renderWithClient();
    fireEvent.click(await screen.findByRole('button', { name: 'Lookups tab' }));
    expect(panel()).toHaveAttribute('data-tab', 'lookups');
    lookup.availability.mockResolvedValue(false);
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(panel()).toHaveAttribute('data-tab', 'ai'));
  });

  it('CONTROL: a refetch that still says yes leaves the agent on Lookups', async () => {
    const client = renderWithClient();
    fireEvent.click(await screen.findByRole('button', { name: 'Lookups tab' }));
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(lookup.availability).toHaveBeenCalledTimes(2));
    expect(panel()).toHaveAttribute('data-tab', 'lookups');
  });
});

// ─── R / N at phone width ─────────────────────────────────────────────────────

describe('R and N on a phone, with another tab open', () => {
  const press = (key: string) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  const composerHidden = () =>
    screen.getByTestId('message-composer').className.split(/\s+/).includes('hidden');
  let scrollTo: { mockRestore: () => void };
  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => scrollTo.mockRestore());

  /** Opens the Lookups tab (the composer is display:none under it) and parks focus on <body>. */
  const onLookupsTab = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Lookups tab' }));
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(composerHidden()).toBe(true);
    (document.activeElement as HTMLElement).blur();
  };

  it('R goes back to the Thread tab and focuses the reply editor, which is on screen', async () => {
    setPhone();
    renderDetail();
    await onLookupsTab();
    press('r');
    expect(panel()).toHaveAttribute('data-open', 'false');
    expect(composerHidden()).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText(/^Reply as Dana…/))
    );
  });

  it('N goes back where the composer shows and focuses the note editor', async () => {
    setPhone();
    renderDetail();
    await onLookupsTab();
    press('n');
    expect(composerHidden()).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText('Internal note — only visible to your colleagues…')
      )
    );
  });

  it('CONTROL desktop: R focuses the reply editor and leaves the open rail alone', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Lookups tab' }));
    (document.activeElement as HTMLElement).blur();
    press('r');
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(panel()).toHaveAttribute('data-tab', 'lookups');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText(/^Reply as Dana…/))
    );
  });
});

// ─── The reply editor's AI draft hint ──────────────────────────────────────────

describe('the reply editor says what AI draft does with what is typed', () => {
  const HINT = 'Reply as Dana… or type the facts and press AI draft.';

  it('desktop, AI drafts on: the placeholder explains typed facts vs an empty editor', () => {
    renderDetail();
    // Folded to one line while empty (2026-10-29); the full hint shows once it is open.
    fireEvent.click(screen.getByTestId('composer-field'));
    expect(screen.getByPlaceholderText(HINT)).toBeInTheDocument();
  });

  it('AI drafts off: no hint about a button that is not there', () => {
    aiDrafts.off = true;
    renderDetail();
    expect(screen.getByPlaceholderText('Reply as Dana…')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(HINT)).not.toBeInTheDocument();
  });

  it('phone at rest: the one-line pill keeps the short text', () => {
    setPhone();
    const { container } = renderDetail();
    expect(container.querySelector('[data-phone-state]')).toHaveAttribute(
      'data-phone-state',
      'rest'
    );
    expect(screen.getByPlaceholderText('Reply as Dana…')).toBeInTheDocument();
  });
});

// ─── One merge-list read per open ─────────────────────────────────────────────

describe('merges — the thread asks for its merge list once per open', () => {
  it('MessageDetail and its header share ONE GET …/merges', async () => {
    const { apiClient } = await import('@/lib/api-client');
    const { get } = apiClient as unknown as { get: ReturnType<typeof vi.fn> };
    renderDetail();
    await waitFor(() => expect(lookup.availability).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const mergeReads = get.mock.calls.filter(([url]) => String(url).endsWith('/merges'));
    expect(mergeReads).toHaveLength(1);
    expect(String(mergeReads[0][0])).toBe('/api/messages/101/merges');
  });
});

// ─── L1 ───────────────────────────────────────────────────────────────────────

describe('L1 — full-page layout', () => {
  it('wide full page: the sidebar is clamp(312px,30vw,520px)', () => {
    media.wide = true;
    renderDetail({}, { isFullPage: true });
    const sidebar = screen.getByTestId('detail-sidebar');
    expect(sidebar).toHaveClass('w-[clamp(312px,30vw,520px)]');
    expect(sidebar.className).not.toMatch(/xl:w-|2xl:w-/);
  });

  it('below 1024px the full page keeps one column (the rail), no sidebar', () => {
    media.wide = false;
    renderDetail({}, { isFullPage: true });
    expect(screen.queryByTestId('detail-sidebar')).not.toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-variant', 'rail');
  });

  it('the page frame spans the full width (no max-width cap)', async () => {
    svc.message.getById = vi.fn().mockResolvedValue({ success: true, data: baseMessage });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/threads/101']}>
          <Routes>
            <Route path="/threads/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const frame = await screen.findByTestId('detail-page-frame');
    expect(frame).toHaveClass('w-full');
    expect(frame.className).not.toMatch(/max-w-/);
  });
});
