/**
 * The board card names the sender as the list's rows and cards do (Messages list v4): the name,
 * else the bare address — never the whole `Name <addr>` line (staging, 2026-10-23).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageThread } from '@/services/message.service';
import { KanbanCard } from '../KanbanCard';

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));

afterEach(cleanup);

const thread = (sender: string): MessageThread =>
  ({
    threadId: 'conv_7',
    publicId: 'COR-SUP-7',
    sender,
    subject: 'Refund?',
    status: 'open',
    priority: 'medium',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: 1,
      conversationId: 7,
      type: 'inbound',
      content: 'Where is my refund?',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  }) as unknown as MessageThread;

describe('KanbanCard — sender', () => {
  it('shows the name without the address', () => {
    render(<KanbanCard thread={thread('Ada Lovelace <ada@shop.example>')} onOpen={() => {}} />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText(/<ada@shop\.example>/)).toBeNull();
  });

  it('shows an address once when the name is the address', () => {
    render(<KanbanCard thread={thread('ada@shop.example <ada@shop.example>')} onOpen={() => {}} />);
    expect(screen.getByText('ada@shop.example')).toBeTruthy();
  });
});
