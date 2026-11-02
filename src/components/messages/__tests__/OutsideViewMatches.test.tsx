import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';
import { defaultFilters, type FilterState } from '@/stores/messagesStore';

/**
 * A customer's workspace, 2026-11-02: an address searched under Needs us showed nothing while
 * all 10 matches sat in Resolved and the knowledge base. A searched list now shows the matches
 * the view does not, grouped by where they are, with a way to go there (search kept).
 */

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));

import { OutsideViewMatches } from '../list/OutsideViewMatches';

const thread = (id: number, foundIn?: string, subject = `Order ${id}`): MessageThread =>
  ({
    threadId: `conv_${id}`,
    sender: `customer${id}@shop.example`,
    subject,
    lastMessageAt: new Date().toISOString(),
    foundIn,
    latestMessage: {
      id,
      conversationId: id,
      type: 'inbound',
      subject,
      content: '<p>text</p>',
      channel: 'email',
      status: 'resolved',
      createdAt: new Date().toISOString(),
    },
  }) as unknown as MessageThread;

const answer = (rows: MessageThread[], total = rows.length) => ({
  success: true,
  data: rows,
  pagination: { page: 1, limit: 25, total, totalPages: 1 },
});

const filters = (patch: Partial<FilterState> = {}): FilterState => ({
  ...defaultFilters,
  lifecycle: 'needs_us',
  search: 'someone@shop.example',
  ...patch,
});

const renderSection = (state: FilterState, onJump = vi.fn(), onOpen = vi.fn()) =>
  render(
    <MemoryRouter>
      <OutsideViewMatches filters={state} onJump={onJump} onOpen={onOpen} />
    </MemoryRouter>
  );

beforeEach(() => getThreads.mockReset());
afterEach(cleanup);

describe('OutsideViewMatches', () => {
  it('asks for the view’s own filters with outsideView, and groups the rows by where they are', async () => {
    getThreads.mockResolvedValue(
      answer([thread(1, 'terminal'), thread(2, 'knowledgeBase'), thread(3, 'terminal')])
    );
    const { container } = renderSection(filters());
    await screen.findByText(/Also found in other views/);
    const [apiFilters] = getThreads.mock.calls[0] as [Record<string, string>];
    expect(apiFilters).toMatchObject({ search: 'someone@shop.example', outsideView: '1' });
    expect(container.textContent).toMatch(/Also found in other views\s*3/);
    // One heading per place, with its count — the place is what the agent is looking for.
    expect(screen.getByRole('heading', { name: /Resolved or closed\s*2/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Knowledge base\s*1/ })).toBeTruthy();
  });

  it('goes to the place a group names, keeping the search', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const onJump = vi.fn();
    renderSection(filters(), onJump);
    fireEvent.click(await screen.findByRole('button', { name: /Show in Resolved or closed/ }));
    expect(onJump).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'resolved', search: 'someone@shop.example' }),
      undefined
    );
  });

  it('opens a row like the list does', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal', 'Lost parcel')]));
    const onOpen = vi.fn();
    renderSection(filters(), vi.fn(), onOpen);
    fireEvent.click(await screen.findByText('Lost parcel'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows nothing when nothing matches elsewhere', async () => {
    getThreads.mockResolvedValue(answer([]));
    const { container } = renderSection(filters());
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('asks nothing and shows nothing without a search', () => {
    const { container } = renderSection(filters({ search: '' }));
    expect(getThreads).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  // FE deploys on merge, the backend on a tag: a backend without `outsideView` ignores it and
  // answers the VIEW's own rows. Shown here, they would be listed twice, labelled "elsewhere".
  it('shows nothing when the backend did not answer outsideView (rows without foundIn)', async () => {
    getThreads.mockResolvedValue(answer([thread(1), thread(2)]));
    const { container } = renderSection(filters());
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
