import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MessageThread } from '@/services/message.service';

/**
 * Both inbox cards return nothing for a thread with no message yet. The drafts-off hook must sit
 * ABOVE that return: called after it, a card whose message arrives on a later render asks React
 * for more hooks than its first render made ("Rendered more hooks than during the previous
 * render") and the inbox crashes. Uses the REAL hook — a mocked one calls no React hooks, so
 * hook order could not matter and the test would pass on the broken code.
 */

vi.mock('@/services/organization.service', () => ({
  organizationService: { getAiDrafts: () => Promise.resolve({ off: false }) },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select?: (state: unknown) => unknown) =>
    select ? select({ selectedOrganizationId: 1, user: { organizationId: 1 } }) : null,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { KanbanCard } from '../KanbanCard';
import { MessageListItem } from '../MessageListItem';

afterEach(cleanup);

const withMessage = {
  threadId: 'conv_1',
  publicId: 'COR-SUP-1',
  sender: 'a@b.example',
  subject: 'Hi',
  status: 'open',
  priority: 'medium',
  lastMessageAt: new Date().toISOString(),
  latestMessage: {
    id: 1,
    conversationId: 1,
    type: 'inbound',
    content: 'hello',
    channel: 'email',
    createdAt: new Date().toISOString(),
    metadata: {},
  },
} as unknown as MessageThread;
const empty = { ...withMessage, latestMessage: undefined } as unknown as MessageThread;

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (qc: QueryClient, node: ReactNode) => (
  <QueryClientProvider client={qc}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

describe('inbox cards — hook order', () => {
  it('KanbanCard survives a thread that gains its message on a later render', () => {
    const qc = client();
    const { rerender } = render(wrap(qc, <KanbanCard thread={empty} onOpen={() => {}} />));
    expect(() =>
      rerender(wrap(qc, <KanbanCard thread={withMessage} onOpen={() => {}} />))
    ).not.toThrow();
  });

  it('MessageListItem survives a thread that gains its message on a later render', () => {
    const qc = client();
    const { rerender } = render(wrap(qc, <MessageListItem thread={empty} onOpen={() => {}} />));
    expect(() =>
      rerender(wrap(qc, <MessageListItem thread={withMessage} onOpen={() => {}} />))
    ).not.toThrow();
  });
});
