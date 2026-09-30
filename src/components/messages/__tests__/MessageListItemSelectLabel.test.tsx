import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * The row's select box is named after the customer, like the row itself. The address lives on
 * the THREAD row; `latestMessage` carries no sender, so the label read "…from undefined".
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

describe('MessageListItem — select box name', () => {
  it('names the customer from the thread row', () => {
    render(
      <MemoryRouter>
        <MessageListItem
          thread={row()}
          onOpen={() => {}}
          selected={false}
          onToggleSelected={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('checkbox', { name: 'Select message from a@b.example' })).toBeTruthy();
  });
});
