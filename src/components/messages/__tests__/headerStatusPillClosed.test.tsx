import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

/**
 * The status pill in the message-detail header (prod, 2026-09-28): a thread binned as "not customer
 * work" (status `closed`) read RESOLVED, because `closed` derives to the Resolved work status. It is
 * deliberately NOT a resolution — it is missing from the resolved count — so the pill must say what
 * it is, in the same words as the action strip under it.
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
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) }),
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
import { ThemeProvider } from '@/contexts/ThemeContext';

afterEach(cleanup);

const message = (status: string, metadata: Record<string, unknown> = {}): Message =>
  ({
    id: 1,
    publicId: 'SUP-1',
    status,
    channel: 'email',
    sender: 'customer@example.com',
    subject: 'Hello',
    createdAt: '2026-09-27T10:00:00Z',
    resolvedAt: status === 'resolved' ? '2026-09-28T10:00:00Z' : null,
    metadata: { analysis: { category: 'other' }, ...metadata },
  }) as unknown as Message;

const renderHeader = (msg: Message) =>
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MessageDetailHeader
            message={msg}
            showFullPageButton={false}
            isFullPage
            threadCount={1}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

describe('header status pill for a closed thread', () => {
  it('says "Not customer work" for a thread binned as not customer work, not Resolved', () => {
    renderHeader(
      message('closed', { notCustomerWork: { by: 13, at: '2026-09-28T10:00:00Z', reason: null } })
    );
    expect(screen.getAllByText(/^Not customer work$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Resolved$/i)).toBeNull();
  });

  it('says "Closed" for a thread closed any other way', () => {
    renderHeader(message('closed'));
    expect(screen.getAllByText(/^Closed$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Resolved$/i)).toBeNull();
  });

  it('still says Resolved for a resolved thread (control)', () => {
    renderHeader(message('resolved'));
    expect(screen.getAllByText(/^Resolved$/i).length).toBeGreaterThan(0);
  });
});
