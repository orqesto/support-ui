/**
 * Full-page More → Delete message really deletes (it once only navigated back): it opens the
 * slide-over's confirm, deletes, and goes back to the inbox; a
 * failure says the server's reason and stays on the page.
 *
 * The delete is checked at the REQUEST: the real messageService over a mocked apiClient, so a
 * wrong id or route fails here rather than in production.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
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
import { useMessagesStore } from '@/stores/messagesStore';

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

describe('MessageDetailPage — More → Delete message', () => {
  it('asks first: the confirm opens, nothing is deleted, the page stays', async () => {
    renderPage();
    await pressDelete();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete message');
    expect(dialog).toHaveTextContent('From: ada@example.com');
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('inbox')).toBeNull();
  });

  it('Cancel: nothing deleted, still on the page', async () => {
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'More → Delete message' })).toBeInTheDocument();
  });

  it('Delete: DELETE /api/messages/42, the inbox cache cleared, back to the inbox', async () => {
    useMessagesStore
      .getState()
      .setMessages(
        [],
        { page: 1, limit: 20, total: 1, totalPages: 1 } as never,
        undefined as never,
        'stale-page'
      );
    expect(useMessagesStore.getState().getCached('stale-page')).toBeTruthy();
    const { invalidate } = renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('inbox')).toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/api/messages/42');
    expect(useMessagesStore.getState().getCached('stale-page')).toBeFalsy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['needs-routing-count'] });
    expect(api.toastError).not.toHaveBeenCalled();
  });

  it('a refused delete: the server’s reason is toasted, the page and dialog stay', async () => {
    api.delete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: 'You cannot delete messages in this department' } },
    });
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.toastError).toHaveBeenCalledTimes(1));
    expect(api.toastError.mock.calls[0][0]).toBe('You cannot delete messages in this department');
    expect(screen.queryByTestId('inbox')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Retry is possible: Delete is enabled again.
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });

  it('⛔ while the delete is in flight, Esc / X / backdrop / Cancel cannot close it, and only ONE DELETE goes out', async () => {
    let finish: (value: unknown) => void = () => {};
    api.delete.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The confirm button is busy (spinner, disabled): no second press reaches it.
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    expect(buttons.filter((button) => (button as HTMLButtonElement).disabled)).toHaveLength(2);
    expect(api.delete).toHaveBeenCalledTimes(1);
    finish({ data: { success: true } });
    await waitFor(() => expect(screen.getByTestId('inbox')).toBeInTheDocument());
    expect(api.delete).toHaveBeenCalledTimes(1);
  });

  it('history Back to ANOTHER message mid-delete: the old delete landing does not navigate away', async () => {
    let finish: (value: unknown) => void = () => {};
    api.delete.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    // Message 43's read is still in flight when 42's DELETE lands, so the page still holds
    // message 42 in state — the case a guard keyed on the loaded message gets wrong.
    api.get.mockImplementation((url: string) =>
      url.endsWith('/43')
        ? new Promise(() => {})
        : Promise.resolve({
            data: {
              success: true,
              data: { id: 42, channel: 'email', sender: 'ada@example.com', subject: 'Order 5' },
            },
          })
    );
    const { invalidate } = renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'go to message 43' }));
    await screen.findByText('Loading message...');
    finish({ data: { success: true } });
    // The delete's own side effects still happen …
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['needs-routing-count'] })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // … but the agent stays where they went.
    expect(screen.queryByTestId('inbox')).toBeNull();
    expect(screen.getByText('Loading message...')).toBeInTheDocument();
  });

  it('left the page mid-delete: the delete landing does not navigate them to the inbox', async () => {
    let finish: (value: unknown) => void = () => {};
    api.delete.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'go elsewhere' }));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
    finish({ data: { success: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('inbox')).toBeNull();
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
  });

  it('history Back to ANOTHER message mid-delete: its confirm is its own (not busy), and the first failure names the first message', async () => {
    let fail: (reason: unknown) => void = () => {};
    api.delete.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      })
    );
    api.get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data: url.endsWith('/43')
            ? { id: 43, channel: 'email', sender: 'bob@example.com', subject: 'Order 6' }
            : {
                id: 42,
                publicId: 'SUP-42',
                channel: 'email',
                sender: 'ada@example.com',
                subject: 'Order 5',
              },
        },
      })
    );
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'go to message 43' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/43$/)));
    await pressDelete();
    const dialog = await screen.findByRole('dialog');
    // Message 43's confirm: nothing of 42's in-flight delete leaks into it.
    expect(within(dialog).getByRole('button', { name: 'Delete' })).not.toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    // …and it can be confirmed while 42's request still runs: 43 gets its own DELETE.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/43'));
    fail({
      isAxiosError: true,
      response: { status: 403, data: { error: 'Not in your department' } },
    });
    await waitFor(() => expect(api.toastError).toHaveBeenCalledTimes(1));
    // Named as the header names it (formatConvId with the org code), not the bare publicId.
    expect(api.toastError).toHaveBeenCalledWith(
      'ACM-SUP-42 was not deleted: Not in your department'
    );
  });

  const twoMessages = () =>
    api.get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data: url.endsWith('/43')
            ? { id: 43, channel: 'email', sender: 'bob@example.com', subject: 'Order 6' }
            : { id: 42, channel: 'email', sender: 'ada@example.com', subject: 'Order 5' },
        },
      })
    );
  const hangingDelete = () => {
    const settle: { resolve: (value: unknown) => void; reject: (reason: unknown) => void } = {
      resolve: () => {},
      reject: () => {},
    };
    api.delete.mockReturnValueOnce(
      new Promise((resolve, reject) => {
        settle.resolve = resolve;
        settle.reject = reject;
      })
    );
    return settle;
  };

  it('⛔ 42 hangs → 43 hangs → Back to 42: 42’s confirm is still busy and no second DELETE /42 goes out', async () => {
    twoMessages();
    hangingDelete();
    hangingDelete();
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/42'));
    fireEvent.click(screen.getByRole('button', { name: 'go to message 43' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/43$/)));
    await pressDelete();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    );
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/43'));
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    await pressDelete();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('From: ada@example.com');
    // 42's request still runs: its confirm shows it (busy), so it cannot be sent again.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const footer = within(dialog).getAllByRole('button');
    fireEvent.click(footer[footer.length - 1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.delete.mock.calls.filter(([url]) => url === '/api/messages/42')).toHaveLength(1);
    expect(api.delete).toHaveBeenCalledTimes(2);
  });

  it('42 fails while 43 is still deleting: 43’s confirm stays busy (each request clears only its own id)', async () => {
    twoMessages();
    const first = hangingDelete();
    hangingDelete();
    renderPage();
    await pressDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/42'));
    fireEvent.click(screen.getByRole('button', { name: 'go to message 43' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/43$/)));
    await pressDelete();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/messages/43'));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    first.reject({ isAxiosError: true, response: { status: 403, data: { error: 'Nope' } } });
    await waitFor(() => expect(api.toastError).toHaveBeenCalledTimes(1));
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    ).toBeDisabled();
    expect(api.delete).toHaveBeenCalledTimes(2);
  });

  it('a confirm left open on 42, then history moves to 43: 43 loads with NO confirm open, nothing deleted', async () => {
    twoMessages();
    renderPage();
    await pressDelete();
    expect(screen.getByRole('dialog')).toHaveTextContent('From: ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'go to message 43' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/43$/)));
    await waitFor(() => expect(screen.queryByText('Loading message...')).toBeNull());
    // CONTROL for the absence below: message 43's page is up.
    expect(screen.getByRole('button', { name: 'More → Delete message' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('a viewer without DELETE_MESSAGES or MANAGE_ORGANIZATION is not offered Delete', async () => {
    api.granted = new Set(['view_messages']);
    renderPage();
    await screen.findByText('detail');
    expect(screen.queryByRole('button', { name: 'More → Delete message' })).toBeNull();
  });

  it('MANAGE_ORGANIZATION alone is enough (an org admin)', async () => {
    api.granted = new Set(['manage_organization']);
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'More → Delete message' })
    ).toBeInTheDocument();
  });
});
