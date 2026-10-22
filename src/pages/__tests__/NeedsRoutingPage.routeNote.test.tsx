import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';

const route = vi.hoisted(() => ({ calls: [] as unknown[][], learningRecorded: true }));
const toastInfo = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@/services/message.service', () => ({
  messageService: {
    classify: () => Promise.resolve({ success: true }),
    manualRoute: (...args: unknown[]) => {
      route.calls.push(args);
      return Promise.resolve({ learningRecorded: route.learningRecorded });
    },
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo.calls.push(args),
    success: () => {},
    failure: () => {},
  },
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () =>
      Promise.resolve({
        data: {
          success: true,
          data: [
            {
              id: 77,
              subject: 'Pallet label missing',
              sender: 'buyer@shop.example',
              createdAt: '2026-10-14T10:00:00Z',
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
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 3, name: 'Support', active: true }] }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { NeedsRoutingPage } from '../NeedsRoutingPage';
import { ROUTE_LEARNING_NOTE } from '@/lib/routingCopy';

const renderPage = (client = new QueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NeedsRoutingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const routeFirst = async () => {
  const [select] = await screen.findAllByRole('combobox', { name: 'Team to route to' });
  await chooseOption(select, 'Support');
  fireEvent.click(screen.getAllByRole('button', { name: 'Route to the selected team' })[0]);
};

beforeEach(() => {
  route.calls = [];
  route.learningRecorded = true;
  toastInfo.calls = [];
});

describe('Needs Routing — every route counts', () => {
  it('has no "Create routing rule" checkbox', async () => {
    renderPage();
    await screen.findAllByRole('combobox', { name: 'Team to route to' });
    expect(screen.queryByText('Create routing rule')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('routes with (id, departmentId) only and shows the note when learning was recorded', async () => {
    renderPage();
    await routeFirst();
    await waitFor(() => expect(route.calls).toEqual([[77, 3]]));
    await waitFor(() => expect(toastInfo.calls).toEqual([[ROUTE_LEARNING_NOTE]]));
  });

  it('no note when the backend did not record learning (older backend)', async () => {
    route.learningRecorded = false;
    renderPage();
    await routeFirst();
    await waitFor(() => expect(route.calls).toHaveLength(1));
    // Let handleRoute finish past the awaited manualRoute before asserting the absence.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Route to the selected team' })).toBeNull()
    );
    expect(toastInfo.calls).toHaveLength(0);
  });

  it('refreshes the Needs Routing badge counts after a route (the key the badge reads)', async () => {
    const client = new QueryClient();
    const invalidated: unknown[] = [];
    const original = client.invalidateQueries.bind(client);
    client.invalidateQueries = ((filters?: { queryKey?: unknown }) => {
      invalidated.push(filters?.queryKey);
      return original(filters as never);
    }) as typeof client.invalidateQueries;
    renderPage(client);
    await routeFirst();
    await waitFor(() => expect(invalidated).toContainEqual(['notification-counts']));
  });

  it('refreshes the badge counts after "Resolve & move to spam" too', async () => {
    const client = new QueryClient();
    const invalidated: unknown[] = [];
    const original = client.invalidateQueries.bind(client);
    client.invalidateQueries = ((filters?: { queryKey?: unknown }) => {
      invalidated.push(filters?.queryKey);
      return original(filters as never);
    }) as typeof client.invalidateQueries;
    renderPage(client);
    const [spam] = await screen.findAllByRole('button', { name: 'Resolve & move to spam' });
    fireEvent.click(spam);
    await waitFor(() => expect(invalidated).toContainEqual(['notification-counts']));
  });
});
