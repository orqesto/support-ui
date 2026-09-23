/**
 * Message detail v3, rendered for real (header + confirm dialogs + shortcuts) — the wiring the
 * unit tests of resolveMode / detailShortcuts cannot see.
 *
 *   - ONE request per press. "Resolve" on an unreviewed thread and "Not customer work" each used
 *     to post `markAsProcessed` twice (the page posted it again in onReject), writing a second
 *     `mark_processed` audit entry. The detail posts it; onReject must be told, not repeat it.
 *   - The decisions sit UNDER THE REPLY (design v3, 2026-09-23): a row at the foot of the
 *     composer, reply mode only, absent for a resolved or binned thread. The header carries none,
 *     and "Assign to me" is gone (owner, 2026-09-23).
 *   - U toggles read/unread exactly where the header's toggle is shown.
 *   - Esc while the ACTIONS menu is open closes the MENU, not the rail behind it.
 *   - No shortcut acts while a resolve request is in flight — its dialog has already closed, and
 *     J there made the request's callback move the conversation just opened.
 *
 * Heavy children (composer editor, side panel, bubbles) are stubbed; everything on the decision
 * path is real.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

// Any service method: a mock resolving to an empty list unless a test overrides it.
const { serviceMock, svc } = vi.hoisted(() => {
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
  };
});

vi.mock('@/services/message.service', () => {
  svc.message = serviceMock();
  return { messageService: svc.message };
});
vi.mock('@/services/organization.service', () => ({ organizationService: serviceMock() }));
vi.mock('@/services/category.service', () => ({ categoryService: serviceMock() }));
vi.mock('@/services/settings.service', () => ({ labelService: serviceMock() }));
vi.mock('@/services/assignment.service', () => ({ assignmentService: serviceMock() }));
vi.mock('@/lib/api-client', () => ({ apiClient: serviceMock() }));
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
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ configured: true }) }));
const media = vi.hoisted(() => ({ wide: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => media.wide }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'acme' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) => select({ user: { id: 7 } }),
}));

vi.mock('../MessageComposer', () => ({
  MessageComposer: ({
    shortcutHint,
    decisions,
  }: {
    shortcutHint?: string;
    decisions?: React.ReactNode;
  }) => (
    <div data-testid="composer">
      {shortcutHint}
      {decisions}
    </div>
  ),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../MessagePanelTabs', () => ({
  MessagePanelTabs: ({ variant }: { variant?: string }) => (
    <div data-testid="panel-tabs" data-variant={variant ?? 'rail'} />
  ),
}));
vi.mock('../ThreadMessageItem', () => ({ ThreadMessageItem: () => null }));
vi.mock('../MessageGhostBubble', () => ({ MessageGhostBubble: () => null }));
vi.mock('@/components/contacts/ContactProfilePanel', () => ({ ContactProfilePanel: () => null }));
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));

import { MessageDetail } from '../MessageDetail';

const baseMessage = {
  id: 101,
  subject: 'Where is my order?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
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

beforeEach(() => {
  svc.message.markAsProcessed = vi.fn().mockResolvedValue({ success: true });
  svc.message.markAsNotCustomerWork = vi.fn().mockResolvedValue({ success: true });
});
afterEach(() => {
  media.wide = false;
  cleanup();
  vi.clearAllMocks();
});

const press = (key: string) => fireEvent.keyDown(document.body, { key });

describe('one request per press', () => {
  it('Resolve on an unreviewed thread posts markAsProcessed ONCE, then tells onReject', async () => {
    const onReject = vi.fn();
    renderDetail({}, { onReject });
    fireEvent.click(screen.getByRole('button', { name: /^Resolve$/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
    expect(svc.message.markAsProcessed).toHaveBeenCalledTimes(1);
    expect(svc.message.markAsProcessed).toHaveBeenCalledWith(101);
  });

  it('Not customer work posts ONE request and no markAsProcessed', async () => {
    const onReject = vi.fn();
    renderDetail({}, { onReject });
    fireEvent.click(screen.getByRole('button', { name: 'Not customer work' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Not customer work|Clear|Confirm/,
      })
    );
    await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
    expect(svc.message.markAsNotCustomerWork).toHaveBeenCalledTimes(1);
    expect(svc.message.markAsProcessed).not.toHaveBeenCalled();
  });
});

const activeThread = { status: 'in_progress' as Message['status'], lastReplyFromClient: true };
const decisionsRow = () => screen.queryByRole('group', { name: 'Resolve decisions' });

describe('the decisions sit under the reply (v3, 2026-09-23)', () => {
  it('an active thread shows the row INSIDE the composer, and the hint names E', () => {
    renderDetail(activeThread);
    const row = decisionsRow();
    expect(row).toBeTruthy();
    expect(screen.getByTestId('composer').contains(row)).toBe(true);
    expect(within(row!).getByRole('button', { name: 'Resolve' })).toBeTruthy();
    expect(within(row!).getByRole('button', { name: 'Resolve & save to KB' })).toBeTruthy();
    expect(screen.getByTestId('composer').textContent).toContain('E resolve');
  });

  it('the header carries no decision: no Resolve, no caret, no Assign to me anywhere', () => {
    renderDetail({ ...activeThread, assigneeId: null });
    const subject = screen.getByRole('heading', { level: 2 });
    // Exactly one Resolve on the page, and it is the composer's.
    const resolves = screen.getAllByRole('button', { name: 'Resolve' });
    expect(resolves).toHaveLength(1);
    expect(screen.getByTestId('composer').contains(resolves[0])).toBe(true);
    expect(
      subject.compareDocumentPosition(resolves[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Other resolve options' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
  });

  it.each([
    ['resolved', { status: 'resolved' }],
    ['filtered (binned)', { status: 'filtered', metadata: { filtered: true } }],
  ])('a %s thread renders no decisions row', (_label, overrides) => {
    renderDetail(overrides as Partial<Message>);
    expect(decisionsRow()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('⛔ note mode hides the row — a note is not an answer; R brings it back', async () => {
    renderDetail(activeThread);
    expect(decisionsRow()).toBeTruthy();
    press('n');
    await waitFor(() => expect(decisionsRow()).toBeNull());
    press('r');
    await waitFor(() => expect(decisionsRow()).toBeTruthy());
  });
});

describe('U toggles read/unread where the header toggle is shown', () => {
  it('a triage thread: U marks it read, U again marks it unread', async () => {
    svc.message.markRead = vi.fn().mockResolvedValue({ success: true });
    svc.message.markUnread = vi.fn().mockResolvedValue({ success: true });
    renderDetail({
      status: 'filtered',
      metadata: { filtered: true },
      isRead: false,
    } as Partial<Message>);
    press('u');
    await waitFor(() => expect(svc.message.markRead).toHaveBeenCalledWith(101));
    press('u');
    await waitFor(() => expect(svc.message.markUnread).toHaveBeenCalledWith(101));
  });

  it('CONTROL: a non-triage thread has no toggle, so U does nothing', async () => {
    svc.message.markRead = vi.fn().mockResolvedValue({ success: true });
    svc.message.markUnread = vi.fn().mockResolvedValue({ success: true });
    renderDetail(activeThread);
    press('u');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svc.message.markRead).not.toHaveBeenCalled();
    expect(svc.message.markUnread).not.toHaveBeenCalled();
  });
});

describe('Resolve as spam = CONFIRMED spam (owner, 2026-09-22)', () => {
  it('sends move_to_spam WITH confirm, so it lands in the confirmed layer', async () => {
    const onClassify = vi.fn().mockResolvedValue(undefined);
    renderDetail(activeThread, { onClassify });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve as spam' }));
    await waitFor(() => expect(onClassify).toHaveBeenCalledTimes(1));
    expect(onClassify).toHaveBeenCalledWith('move_to_spam', undefined, undefined, true);
  });

  it('CONTROL: without a classify handler there is no spam exit to press', () => {
    renderDetail(activeThread);
    expect(screen.queryByRole('button', { name: 'Resolve as spam' })).toBeNull();
  });
});

describe('v3 header keeps every action it moved', () => {
  it('History (was a link beside the sender) is in the More menu; Copy link is an icon', () => {
    renderDetail({ status: 'in_progress' as Message['status'] });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getByText('Conversation history')).toBeTruthy();
    // Owner, 2026-09-22: no "Move to Spam" in this menu — the caret's confirmed path is the one.
    expect(within(screen.getByRole('menu')).queryByText(/move to spam/i)).toBeNull();
  });

  it('shows the sender name bold and the address beside it', () => {
    renderDetail({ sender: '"Marta K" <marta@northwind.example>' } as Partial<Message>);
    expect(screen.getByText('Marta K').tagName).toBe('B');
    expect(screen.getByText('marta@northwind.example')).toBeTruthy();
  });
});

describe('full page (v3) = two columns on a wide screen', () => {
  it('moves Dept/Assigned/Category/Labels and the context tabs into the right sidebar', () => {
    media.wide = true;
    renderDetail({ status: 'in_progress' as Message['status'] }, { isFullPage: true });
    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    const side = within(aside as HTMLElement);
    expect(side.getByText('Dept')).toBeTruthy();
    expect(side.getByText('Labels')).toBeTruthy();
    // The context tabs render IN the sidebar, in their sidebar form (no Thread tab — the
    // thread is always beside them)…
    expect(side.getByTestId('panel-tabs').getAttribute('data-variant')).toBe('sidebar');
    expect(screen.getAllByTestId('panel-tabs')).toHaveLength(1);
    // …and the meta block is not ALSO inline in the header.
    expect(screen.getAllByText('Dept')).toHaveLength(1);
  });

  it('CONTROL: narrow full page keeps the slide-over layout — nothing hidden', () => {
    media.wide = false;
    renderDetail({ status: 'in_progress' as Message['status'] }, { isFullPage: true });
    expect(document.querySelector('aside')).toBeNull();
    expect(screen.getByText('Dept')).toBeTruthy();
    expect(screen.getByTestId('panel-tabs').getAttribute('data-variant')).toBe('rail');
  });
});

describe('Esc and in-flight guards', () => {
  it('Esc with the ACTIONS menu open closes the menu, not the rail', () => {
    const onClose = vi.fn();
    renderDetail({}, { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    press('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc with the label picker open closes the picker, not the rail — focus off its search box', () => {
    const onClose = vi.fn();
    renderDetail({}, { onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Add label' }));
    expect(screen.getByRole('dialog', { name: 'Labels' })).toBeTruthy();
    press('Escape');
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CONTROL: Esc with nothing open does close the rail', () => {
    const onClose = vi.fn();
    renderDetail({}, { onClose });
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('J and E do nothing while the resolve request is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    svc.message.markAsProcessed = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const onNavigate = vi.fn();
    const onReject = vi.fn();
    renderDetail({}, { onNavigate, onReject });
    fireEvent.click(screen.getByRole('button', { name: /^Resolve$/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(svc.message.markAsProcessed).toHaveBeenCalledTimes(1));

    press('j');
    press('e');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      finish({ success: true });
      await Promise.resolve();
    });
    expect(onReject).toHaveBeenCalledTimes(1);
    press('j');
    expect(onNavigate).toHaveBeenCalledWith('next');
  });
});
