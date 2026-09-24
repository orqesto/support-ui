import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * Same rule as the kanban card, on the list row: with AI drafts off the stored draft behind
 * "AI suggested — review and send" is not offered anywhere, so the row must not claim it.
 */

const aiDrafts = vi.hoisted(() => ({ off: false }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { MessageListItem } from '../MessageListItem';

afterEach(() => {
  cleanup();
  aiDrafts.off = false;
});

const row = (): MessageThread =>
  ({
    threadId: 'conv_7',
    publicId: 'COR-SUP-7',
    sender: 'a@b.example',
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
      needsHumanReview: true,
      metadata: { suggestedAnswer: { answer: 'A stored draft.' } },
    },
  }) as unknown as MessageThread;

const renderRow = () =>
  render(
    <MemoryRouter>
      <MessageListItem thread={row()} onOpen={() => {}} />
    </MemoryRouter>
  );

describe('MessageListItem — AI state chip with AI drafts off', () => {
  it('reads "Needs review" with drafts off', () => {
    aiDrafts.off = true;
    renderRow();
    expect(screen.queryByText('AI suggested')).toBeNull();
    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('reads "AI suggested" with drafts on (control)', () => {
    renderRow();
    expect(screen.getByText('AI suggested')).toBeTruthy();
  });
});
