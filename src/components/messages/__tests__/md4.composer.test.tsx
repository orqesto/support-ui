/**
 * Message detail v4 — composer and layout (areas C1, C2, L1 below).
 *
 *   C1  The AI panel's note: "Your note for the AI draft", a visible "n / 2000" counter (the cap
 *       was always there, silently), and the note stays on screen and editable under a produced
 *       draft, so a fact added there reaches "Try again".
 *   C2  The composer's "Look up" opens the Customer tab at the Connected systems block — in the
 *       slide-over it also opens the rail. Hidden in Internal-note mode and whenever the lookup
 *       panel itself would not render (availability no / error), on the panel's own query.
 *   L1  Full page: sidebar `clamp(312px,30vw,520px)`, page frame capped at 1640px; below 1024px
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
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
// The side panel is another agent's surface — report what MessageDetail asked of it, and stand
// in for the lookup root (data-lookup-root) on the Customer tab.
const panelStub = vi.hoisted(() => ({ lateRoot: false }));
vi.mock('../MessagePanelTabs', async () => {
  const { useEffect, useState } = await vi.importActual<typeof ReactModule>('react');
  // A panel whose body arrives a frame AFTER the tab opens (the real one can take a frame or two).
  const LateRoot = () => {
    const [shown, setShown] = useState(false);
    useEffect(() => {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }, []);
    return shown ? <div data-testid="lookup-root" data-lookup-root="" tabIndex={-1} /> : null;
  };
  return {
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
      >
        {tab === 'customer' &&
          (panelStub.lateRoot ? (
            <LateRoot />
          ) : (
            // tabIndex -1, as the real block (CustomApiLookupPanel) carries.
            <div data-testid="lookup-root" data-lookup-root="" tabIndex={-1} />
          ))}
      </div>
    ),
  };
});
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MessageDetail } from '../MessageDetail';
import { ComposerAiActions, MAX_INSTRUCTIONS } from '../ComposerAiActions';
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

const LOOK_UP = 'Look up this customer in connected systems';
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
const scrollIntoView = vi.fn();

beforeEach(() => {
  lookup.availability.mockResolvedValue(true);
  svc.message.composeReply = vi.fn().mockResolvedValue({
    data: { text: 'Your parcel is at the border.', language: 'en' },
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  media.wide = false;
  panelStub.lateRoot = false;
  delete (window as { matchMedia?: unknown }).matchMedia;
  aiDrafts.off = false;
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── C1 ───────────────────────────────────────────────────────────────────────

describe('C1 — the note for the AI draft', () => {
  const openPanel = (props: Partial<React.ComponentProps<typeof ComposerAiActions>> = {}) => {
    const utils = render(
      <ComposerAiActions messageId={42} composer="" setComposer={vi.fn()} {...props} />
    );
    fireEvent.click(screen.getByTitle('Draft this reply with AI'));
    return utils;
  };
  const note = () => screen.getByLabelText('Your note for the AI draft');

  it('is labelled for what it is, and the label names the textarea', () => {
    openPanel();
    expect(note().tagName).toBe('TEXTAREA');
    expect(note()).toHaveAttribute(
      'placeholder',
      "Optional — leave empty and I'll answer from your knowledge base"
    );
    expect(screen.getByText('Your note for the AI draft')).toHaveClass('text-ai');
  });

  it('shows a counter that follows the typing', () => {
    openPanel();
    expect(screen.getByTestId('ai-note-count')).toHaveTextContent('0 / 2000');
    fireEvent.change(note(), { target: { value: 'Order 137416' } });
    expect(screen.getByTestId('ai-note-count')).toHaveTextContent('12 / 2000');
  });

  it('keeps the cap: 2100 typed characters store 2000, and the counter says so', () => {
    openPanel();
    fireEvent.change(note(), { target: { value: 'x'.repeat(2100) } });
    expect((note() as HTMLTextAreaElement).value).toHaveLength(MAX_INSTRUCTIONS);
    expect(screen.getByTestId('ai-note-count')).toHaveTextContent('2000 / 2000');
  });

  it('a controlled note (shared with the lookup) shows the HOST value and reports edits', () => {
    const onInstructionsChange = vi.fn();
    openPanel({ instructions: 'Order 1.', onInstructionsChange });
    expect(note()).toHaveValue('Order 1.');
    expect(screen.getByTestId('ai-note-count')).toHaveTextContent('8 / 2000');
    fireEvent.change(note(), { target: { value: 'Order 12.' } });
    expect(onInstructionsChange).toHaveBeenCalledWith('Order 12.');
  });

  it('stays on screen under a draft, and Try again sends what the note says NOW', async () => {
    openPanel();
    fireEvent.click(screen.getByText('Write reply'));
    expect(await screen.findByText('Your parcel is at the border.')).toBeInTheDocument();
    expect(svc.message.composeReply).toHaveBeenLastCalledWith(42, { mode: 'generate' });

    // Draft text, then the note, then the actions (v4 order).
    const draftText = screen.getByText('Your parcel is at the border.');
    const useIt = screen.getByRole('button', { name: 'Use it' });
    expect(
      draftText.compareDocumentPosition(note()) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(note().compareDocumentPosition(useIt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(note(), { target: { value: 'ships Monday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(svc.message.composeReply).toHaveBeenLastCalledWith(42, {
        mode: 'guided',
        instructions: 'ships Monday',
      })
    );
  });

  it('a guided draft whose note was emptied retries as generate, never guided-with-nothing', async () => {
    openPanel();
    fireEvent.change(note(), { target: { value: 'ships Monday' } });
    fireEvent.click(screen.getByText('Write reply'));
    await screen.findByText('Your parcel is at the border.');
    fireEvent.change(note(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(svc.message.composeReply).toHaveBeenLastCalledWith(42, { mode: 'generate' })
    );
  });

  it('a POLISH draft shows no note — polish does not send one', async () => {
    openPanel({ composer: '<p>parcel stuck</p>' });
    fireEvent.click(screen.getByText('Make it customer-ready'));
    await screen.findByText('Your parcel is at the border.');
    expect(screen.queryByLabelText('Your note for the AI draft')).not.toBeInTheDocument();
  });

  it('AI drafts off: no panel, no note — the off notice instead', () => {
    aiDrafts.off = true;
    render(<ComposerAiActions messageId={42} composer="" setComposer={vi.fn()} />);
    expect(screen.getByTestId('ai-drafts-off-note')).toBeInTheDocument();
    expect(screen.queryByText('Your note for the AI draft')).not.toBeInTheDocument();
  });
});

// ─── C2 ───────────────────────────────────────────────────────────────────────

describe('C2 — the composer Look up button', () => {
  it('slide-over: opens the rail on the Customer tab and flashes the lookup block', async () => {
    renderDetail();
    expect(panel()).toHaveAttribute('data-tab', 'ai');
    expect(panel()).toHaveAttribute('data-open', 'false');

    fireEvent.click(await screen.findByTitle(LOOK_UP));

    expect(panel()).toHaveAttribute('data-tab', 'customer');
    expect(panel()).toHaveAttribute('data-open', 'true');
    const root = screen.getByTestId('lookup-root');
    await waitFor(() => expect(root).toHaveClass('ring-[3px]'));
    // v4 `.k-flash` rings in --accent-line; the muted fill was near-white on white (and invisible
    // on dark) — a flash nobody could see.
    expect(root).toHaveClass('ring-primary-line');
    expect(root).not.toHaveClass('ring-primary-muted');
    expect(scrollIntoView).toHaveBeenCalled();
    // The flash is short — it goes away again.
    await waitFor(() => expect(root).not.toHaveClass('ring-[3px]'), { timeout: 2500 });
  });

  it('a second press inside the flash restarts it: the ring goes at once, comes back, then ends', async () => {
    renderDetail();
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    const root = screen.getByTestId('lookup-root');
    await waitFor(() => expect(root).toHaveClass('ring-[3px]'));
    fireEvent.click(screen.getByTitle(LOOK_UP));
    // Cancelled synchronously — the old flash's removal timer is gone, so the ring must be too.
    expect(root).not.toHaveClass('ring-[3px]');
    expect(root).not.toHaveClass('ring-primary-line');
    await waitFor(() => expect(root).toHaveClass('ring-[3px]'));
    await waitFor(() => expect(root).not.toHaveClass('ring-[3px]'), { timeout: 2500 });
  });

  it('a lookup block that renders a frame late is still found and flashed', async () => {
    panelStub.lateRoot = true;
    renderDetail();
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    // Not there on the first frame…
    expect(screen.queryByTestId('lookup-root')).toBeNull();
    // …found on a later one.
    const root = await screen.findByTestId('lookup-root');
    await waitFor(() => expect(root).toHaveClass('ring-[3px]'));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('phone: hidden at rest (the pill has no room), shown once the composer opens', async () => {
    // jsdom has no scrolling; the phone detail scrolls the document (usePhoneDetailScroll).
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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
    renderDetail();
    const lookUp = await screen.findByTitle(LOOK_UP);
    expect(screen.getByTestId('message-composer').getAttribute('data-phone-state')).toBe('rest');
    expect(lookUp.className.split(/\s+/)).toContain('hidden');
    fireEvent.click(screen.getByTestId('rich-text-editor'));
    expect(screen.getByTestId('message-composer').getAttribute('data-phone-state')).toBe('open');
    expect(screen.getByTitle(LOOK_UP).className.split(/\s+/)).not.toContain('hidden');
    scrollTo.mockRestore();
  });

  it('full page (sidebar always visible): selects the Customer tab without hiding the thread', async () => {
    media.wide = true;
    renderDetail({}, { isFullPage: true });
    expect(panel()).toHaveAttribute('data-variant', 'sidebar');

    fireEvent.click(await screen.findByTitle(LOOK_UP));

    expect(panel()).toHaveAttribute('data-tab', 'customer');
    expect(panel()).toHaveAttribute('data-open', 'false');
  });

  it('asks the SAME availability question as the lookup panel (thread surface)', async () => {
    renderDetail();
    await screen.findByTitle(LOOK_UP);
    expect(lookup.availability).toHaveBeenCalledWith('thread');
  });

  it('is hidden when the workspace has no lookup set up', async () => {
    lookup.availability.mockResolvedValue(false);
    renderDetail();
    await waitFor(() => expect(lookup.availability).toHaveBeenCalled());
    // A tick for the query to settle.
    await screen.findByRole('button', { name: /AI draft/ });
    expect(screen.queryByTitle(LOOK_UP)).not.toBeInTheDocument();
  });

  it('is hidden when the availability request fails (older backend) — fails closed', async () => {
    lookup.availability.mockRejectedValue(new Error('404'));
    renderDetail();
    await waitFor(() => expect(lookup.availability).toHaveBeenCalled());
    await screen.findByRole('button', { name: /AI draft/ });
    expect(screen.queryByTitle(LOOK_UP)).not.toBeInTheDocument();
  });

  it('is hidden in Internal-note mode, and comes back in Reply', async () => {
    renderDetail();
    await screen.findByTitle(LOOK_UP);
    fireEvent.click(screen.getByRole('button', { name: 'Internal note' }));
    expect(screen.queryByTitle(LOOK_UP)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByTitle(LOOK_UP)).toBeInTheDocument();
  });

  it('stays offered on a WhatsApp thread whose window is shut — a lookup sends nothing', async () => {
    renderDetail({
      channel: 'whatsapp',
      whatsappWindow: { open: false, expiresAt: '2020-01-01T00:00:00Z' },
    } as Partial<Message>);
    expect(await screen.findByTitle(LOOK_UP)).toBeInTheDocument();
    // The blocked state really is in force (send refused, notice shown).
    expect(screen.getByRole('alert')).toHaveTextContent(/reply window has closed/);
  });

  it('focus lands on the lookup block (not <body>) — a screen reader arrives where the press led', async () => {
    renderDetail();
    const button = await screen.findByTitle(LOOK_UP);
    button.focus();
    fireEvent.click(button);
    const root = screen.getByTestId('lookup-root');
    await waitFor(() => expect(document.activeElement).toBe(root));
  });

  it('phone: the Customer tab hides the composer — focus still lands on the lookup block', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    setPhone();
    renderDetail();
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    expect(screen.getByTestId('message-composer').className.split(/\s+/)).toContain('hidden');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('lookup-root')));
    scrollTo.mockRestore();
  });

  it('a closed thread has no composer, so no Look up', async () => {
    renderDetail({ status: 'closed' } as Partial<Message>);
    await waitFor(() => expect(lookup.availability).toHaveBeenCalled());
    expect(screen.queryByTitle(LOOK_UP)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Internal note' })).not.toBeInTheDocument();
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

  /** Opens the Customer tab (the composer is display:none under it) and parks focus on <body>. */
  const onCustomerTab = async () => {
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(composerHidden()).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('lookup-root')));
    (document.activeElement as HTMLElement).blur();
  };

  it('R goes back to the Thread tab and focuses the reply editor, which is on screen', async () => {
    setPhone();
    renderDetail();
    await onCustomerTab();
    press('r');
    expect(panel()).toHaveAttribute('data-open', 'false');
    expect(composerHidden()).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Reply as Dana…'))
    );
  });

  it('N goes back where the composer shows and focuses the note editor', async () => {
    setPhone();
    renderDetail();
    await onCustomerTab();
    press('n');
    expect(composerHidden()).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText('Internal note — only visible to the team…')
      )
    );
  });

  it('CONTROL desktop: R focuses the reply editor and leaves the open rail alone', async () => {
    renderDetail();
    fireEvent.click(await screen.findByTitle(LOOK_UP));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('lookup-root')));
    (document.activeElement as HTMLElement).blur();
    press('r');
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(panel()).toHaveAttribute('data-tab', 'customer');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Reply as Dana…'))
    );
  });
});

// ─── One merge-list read per open ─────────────────────────────────────────────

describe('merges — the thread asks for its merge list once per open', () => {
  it('MessageDetail and its header share ONE GET …/merges', async () => {
    const { apiClient } = await import('@/lib/api-client');
    const { get } = apiClient as unknown as { get: ReturnType<typeof vi.fn> };
    renderDetail();
    await screen.findByTitle(LOOK_UP);
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
        <MemoryRouter initialEntries={['/messages/101']}>
          <Routes>
            <Route path="/messages/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const frame = await screen.findByTestId('detail-page-frame');
    expect(frame).toHaveClass('w-full');
    expect(frame.className).not.toMatch(/max-w-/);
  });
});
