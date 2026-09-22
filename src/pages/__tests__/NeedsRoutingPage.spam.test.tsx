import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Needs Routing's spam action is a PERSON's decision, so it records CONFIRMED spam (owner,
 * 2026-09-22: what our filters bin is unconfirmed; an agent resolving as spam confirms it).
 */
const classify = vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
  success: true,
});

vi.mock('@/services/message.service', () => ({
  messageService: {
    classify: (...args: unknown[]): Promise<unknown> => classify(...args),
    manualRoute: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 77,
            subject: 'Win a prize',
            sender: 'x@spam.example',
            createdAt: '2026-09-22T10:00:00Z',
            metadata: {},
          },
        ],
        pagination: { total: 1 },
      },
    }),
  },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/routing/RoutingBarScorecard', () => ({ RoutingBarScorecard: () => null }));
vi.mock('@/components/messages/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  MessageSourceFilter: () => null,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { NeedsRoutingPage } from '../NeedsRoutingPage';

beforeEach(() => classify.mockClear());

describe('Needs Routing — Resolve & move to spam', () => {
  it('is labelled as a resolve and sends move_to_spam WITH confirm', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NeedsRoutingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const [button] = await screen.findAllByRole('button', { name: 'Resolve & move to spam' });
    fireEvent.click(button);
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1));
    expect(classify).toHaveBeenCalledWith(77, 'move_to_spam', undefined, undefined, true);
  });
});
