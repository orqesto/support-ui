import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Needs Routing lines its selects up with what sits beside them (staging visual check,
 * 2026-10-08): the filter row's selects are 40px like its search box; the per-row "Route to"
 * select is 32px inside its table row, beside the row's small buttons.
 */
const sourceFilterSize = vi.hoisted(() => ({ value: undefined as string | undefined }));
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
  MessageSourceFilter: ({ size }: { size?: string }) => {
    sourceFilterSize.value = size;
    return null;
  },
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { NeedsRoutingPage } from '../NeedsRoutingPage';

const heightOf = (combobox: HTMLElement) =>
  getComputedStyle(combobox.closest('.select__control') as HTMLElement).height;

describe('Needs Routing — selects match the controls beside them', () => {
  it('filter row at 40px (the search box), the table-row "Route to" at 32px', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NeedsRoutingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findAllByRole('button', { name: 'Resolve & move to spam' });
    expect(sourceFilterSize.value).toBe('md');
    expect(heightOf(screen.getByRole('combobox', { name: 'Sort messages' }))).toBe('2.5rem');
    const inTableRow = screen
      .getAllByRole('combobox', { name: 'Department to route to' })
      .filter((box) => box.closest('td'));
    expect(inTableRow).toHaveLength(1);
    expect(heightOf(inTableRow[0])).toBe('2rem');
  });
});
