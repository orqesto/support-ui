import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import type { Message } from '@/types';

// vi.mock factories are hoisted — no variable references allowed inside them
// Define mock data as literals inside each factory
// The thread's tickets (the header chip, 2026-09-30) — hermetic: an unmocked request
// fails after the test and logs during teardown.
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: {
    ticketsOfThread: () => Promise.resolve({ unavailable: false, rows: [], hiddenCount: 0 }),
    threadsOfTicket: () => Promise.resolve({ unavailable: false, rows: [], hiddenCount: 0 }),
    addThreads: () => Promise.resolve({ added: [], alreadyAttached: [] }),
    removeThread: () => Promise.resolve(false),
  },
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getById: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 42,
        channel: 'email',
        sender: 'customer@example.com',
        recipient: 'support@company.com',
        subject: 'Help with my account',
        content: 'I need assistance with my account.',
        processed: false,
        ticketId: null,
        createdAt: '2026-01-01T10:00:00Z',
        status: 'open',
        priority: 'medium',
        metadata: {},
      },
    }),
    getThreadMessages: vi.fn().mockResolvedValue({ success: true, data: [] }),
    reply: vi.fn().mockResolvedValue({ success: true }),
    markAsProcessed: vi.fn().mockResolvedValue({ success: true }),
    reopen: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    classify: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));


// Mock MessageDetail to isolate the page-level test
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({ message }: { message: Message }) => (
    <div data-testid="message-detail">
      <span data-testid="message-sender">{message.sender}</span>
      <span data-testid="message-subject">{message.subject}</span>
    </div>
  ),
}));

vi.mock('@/components/shared/ScrollButtons', () => ({
  ScrollButtons: () => null,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { MessageDetailPage } from '@/pages/MessageDetailPage';

describe('MessageDetailSmoke', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders loading state initially', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/threads/42']} future={ROUTER_FUTURE}>
          <Routes>
            <Route path="/threads/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    // The page itself renders (the app shell now comes from the layout route, not the page)
    expect(document.body.textContent?.trim()).not.toBe('');
  });

  it('renders the page without crashing for a valid message id', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/threads/42']} future={ROUTER_FUTURE}>
          <Routes>
            <Route path="/threads/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    // The page renders content regardless of loading state
    expect(document.body.textContent?.trim()).not.toBe('');
  });

  it('shows loading text while fetching message', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/threads/42']} future={ROUTER_FUTURE}>
          <Routes>
            <Route path="/threads/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    // The page starts in loading state — shows loader text
    expect(screen.getByText(/Loading thread/i)).toBeTruthy();
  });
});
