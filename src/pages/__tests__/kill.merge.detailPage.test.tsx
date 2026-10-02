/**
 * Full-page More → Delete message, the two paths the existing suite (MessageDetailPageDelete.test.tsx,
 * whose harness this copies) does not reach: a double press before the re-render sends ONE
 * DELETE, and a failure with no server reason (a 5xx) toasts the generic line.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  toastError: vi.fn(),
  granted: new Set<string>(['delete_messages']),
  orgCode: 'ACM' as string | undefined,
}));

// The header names a thread by formatConvId(message, orgCode) — the failure toast must too.
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => api.orgCode }));

// DELETE /api/messages/:id takes DELETE_MESSAGES or MANAGE_ORGANIZATION (BE messageRoutes).
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: (permission: string) => api.granted.has(permission) }),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: api.get, delete: api.delete, post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));
vi.mock('@/lib/toast', () => ({
  toast: { error: api.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Stand-in for MessageDetail: its More → Delete message calls the page's onDelete.
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({ onDelete }: { onDelete?: () => void }) => (
    <div>
      <span>detail</span>
      {onDelete && (
        <button type="button" onClick={onDelete}>
          More → Delete message
        </button>
      )}
    </div>
  ),
}));

import { MessageDetailPage } from '@/pages/MessageDetailPage';

// Stands in for browser history: moves the agent while a DELETE is still running.
const GoTo = () => {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/messages/43')}>
        go to message 43
      </button>
      <button type="button" onClick={() => navigate('/elsewhere')}>
        go elsewhere
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        history back
      </button>
    </>
  );
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/messages/42']} future={ROUTER_FUTURE}>
        <GoTo />
        <Routes>
          <Route path="/elsewhere" element={<div data-testid="elsewhere">elsewhere</div>} />
          <Route path="/messages/:id" element={<MessageDetailPage />} />
          <Route path="/messages" element={<div data-testid="inbox">inbox</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidate };
};

const pressDelete = async () =>
  fireEvent.click(await screen.findByRole('button', { name: 'More → Delete message' }));

beforeEach(() => {
  api.get.mockResolvedValue({
    data: {
      success: true,
      data: { id: 42, channel: 'email', sender: 'ada@example.com', subject: 'Order 5' },
    },
  });
  api.delete.mockResolvedValue({ data: { success: true } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  api.granted = new Set(['delete_messages']);
  api.orgCode = 'ACM';
});

describe('MessageDetailPage — delete, beyond the existing suite', () => {
  it('a double press before the re-render sends ONE DELETE', async () => {
    let finish: (value: unknown) => void = () => {};
    api.delete.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderPage();
    await pressDelete();
    const button = screen.getByRole('button', { name: 'Delete' });
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(api.delete).toHaveBeenCalled());
    expect(api.delete).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ data: { success: true } });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('inbox')).toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it('a server error (5xx) toasts the generic line, never its body', async () => {
    api.delete.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Request failed'), {
          isAxiosError: true,
          response: { status: 500, data: { error: 'relation "x" does not exist' } },
        })
      )
    );
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.toastError).toHaveBeenCalledTimes(1));
    expect(api.toastError).toHaveBeenCalledWith('Failed to delete message');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
