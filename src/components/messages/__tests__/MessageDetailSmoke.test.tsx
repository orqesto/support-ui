import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Message } from '@/types';

// vi.mock factories are hoisted — no variable references allowed inside them
// Define mock data as literals inside each factory
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

// Mock Layout to avoid complex sidebar/nav dependencies
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
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
      <MemoryRouter initialEntries={['/messages/42']}>
        <Routes>
          <Route path="/messages/:id" element={<MessageDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    // The layout wrapper is always present
    expect(screen.getByTestId('layout')).toBeTruthy();
  });

  it('renders the page without crashing for a valid message id', () => {
    render(
      <MemoryRouter initialEntries={['/messages/42']}>
        <Routes>
          <Route path="/messages/:id" element={<MessageDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    // Layout renders regardless of loading state
    expect(screen.getByTestId('layout')).toBeTruthy();
  });

  it('shows loading text while fetching message', () => {
    render(
      <MemoryRouter initialEntries={['/messages/42']}>
        <Routes>
          <Route path="/messages/:id" element={<MessageDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    // The page starts in loading state — shows loader text
    expect(screen.getByText(/Loading message/i)).toBeTruthy();
  });
});
