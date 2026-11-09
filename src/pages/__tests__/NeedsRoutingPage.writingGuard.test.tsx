import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';
import type { User } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import type * as MessagesFeature from '@/features/messages';
import { usePresenceSummaryStore } from '@/features/messages';

/**
 * Thread presence (spec §5.5) on Needs Routing: a move to a team and "Resolve & move to spam" ask
 * first while a colleague writes a reply on the thread (from the list's presence summary).
 */
const calls = vi.hoisted(() => ({ route: [] as unknown[][], classify: [] as unknown[][] }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    classify: (...args: unknown[]) => {
      calls.classify.push(args);
      return Promise.resolve({ success: true });
    },
    manualRoute: (...args: unknown[]) => {
      calls.route.push(args);
      return Promise.resolve({ learningRecorded: false });
    },
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
vi.mock('@/components/shared/MessageSourceFilter', () => ({
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
// The snapshot subscription itself is tested in usePresenceSummary.test; here the store is set.
vi.mock('@/features/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof MessagesFeature>()),
  usePresenceSummary: () => {},
}));

import { NeedsRoutingPage } from '../NeedsRoutingPage';

const renderPage = () => {
  const client = new QueryClient();
  client.setQueryData(
    ['organization-members', 1],
    [{ id: 1, userId: 7, firstName: 'Anna', lastName: null, email: 'a@x.example' }]
  );
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NeedsRoutingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};
const writing = (on: boolean) => {
  const store = usePresenceSummaryStore.getState();
  store.reset();
  store.applySnapshot(on ? { 77: [{ userId: 7, state: 'writing_reply' }] } : {});
  store.setAvailable(true);
};
const routeFirst = async () => {
  const [select] = await screen.findAllByRole('combobox', { name: 'Team to route to' });
  await chooseOption(select, 'Support');
  fireEvent.click(screen.getAllByRole('button', { name: 'Route to the selected team' })[0]);
};
const spamFirst = async () => {
  const [button] = await screen.findAllByRole('button', { name: 'Resolve & move to spam' });
  fireEvent.click(button);
};

beforeEach(() => {
  calls.route = [];
  calls.classify = [];
  useAuthStore.setState({ user: { id: 1 } as User, selectedOrganizationId: 1 });
});

describe('Needs Routing — asks before acting while a colleague writes a reply', () => {
  it('route: a writer ⇒ asks; nothing routed until "Move anyway"', async () => {
    writing(true);
    renderPage();
    await routeFirst();
    expect(await screen.findByText('Anna is writing a reply — move anyway?')).toBeInTheDocument();
    expect(calls.route).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Move anyway' }));
    await waitFor(() => expect(calls.route).toEqual([[77, 3]]));
  });

  it('route: nobody writing ⇒ routes at once', async () => {
    writing(false);
    renderPage();
    await routeFirst();
    await waitFor(() => expect(calls.route).toEqual([[77, 3]]));
    expect(screen.queryByText(/is writing a reply/)).toBeNull();
  });

  it('spam: a writer ⇒ asks; cancel sends nothing', async () => {
    writing(true);
    renderPage();
    await spamFirst();
    expect(
      await screen.findByText('Anna is writing a reply — mark as spam anyway?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls.classify).toHaveLength(0);
  });

  it('spam: nobody writing ⇒ classifies at once', async () => {
    writing(false);
    renderPage();
    await spamFirst();
    await waitFor(() => expect(calls.classify).toHaveLength(1));
  });
});
