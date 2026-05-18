import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';

// Mock dependencies used by MessageListItem
vi.mock('@/lib/messageHelpers', () => ({
  getChannelIcon: vi.fn().mockReturnValue(null),
  getCategoryDisplay: vi.fn().mockReturnValue(null),
  hasMessageAttachments: vi.fn().mockReturnValue(false),
  getSpamCheck: vi.fn().mockReturnValue(null),
  getFilteredCategoryLabel: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: vi.fn().mockReturnValue('Jan 1, 2026'),
  formatAge: vi.fn().mockReturnValue('1d ago'),
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/tickets/LeadQualificationPanel', () => ({
  STAGE_COLORS: {},
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MessageListItem } from '@/components/messages/MessageListItem';

const mockMessage: Message = {
  id: 1,
  channel: 'email',
  sender: 'customer@example.com',
  recipient: 'support@company.com',
  subject: 'Test Subject',
  content: 'This is the message content',
  processed: false,
  ticketId: null,
  createdAt: '2026-01-01T10:00:00Z',
  status: 'open',
  priority: 'medium',
  metadata: {},
};

const mockThread: MessageThread = {
  threadId: 'thread-1',
  messageCount: 1,
  sender: 'customer@example.com',
  channel: 'email',
  hasUnread: false,
  hasTicket: false,
  linkedTicketStatus: null,
  isResolved: false,
  isLead: false,
  lastReplyFromClient: null,
  lastMessageAt: new Date('2026-01-01T10:00:00Z'),
  latestMessage: mockMessage,
  latestIncomingMessage: mockMessage,
};

describe('InboxSmoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders message list item without crashing', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <MessageListItem thread={mockThread} onOpen={onOpen} />
      </MemoryRouter>
    );
    // The sender email should appear somewhere in the rendered output
    expect(screen.getByText('customer@example.com')).toBeTruthy();
  });

  it('renders message subject', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <MessageListItem thread={mockThread} onOpen={onOpen} />
      </MemoryRouter>
    );
    expect(screen.getByText('Test Subject')).toBeTruthy();
  });

  it('renders multiple messages', () => {
    const onOpen = vi.fn();
    const threads: MessageThread[] = [
      { ...mockThread, threadId: 'thread-1', sender: 'alice@example.com', latestMessage: { ...mockMessage, id: 1, sender: 'alice@example.com', subject: 'First' } },
      { ...mockThread, threadId: 'thread-2', sender: 'bob@example.com', latestMessage: { ...mockMessage, id: 2, sender: 'bob@example.com', subject: 'Second' } },
    ];

    const { container } = render(
      <MemoryRouter>
        <div data-testid="message-list">
          {threads.map((t) => (
            <MessageListItem key={t.threadId} thread={t} onOpen={onOpen} />
          ))}
        </div>
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="message-list"]')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });
});
