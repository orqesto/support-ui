/**
 * Console → Maintenance: the read-only "Senders with an address hidden in the name" Check (BE
 * `POST /api/system/spoofed-sender-report`, R2-SEC) shows ITS result — not the lost-attachments
 * wording every other paged repair gets. Real page and service over a mocked transport.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformSyncCheckpoints: () => ({ isLoading: false, data: [] }),
  useClearSyncCheckpoints: () => ({ mutateAsync: vi.fn() }),
  usePlatformWorkspaces: () => ({
    isLoading: false,
    data: { data: [{ id: 12, name: 'Example Workspace' }] },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlatformMaintenance } from '../PlatformMaintenance';

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformMaintenance />
    </QueryClientProvider>
  );

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation((url: string) =>
    url === '/api/system/maintenance'
      ? Promise.resolve({
          data: { data: { jobs: [], repairs: { allowed: true, source: 'console' } } },
        })
      : Promise.resolve({ data: { data: {} } })
  );
});
afterEach(cleanup);

describe('PlatformMaintenance — spoofed sender report', () => {
  const ID = 'repair-spoofed-sender-report';
  const pick = async () => {
    renderPage();
    await screen.findByTestId(ID);
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    return screen.getByTestId(ID);
  };
  const result = (over: Record<string, unknown>) => ({
    data: {
      data: {
        scannedFromEventId: 101,
        scannedToEventId: 20100,
        rowsRead: 579,
        authorEmails: 0,
        requesterEmails: 0,
        samples: [],
        nextAfterEventId: 20100,
        moreRemaining: false,
        ...over,
      },
    },
  });

  it('says what it read and that nothing is misread — never the lost-attachments wording', async () => {
    api.post.mockResolvedValue(result({}));
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(await within(row).findByText('Checked 579 messages.')).toBeTruthy();
    expect(within(row).getByText('No stored sender is read wrongly.')).toBeTruthy();
    expect(within(row).queryByText(/attachment/)).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('lists what a plain read gets wrong, and says when more remains', async () => {
    api.post.mockResolvedValue(
      result({
        authorEmails: 1,
        requesterEmails: 1,
        moreRemaining: true,
        samples: [
          {
            eventId: 7,
            conversationId: 3,
            column: 'author_email',
            naive: 'ceo@company.example',
            actual: 'someone@other.example',
          },
        ],
      })
    );
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(
      await within(row).findByText('1 message sender and 1 thread requester are read wrongly.')
    ).toBeTruthy();
    expect(
      within(row).getByText(
        'Message 7 (thread 3): read as ceo@company.example, really someone@other.example'
      )
    ).toBeTruthy();
    expect(within(row).getByText('More remains: check the next batch.')).toBeTruthy();
    for (const raw of ['authorEmails', 'moreRemaining', 'nextAfterEventId'])
      expect(within(row).queryByText(raw)).toBeNull();
  });
});
