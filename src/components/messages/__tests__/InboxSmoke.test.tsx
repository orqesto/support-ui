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
  humanizeSignalFlag: vi.fn().mockReturnValue(''),
  // Added by ffb9f3c (URL writers prefer publicId) — mock returns the raw id.
  formatConvId: (msg: { id: number; publicId?: string | null }) =>
    msg.publicId ?? `#${msg.id}`,
  getConvUrlId: (msg: { id: number; publicId?: string | null }) =>
    msg.publicId ?? msg.id.toString(),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: vi.fn().mockReturnValue('Jan 1, 2026'),
  formatAge: vi.fn().mockReturnValue('1d ago'),
  formatDuration: vi.fn().mockReturnValue('0m'),
  safeCssColor: (color: string) => color,
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/stripHtml', () => ({
  stripHtml: (str: string) => str,
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
  Card: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div onClick={onClick}>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// useDepartments uses react-query; we just return a stable empty list for smoke.
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
}));

// useCurrentOrgCode uses react-query; mock it (no QueryClientProvider in this
// smoke). undefined → formatConvId renders the bare publicId.
vi.mock('@/hooks/useCurrentOrgCode', () => ({
  useCurrentOrgCode: () => undefined,
}));

// authStore is consumed for the Claim button — return a logged-in user.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number; firstName: string; lastName: string; email: string } | null }) => unknown) =>
    selector({ user: { id: 1, firstName: 'Test', lastName: 'User', email: 't@example.com' } }),
}));

vi.mock('@/services/assignment.service', () => ({
  assignmentService: { assignThread: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/messages/DepartmentBadge', () => ({
  DepartmentBadge: ({ dept }: { dept?: { name: string } }) => <span>{dept?.name ?? 'dept'}</span>,
}));

vi.mock('@/components/messages/MessageSignalBadges', () => ({
  MessageSignalBadges: () => null,
}));

import { MessageListItem } from '@/components/messages/MessageListItem';

const mockMessage: Message = {
  id: 1,
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Test Subject',
  content: 'This is the message content',
  createdAt: '2026-01-01T10:00:00Z',
  status: 'open',
  needsHumanReview: false,
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
          {threads.map((thread) => (
            <MessageListItem key={thread.threadId} thread={thread} onOpen={onOpen} />
          ))}
        </div>
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="message-list"]')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });
});
