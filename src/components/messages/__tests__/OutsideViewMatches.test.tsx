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
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

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

const section = (
  state: FilterState,
  onJump = vi.fn(),
  onOpen = vi.fn(),
  refreshKey = 'r1',
  enabled = true
) => (
  <MemoryRouter>
    <OutsideViewMatches
      filters={state}
      onJump={onJump}
      onOpen={onOpen}
      refreshKey={refreshKey}
      enabled={enabled}
    />
  </MemoryRouter>
);
const renderSection = (state: FilterState, onJump = vi.fn(), onOpen = vi.fn()) =>
  render(section(state, onJump, onOpen));

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

  // Review of #798: a jump MERGES onto the current filters — from the knowledge-base lens or a
  // column chip it kept them and landed on a list without the rows.
  it('a jump clears the lens it lands on top of (knowledge base, column chip, status)', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const onJump = vi.fn();
    renderSection(filters({ showKBOnly: true, columnId: 'open' }), onJump);
    fireEvent.click(await screen.findByRole('button', { name: /Show in Resolved or closed/ }));
    expect(onJump).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'resolved', showKBOnly: false, columnId: 'all' }),
      undefined
    );
  });

  it('drops an answer for a search that has since changed', async () => {
    let answerOld: (value: unknown) => void = () => undefined;
    getThreads
      .mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)))
      .mockResolvedValueOnce(answer([thread(2, 'spam', 'New search row')]));
    const { rerender, container } = render(section(filters({ search: 'old' })));
    rerender(section(filters({ search: 'new' })));
    await screen.findByText('New search row');
    answerOld(answer([thread(1, 'terminal', 'Old search row')]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).not.toContain('Old search row');
  });

  it('asks again when the list rows move (refreshKey), not otherwise', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    rerender(section(state, vi.fn(), vi.fn(), 'r1'));
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
  });

  it('shows nothing for an answer that ran out of time', async () => {
    getThreads.mockResolvedValue({ ...answer([thread(1, 'terminal')]), timedOut: true });
    const { container } = renderSection(filters());
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('a capped total reads "N+", and group counts wait until every match is loaded', async () => {
    getThreads.mockResolvedValue({
      ...answer([thread(1, 'terminal')], 10000),
      pagination: { page: 1, limit: 25, total: 10000, totalPages: 400, totalCapped: true },
    });
    const { container } = renderSection(filters());
    await screen.findByText(/Also found in other views/);
    expect(container.textContent).toContain('10,000+');
    expect(screen.getByRole('heading', { name: 'Resolved or closed' })).toBeTruthy();
  });

  it('names a place a newer backend adds instead of leaving the heading blank', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'somethingNew')]));
    renderSection(filters());
    expect(await screen.findByRole('heading', { name: /Elsewhere/ })).toBeTruthy();
  });

  it('says so when "Show more" fails, and keeps what it has', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'First page row')], 30))
      .mockRejectedValueOnce(new Error('network'));
    renderSection(filters());
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    expect(await screen.findByText(/Could not load more/)).toBeTruthy();
    expect(screen.getByText('First page row')).toBeTruthy();
  });

  // Review of #798: a negated lens ("not awaiting") made the jump "everything except Resolved".
  it('a jump clears a negated lens', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const onJump = vi.fn();
    renderSection(filters({ lifecycle: 'awaiting', negate: 'lifecycle' }), onJump);
    fireEvent.click(await screen.findByRole('button', { name: /Show in Resolved or closed/ }));
    expect(onJump).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'resolved', negate: '' }),
      undefined
    );
  });

  it('a refresh keeps the rows on screen until its answer lands', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Kept row')]));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Kept row');
    getThreads.mockImplementationOnce(() => new Promise(() => undefined));
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    expect(screen.getByText('Kept row')).toBeTruthy();
  });

  it('"Show more" never lists a thread twice', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 3))
      .mockResolvedValueOnce(
        answer([thread(1, 'terminal', 'Row one'), thread(2, 'terminal', 'Row two')], 3)
      );
    renderSection(filters());
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    expect(screen.getAllByText('Row one')).toHaveLength(1);
  });

  // Review of #798 (third): only a negated lifecycle / queue is cleared by a jump.
  it('a jump keeps the agent\'s other negations ("everything except AI state X")', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const onJump = vi.fn();
    renderSection(
      filters({ lifecycle: 'awaiting', aiState: 'needs_review', negate: 'lifecycle,aiState' }),
      onJump
    );
    fireEvent.click(await screen.findByRole('button', { name: /Show in Resolved or closed/ }));
    expect(onJump).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'resolved', negate: 'aiState' }),
      undefined
    );
  });

  it('"Show more" racing a refresh never stays on "Loading…"', async () => {
    let answerMore: (value: unknown) => void = () => undefined;
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'First')], 30))
      .mockImplementationOnce(() => new Promise((resolve) => (answerMore = resolve)))
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'First')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    answerMore(answer([thread(2, 'terminal', 'Second')], 30));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Show more/ })).not.toBeDisabled()
    );
  });

  it('a refresh that fails clears the rows, as one that timed out', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Was here')]))
      .mockRejectedValueOnce(new Error('503'));
    const state = filters();
    const { rerender, container } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Was here');
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('asks nothing while the list itself is loading, then once', async () => {
    getThreads.mockResolvedValue(answer([thread(1, 'terminal')]));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1', false));
    rerender(section(state, vi.fn(), vi.fn(), 'r2', false));
    expect(getThreads).not.toHaveBeenCalled();
    rerender(section(state, vi.fn(), vi.fn(), 'r3', true));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
  });
});
