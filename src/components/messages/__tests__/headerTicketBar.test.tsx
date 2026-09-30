import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

/**
 * The ticket bar in the thread header (2026-09-30): a thread can be on several tickets, and a
 * fixed incident owes THIS customer a reply until an agent sends one.
 */
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: true,
    isOrgAdmin: true,
    canManage: true,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
const { getLinkedTicket, ticketsOfThread } = vi.hoisted(() => ({
  getLinkedTicket: vi.fn(),
  ticketsOfThread: vi.fn(),
}));
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'getLinkedTicket'
          ? getLinkedTicket
          : () => Promise.resolve({ success: true, data: [] }),
    }
  ),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { ticketsOfThread },
}));
vi.mock('@/services/category.service', () => ({
  categoryService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock('@/services/settings.service', () => ({
  labelService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
// Child components fetch through the api-client; keep every request inside the test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { MessageDetailHeader } from '../MessageDetailHeader';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';
import { ThemeProvider } from '@/contexts/ThemeContext';

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  getLinkedTicket.mockResolvedValue({ success: true, data: null });
});

const message = {
  id: 1,
  publicId: 'SUP-1',
  status: 'open',
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Hello',
  createdAt: '2026-09-27T10:00:00Z',
  metadata: { analysis: { category: 'other' } },
} as unknown as Message;

const renderHeader = (msg: Message = message) =>
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MessageDetailHeader message={msg} showFullPageButton={false} isFullPage threadCount={1} />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

const row = (over: Record<string, unknown>) => ({
  ticketId: 4,
  publicId: null,
  title: 't',
  status: 'open',
  priority: 'medium',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
  ...over,
});

describe('ticket bar', () => {
  it('names the newest OPEN ticket, counts the rest, and prompts for the fixed one', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      // newest first, as the backend sends them
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: true }), row({ ticketId: 7, status: 'in_progress' })],
    });
    renderHeader();
    expect(await screen.findByText(/✓ Ticket #7/)).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    expect(screen.getByText('Ticket #9 is fixed — reply to tell this customer.')).toBeInTheDocument();
  });

  it('no prompt when the fix is unknown (owesReply null) or already told (false)', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'closed', owesReply: null }), row({ ticketId: 7, status: 'resolved' })],
    });
    renderHeader();
    expect(await screen.findByText(/✓ Ticket #9/)).toBeInTheDocument();
    expect(screen.queryByText(/reply to tell this customer/)).not.toBeInTheDocument();
  });

  it('an older backend: the one ticket its old route names', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: true });
    getLinkedTicket.mockResolvedValue({ success: true, data: { id: 5, status: 'open' } });
    renderHeader();
    expect(await screen.findByText(/✓ Ticket #5/)).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it('reloads when the Customer-tab panel changes THIS thread’s tickets — and only this thread’s', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [] });
    renderHeader();
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(1));
    ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [row({ ticketId: 9 })] });

    act(() => {
      window.dispatchEvent(new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [2] } }));
    });
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } }));
    });
    expect(await screen.findByText(/✓ Ticket #9/)).toBeInTheDocument();
  });

  it('D2: the prompt shows on a RESOLVED thread too — resolved is not "told"', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: true })],
    });
    renderHeader({ ...message, status: 'resolved' } as Message);
    expect(await screen.findByText('Ticket #9 is fixed — reply to tell this customer.')).toBeInTheDocument();
  });
});
