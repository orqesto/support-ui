import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
vi.mock('@/services/customApiLookup.service', () => {
  lookup.availability = vi.fn<(...args: unknown[]) => Promise<boolean>>();
  return {
    customApiLookupService: {
      availability: (...args: unknown[]) => lookup.availability(...args),
      lookupOptions: () => Promise.resolve([]),
    },
  };
});
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/services/category.service', () => ({ categoryService: serviceMock() }));
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
vi.mock('@/hooks/useAiDraftsOff', () => ({
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
// The panel stub renders NO lookup root: the test owns one root outside the component, so it
// survives a thread switch and an unmount (as the real lookup panel can outlive a press).
vi.mock('../MessagePanelTabs', () => ({
  MessagePanelTabs: ({
    variant,
    tab,
    panelOpen,
  }: {
    variant?: string;
    tab: string;
    panelOpen: boolean;
  }) => (
    <div
      data-testid="panel-tabs"
      data-variant={variant ?? 'rail'}
      data-tab={tab}
      data-open={String(panelOpen)}
    />
  ),
}));
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MessageDetail } from '../MessageDetail';

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

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const tree = (
  queryClient: QueryClient,
  overrides: Partial<Message> = {},
  props: Partial<React.ComponentProps<typeof MessageDetail>> = {}
) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <MessageDetail message={{ ...baseMessage, ...overrides }} onClose={vi.fn()} {...props} />
    </MemoryRouter>
  </QueryClientProvider>
);

const LOOK_UP = 'Look up this customer in connected systems';
const RING = 'ring-[3px]';
const panel = () => screen.getByTestId('panel-tabs');

// Manual animation frames: a frame runs only when the test flushes it.
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const raf = vi.fn((cb: FrameRequestCallback) => {
  const id = nextFrame++;
  frames.set(id, cb);
  return id;
});
const caf = vi.fn((id: number) => {
  frames.delete(id);
});
const flushFrame = () =>
  act(() => {
    const pending = Array.from(frames.values());
    frames = new Map();
    pending.forEach((cb) => cb(0));
  });

const scrollIntoView = vi.fn();
let lookupRoot: HTMLDivElement | null = null;
const addLookupRoot = () => {
  lookupRoot = document.createElement('div');
  lookupRoot.setAttribute('data-lookup-root', '');
  lookupRoot.tabIndex = -1;
  lookupRoot.scrollIntoView = scrollIntoView;
  document.body.prepend(lookupRoot);
  return lookupRoot;
};

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  lookup.availability.mockResolvedValue(true);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
});
afterEach(() => {
  media.wide = false;
  cleanup();
  lookupRoot?.remove();
  lookupRoot = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MessageDetail Look up — seek and flash', () => {
  it('scrolls the block into view gently and focuses it without a second scroll', async () => {
    const root = addLookupRoot();
    const focus = vi.spyOn(root, 'focus');
    render(tree(client()));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    flushFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(root);
    expect(root).toHaveClass(RING);
  });

  it('a second press before the first frame runs cancels the first seek (one scroll, not two)', async () => {
    addLookupRoot();
    render(tree(client()));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    const firstFrame = raf.mock.results.at(-1)?.value as number;
    fireEvent.click(screen.getByTitle(LOOK_UP));
    expect(caf).toHaveBeenCalledWith(firstFrame);
    flushFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a second press clears the first removal timer: the new ring outlives the first deadline', async () => {
    const root = addLookupRoot();
    render(tree(client()));
    const button = await screen.findByTitle(LOOK_UP);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    flushFrame();
    expect(root).toHaveClass(RING);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.click(screen.getByTitle(LOOK_UP));
    flushFrame();
    expect(root).toHaveClass(RING);
    // Past press 1's deadline (1200 ms), before press 2's (1800 ms).
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(root).toHaveClass(RING);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(root).not.toHaveClass(RING);
  });

  it('a thread switch mid-flash takes the ring off at once', async () => {
    const root = addLookupRoot();
    const queryClient = client();
    const { rerender } = render(tree(queryClient));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    flushFrame();
    expect(root).toHaveClass(RING);
    rerender(tree(queryClient, { id: 202 } as Partial<Message>));
    expect(root).not.toHaveClass(RING);
  });

  it('a thread switch before the frame runs cancels the seek', async () => {
    addLookupRoot();
    const queryClient = client();
    const { rerender } = render(tree(queryClient));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    rerender(tree(queryClient, { id: 202 } as Partial<Message>));
    flushFrame();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('unmount before the frame runs: nothing scrolls, focuses or flashes afterwards', async () => {
    const root = addLookupRoot();
    const focus = vi.spyOn(root, 'focus');
    const { unmount } = render(tree(client()));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    unmount();
    flushFrame();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(root).not.toHaveClass(RING);
  });

  it('unmount mid-flash takes the ring off', async () => {
    const root = addLookupRoot();
    const { unmount } = render(tree(client()));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    flushFrame();
    expect(root).toHaveClass(RING);
    unmount();
    expect(root).not.toHaveClass(RING);
  });

  it('gives up after 10 frames when the lookup block never renders', async () => {
    render(tree(client()));
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    raf.mockClear();
    for (let index = 0; index < 40 && frames.size > 0; index += 1) flushFrame();
    expect(frames.size).toBe(0);
    // The press asked for frame 1 (cleared above); 9 retries follow.
    expect(raf).toHaveBeenCalledTimes(9);
  });

  it('uses the CURRENT layout: slide-over → wide sidebar, the press does not open the rail', async () => {
    addLookupRoot();
    const queryClient = client();
    const { rerender } = render(tree(queryClient, {}, { isFullPage: true }));
    expect(panel()).toHaveAttribute('data-variant', 'rail');
    media.wide = true;
    rerender(tree(queryClient, {}, { isFullPage: true }));
    expect(panel()).toHaveAttribute('data-variant', 'sidebar');
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    expect(panel()).toHaveAttribute('data-tab', 'lookups');
    expect(panel()).toHaveAttribute('data-open', 'false');
  });

  it('uses the CURRENT layout: wide sidebar → slide-over, the press opens the rail', async () => {
    media.wide = true;
    const queryClient = client();
    const { rerender } = render(tree(queryClient, {}, { isFullPage: true }));
    await screen.findByTitle(LOOK_UP);
    media.wide = false;
    rerender(tree(queryClient, {}, { isFullPage: true }));
    expect(panel()).toHaveAttribute('data-variant', 'rail');
    fireEvent.click(screen.getByTitle(LOOK_UP));
    expect(panel()).toHaveAttribute('data-open', 'true');
  });
});
