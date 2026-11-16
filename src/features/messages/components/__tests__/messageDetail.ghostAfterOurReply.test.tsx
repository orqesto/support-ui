/**
 * MessageDetail tells the suggestion zone whether the last message (notes aside) is ours.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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
vi.mock('@/features/tickets/services/category.service', () => ({ categoryService: serviceMock() }));
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
const aiDrafts = vi.hoisted(() => ({ off: false, resolved: true }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: aiDrafts.resolved }),
  useRefreshAiDrafts: () => () => undefined,
}));
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
    setComposer,
    onSend,
  }: {
    shortcutHint?: string;
    decisions?: React.ReactNode;
    setComposer: (value: string) => void;
    onSend: () => void;
  }) => (
    <div data-testid="composer">
      {shortcutHint}
      <button type="button" onClick={() => setComposer('<p>Label is on its way</p>')}>
        type draft
      </button>
      <button type="button" onClick={onSend}>
        send draft
      </button>
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
vi.mock('../MessageGhostBubble', () => ({
  MessageGhostBubble: ({
    ghostOption,
    answered,
  }: {
    ghostOption: { answer?: string } | null;
    answered?: boolean;
  }) => (
    <div data-testid="ghost" data-answered={String(answered === true)}>
      {ghostOption?.answer ?? ''}
    </div>
  ),
}));
vi.mock('@/features/contacts/components/ContactProfilePanel', () => ({
  ContactProfilePanel: () => null,
}));
vi.mock('@/features/messages/components/SimilarMessagesDialog', () => ({ SimilarMessagesDialog: () => null }));
vi.mock('../PromoteToKbDialog', () => ({ PromoteToKbDialog: () => null }));

import { MessageDetail } from '../MessageDetail';

const STORED = 'Your parcel left the warehouse yesterday.';

const message = {
  id: 303,
  subject: 'Parcel?',
  content: 'Hello',
  fromEmail: 'cust@example.com',
  fromName: 'Cust',
  sender: 'Cust <cust@example.com>',
  status: 'open',
  lastReplyFromClient: null,
  assigneeId: null,
  metadata: { suggestedAnswer: { answer: STORED, source: 'ai', confidence: 0.9 } },
  createdAt: '2026-10-01T10:00:00Z',
} as unknown as Message;

const event = (id: number, type: string, at: string) => ({
  id,
  type,
  content: `${type} ${id}`,
  authorEmail: type === 'inbound' ? 'cust@example.com' : 'agent@example.com',
  createdAt: at,
  sentAt: at,
  metadata: {},
});

const renderWithThread = (rows: unknown[], shown: Message = message) => {
  svc.message.getThreadMessages.mockResolvedValue({ data: rows });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MessageDetail message={shown} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const answeredFlag = async (expected: 'true' | 'false') =>
  waitFor(() => expect(screen.getByTestId('ghost')).toHaveAttribute('data-answered', expected));

beforeEach(() => {
  aiDrafts.off = false;
  aiDrafts.resolved = true;
  media.wide = false;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * The stored AI draft answers the customer's email. Once our reply is the last message, the
 * thread offers no suggestion until the customer writes again.
 */
describe('MessageDetail — no AI suggestion after our reply', () => {
  it('an agent replied last: the suggestion zone is told the email is answered', async () => {
    renderWithThread([
      event(1, 'inbound', '2026-10-01T10:00:00Z'),
      event(2, 'agent_reply', '2026-10-01T11:00:00Z'),
    ]);
    await answeredFlag('true');
  });

  it('a note after the customer email does not count as our reply', async () => {
    renderWithThread([
      event(1, 'inbound', '2026-10-01T10:00:00Z'),
      event(2, 'note', '2026-10-01T11:00:00Z'),
    ]);
    await answeredFlag('false');
  });

  it('CONTROL: the customer wrote again after our reply: the suggestion is offered', async () => {
    renderWithThread([
      event(1, 'inbound', '2026-10-01T10:00:00Z'),
      event(2, 'agent_reply', '2026-10-01T11:00:00Z'),
      event(3, 'inbound', '2026-10-01T12:00:00Z'),
    ]);
    await answeredFlag('false');
  });
});

/**
 * A customer's newer email showed the stored draft written for their PREVIOUS email (2026-11-16).
 * The draft names the email it answers (`answersEventId`); the thread offers it only for the
 * latest customer email.
 */
describe('MessageDetail — a draft for an earlier customer email is not offered', () => {
  const withDraft = (metadata: Record<string, unknown>) =>
    ({ ...message, metadata: { ...message.metadata, ...metadata } }) as unknown as Message;
  const draft = (answersEventId: number) => ({
    suggestedAnswer: { answer: STORED, source: 'documentation', answersEventId },
  });
  const thread = [
    event(1, 'inbound', '2026-10-01T10:00:00Z'),
    event(2, 'agent_reply', '2026-10-01T11:00:00Z'),
    event(3, 'inbound', '2026-10-01T12:00:00Z'),
  ];
  const ghostText = () => screen.getByTestId('ghost').textContent;

  it('the draft answers email 1, the customer wrote email 3: the draft is not offered', async () => {
    renderWithThread(thread, withDraft(draft(1)));
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await waitFor(() => expect(ghostText()).toBe(''));
    // The zone itself stays (spinner / "No suggestion found"): email 3 is unanswered.
    await answeredFlag('false');
  });

  it('before the events load, a draft that names an email is not one click away', () => {
    svc.message.getThreadMessages.mockReturnValue(new Promise(() => undefined));
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <MessageDetail message={withDraft(draft(3))} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(ghostText()).toBe('');
  });

  it('CONTROL: the draft answers email 3, the latest: it is offered', async () => {
    renderWithThread(thread, withDraft(draft(3)));
    await waitFor(() => expect(ghostText()).toBe(STORED));
  });
  // The thread read carries the backend's verdict on the stored draft (2026-11-16): a page holding
  // none of the customer's emails (a long thread, a cached page) no longer decides.
  const renderWithVerdict = (answersEventId: number, age: 'current' | 'older') => {
    svc.message.getThreadMessages.mockResolvedValue({
      data: [event(20, 'note', '2026-10-01T16:00:00Z')],
      storedDraft: {
        latestInbound: { eventId: 7, at: '2026-10-01T15:00:00.000Z' },
        storedDraftAge: { age, answersEventId, foundAt: null },
      },
    });
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <MessageDetail message={withDraft(draft(answersEventId))} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("the backend says the draft for email 3 is older: not offered, whatever the page holds", async () => {
    renderWithVerdict(3, 'older');
    await waitFor(() => expect(svc.message.getThreadMessages).toHaveBeenCalled());
    await waitFor(() => expect(ghostText()).toBe(''));
  });

  it('CONTROL: the backend says it is current: offered', async () => {
    renderWithVerdict(7, 'current');
    await waitFor(() => expect(ghostText()).toBe(STORED));
  });
});
