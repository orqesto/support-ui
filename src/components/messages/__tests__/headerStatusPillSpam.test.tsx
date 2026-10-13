import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

/**
 * The status pill on a spam thread (staging, 2026-10-13): "Resolve as spam" saved the thread as
 * `filtered` and confirmed, yet the header still read "Open", because `filtered` derives to no work
 * status and the pill fell back to Open. An agent took that to mean the button had not worked.
 * A spam thread has no work status: the pill goes, and the Spam badge says whether a person
 * confirmed it.
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

const message = (status: string, over: Record<string, unknown> = {}): Message =>
  ({
    id: 1,
    publicId: 'SUP-1',
    status,
    channel: 'email',
    sender: 'customer@example.com',
    subject: 'Hello',
    createdAt: '2026-10-11T10:00:00Z',
    metadata: { analysis: { category: 'other' } },
    ...over,
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

describe('header status pill on a spam thread', () => {
  it('⛔ shows no "Open" pill on a thread resolved as spam, and says it was confirmed', () => {
    // RED before: the pill read "Open" here.
    renderHeader(message('filtered', { spamConfirmedAt: '2026-10-13T16:14:31.101Z' }));

    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryAllByText(/^Open$/i)).toHaveLength(0);
    expect(screen.getAllByText('Spam · confirmed').length).toBeGreaterThan(0);
  });

  it('says plain "Spam" while nobody has confirmed it', () => {
    renderHeader(message('filtered', { spamConfirmedAt: null }));

    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.getAllByText(/^Spam$/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Spam · confirmed')).toHaveLength(0);
  });

  it('keeps the pill on a live thread (control)', () => {
    // Without this, a header that dropped the pill everywhere would pass the two cases above.
    renderHeader(message('open'));

    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getAllByText(/^Open$/i).length).toBeGreaterThan(0);
  });
});
