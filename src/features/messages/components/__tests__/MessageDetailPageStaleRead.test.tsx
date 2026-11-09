/**
 * The full thread page (phone) stays mounted across history Back/Forward, so a read asked for the
 * previous route can land after the agent moved on. It must not replace the thread now on screen,
 * nor end the new thread's loading state.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACM' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: api.get, delete: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));
vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Stand-in for MessageDetail: shows which thread the page handed it.
vi.mock('@/features/messages/components/MessageDetail', () => ({
  MessageDetail: ({ message }: { message: { id: number; subject: string } }) => (
    <div data-testid="detail">{message.subject}</div>
  ),
}));

import { MessageDetailPage } from '@/pages/MessageDetailPage';

const record = (id: number) => ({
  data: {
    success: true,
    data: { id, channel: 'email', sender: `c${id}@example.com`, subject: `Thread ${id}` },
  },
});

/** Each read waits until the test answers it, by thread id. */
const answers = new Map<number, (value: unknown) => void>();
const answer = async (id: number) => {
  await act(async () => {
    answers.get(id)?.(record(id));
    await Promise.resolve();
  });
};

const GoTo = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/threads/43')}>
      go to 43
    </button>
  );
};

const renderPage = () => {
  api.get.mockImplementation(
    (url: string) =>
      new Promise((resolve) => {
        answers.set(Number(url.split('/').pop()), resolve);
      })
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/threads/42']} future={ROUTER_FUTURE}>
        <GoTo />
        <Routes>
          <Route path="/threads/:id" element={<MessageDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  answers.clear();
});

describe('MessageDetailPage — a read for the previous route', () => {
  it('CONTROL: a read for the route on screen shows its thread', async () => {
    renderPage();
    await answer(42);
    expect(screen.getByTestId('detail')).toHaveTextContent('Thread 42');
  });

  it('42 answers after the agent moved to 43 (already loaded): 43 stays on screen', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'go to 43' }));
    await answer(43);
    expect(screen.getByTestId('detail')).toHaveTextContent('Thread 43');
    await answer(42);
    expect(screen.getByTestId('detail')).toHaveTextContent('Thread 43');
  });

  it('42 answers while 43 is still loading: 43 keeps loading, 42 is not shown', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'go to 43' }));
    await answer(42);
    expect(screen.queryByTestId('detail')).toBeNull();
    expect(screen.getByText('Loading thread...')).toBeInTheDocument();
    await answer(43);
    expect(screen.getByTestId('detail')).toHaveTextContent('Thread 43');
  });
});
