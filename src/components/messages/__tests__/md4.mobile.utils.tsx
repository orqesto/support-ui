/**
 * Message detail v4 — the phone layout's shared test setup: service and hook mocks, the stubbed
 * side panel, renderDetail and the viewport switch. Imported FIRST by every md4.mobile.*.test.tsx,
 * so its mocks are registered before the detail modules load.
 *
 * Areas:
 *
 *   M1  52px sticky header row: Back (prompt-aware, replaces the page's Back bar), the id centred,
 *       More; Copy link / Refresh / read toggle / full page / Close move into More or go.
 *   M2  Subject 17px + the collapsible sender "Details" card holding the addresses and the meta
 *       rows (the header's own HeaderMetaStrip, not a copy).
 *   M3  Chips wrap; 26px chips.
 *   M4  Rail tab strip sticky under the header row, 44px tabs.
 *   M5  Thread: no avatars, full-width rows, outbound indented, 14px bubbles, pre/code wrap.
 *   M6  Resolve row between the thread and the composer, Thread tab only.
 *   M7  Composer: sticky pill at rest, opens on press/focus/typing, folds on an outside press only
 *       when empty, hidden off the Thread/Notes tabs; 16px inputs.
 *   M8  Popovers and the picker dialogs as bottom sheets.
 *   M9  Touch targets.
 *
 * The DOCUMENT scrolls on a phone (the browser's own pull-to-refresh works), so the layout is
 * asserted as classes (`max-sm:` utilities a browser applies below 640px) where it is pure styling,
 * and as DOM where the structure moves. jsdom computes no layout: what only a browser can confirm is listed in the
 * report, not claimed here. Every phone test has a desktop CONTROL in the same describe.
 */
import { vi, afterEach, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message, MessageEvent } from '@/types';
import { MessageDetail } from '../MessageDetail';
import type { MessagePanelTabs, MessagePanelTabsProps } from '../MessagePanelTabs';
import { PHONE_QUERY } from '../useIsPhone';

const { serviceMock, svc, stubs, aiDrafts } = vi.hoisted(() => {
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
    // The real side panel is rendered by the M4/M9 tests; MessageDetail tests stub it.
    stubs: { panel: true },
    // `offOnRefresh`: a re-read after a 409 finds drafts switched off (mid-session).
    aiDrafts: { off: false, configured: true, offOnRefresh: false },
  };
});

vi.mock('@/services/message.service', () => {
  svc.message = serviceMock();
  return { messageService: svc.message };
});
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    availability: () => Promise.resolve(false),
    lookupOptions: () => Promise.resolve([]),
    run: vi.fn(),
  },
}));
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
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
  usePermissions: () => ({ hasPermission: () => true, isGlobalAdmin: false, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => null,
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: aiDrafts.configured, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => {
    if (aiDrafts.offOnRefresh) aiDrafts.off = true;
  },
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) =>
    select({ user: { id: 7, organizationId: 3, firstName: 'Dana' }, selectedOrganizationId: 3 }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
// TipTap does not run here; the stand-in reports what the composer asked of it.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: ({
    content,
    onChange,
    placeholder,
    minHeight,
    className,
  }: {
    content?: string;
    onChange?: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
    className?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      data-min-height={minHeight}
      className={className}
      placeholder={placeholder}
      value={content ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  extractImageFiles: () => [],
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../MessagePanelTabs', async (importOriginal) => {
  const actual = await importOriginal<{ MessagePanelTabs: typeof MessagePanelTabs }>();
  type Props = MessagePanelTabsProps;
  return {
    ...actual,
    MessagePanelTabs: (props: Props) =>
      stubs.panel ? (
        <div data-testid="panel-tabs" data-tab={props.tab} data-open={String(props.panelOpen)}>
          {/* The real strip's and panel's hooks for the phone scroll (usePhoneDetailScroll). */}
          <div data-panel-strip="" style={{ top: '108px' }} />
          <div data-panel-content="" />
          <button
            type="button"
            onClick={() => {
              props.setPanelOpen(false);
              props.setComposerMode('reply');
            }}
          >
            back to Thread
          </button>
          <button
            type="button"
            onClick={() => {
              props.setTab('ai');
              props.setPanelOpen(true);
            }}
          >
            open AI tab
          </button>
          <button
            type="button"
            onClick={() => {
              props.setTab('notes');
              props.setPanelOpen(true);
              props.setComposerMode('note');
            }}
          >
            open Notes tab
          </button>
        </div>
      ) : (
        <actual.MessagePanelTabs {...props} />
      ),
  };
});

// ─── Viewport ────────────────────────────────────────────────────────────────

const setViewport = (phone: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: phone && query === PHONE_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

const baseMessage = {
  id: 101,
  publicId: 'SUP-101',
  subject: 'Wrong size delivered, need exchange before Friday',
  content: 'Hello',
  channel: 'email',
  sender: 'Ada Lovelace <ada@example.com>',
  status: 'in_progress',
  lastReplyFromClient: true,
  assigneeId: 7,
  metadata: { analysis: { category: 'other' } },
  recipients: { to: ['support@acme.test'], cc: ['billing@acme.test'], bcc: [] },
  createdAt: '2026-09-22T10:00:00Z',
} as unknown as Message;

const renderDetail = (
  overrides: Partial<Message> = {},
  props: Partial<React.ComponentProps<typeof MessageDetail>> = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageDetail message={{ ...baseMessage, ...overrides }} {...props} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, onClose };
};

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

const topRow = () => screen.getByTestId('detail-top-row');
const composer = () => screen.getByTestId('message-composer');
const decisions = () => screen.queryByRole('group', { name: 'Resolve decisions' });
const classOf = (el: Element | null) => el?.getAttribute('class') ?? '';

beforeEach(() => {
  // jsdom has no scrolling; the phone detail scrolls the document (usePhoneDetailScroll).
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  stubs.panel = true;
  aiDrafts.off = false;
  aiDrafts.configured = true;
  aiDrafts.offOnRefresh = false;
  svc.message.getThreadMessages = vi.fn().mockResolvedValue({ data: [] });
  svc.message.markRead = vi.fn().mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const noop = () => {};
const tabsProps = (over: Partial<MessagePanelTabsProps>): MessagePanelTabsProps =>
  ({
    message: { ...baseMessage, id: 9001 },
    variant: 'rail',
    tab: 'notes',
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
    currentUserId: 7,
    leadState: null,
    setLeadState: noop,
    leadFieldDefs: [],
    onGhostClick: noop,
    setComposerMode: noop,
    noteEditorRef: createRef(),
    ...over,
  }) as unknown as MessagePanelTabsProps;

const event = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 501,
    type: 'inbound',
    content: 'Hi there',
    authorEmail: 'ada@example.com',
    createdAt: '2026-09-22T10:00:00Z',
    ...over,
  }) as unknown as MessageEvent;

/*
  A real browser runs a microtask checkpoint between React's root listener and a listener on the
  document, and React 18 (createRoot) re-renders a discrete update in that microtask — so a
  document click listener sees the page AFTER the click was handled. jsdom dispatches the whole
  event synchronously and never shows that. A flushSync on <body> (between the root container and
  the document) recreates it; without it the defect below cannot be reproduced at all.
*/
const flushBetweenRootAndDocument = () => {
  const flush = () => flushSync(() => {});
  document.body.addEventListener('click', flush);
  return () => document.body.removeEventListener('click', flush);
};
/** A finger: the press, then the click, on the same element. */
const tap = (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
};
const phoneState = () => composer().getAttribute('data-phone-state');

export {
  setViewport,
  baseMessage,
  renderDetail,
  wrap,
  topRow,
  composer,
  decisions,
  classOf,
  noop,
  tabsProps,
  event,
  flushBetweenRootAndDocument,
  tap,
  phoneState,
  serviceMock,
  svc,
  stubs,
  aiDrafts,
};
