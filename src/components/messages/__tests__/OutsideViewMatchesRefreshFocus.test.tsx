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

import { OutsideViewMatches, REFRESH_MIN_MS } from '../list/OutsideViewMatches';

const REFRESH = 'Refresh matches in other views';

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
  outsideView: true,
  data: rows,
  pagination: { page: 1, limit: 25, total, totalPages: 1 },
});

/** Moves the clock past the refresh window, so the next `refreshKey` move asks at once. */
let clockOffset = 0;
const realNow = Date.now.bind(Date);
let clockSpy: { mockRestore: () => void } | null = null;
const afterRefreshWindow = () => {
  clockOffset += REFRESH_MIN_MS + 1;
  clockSpy ??= vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset);
};

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

// A block body: vitest runs a function RETURNED from beforeEach as a teardown, and `mockReset()`
// returns the mock — so it called getThreads() after each test (hung on a never-settling answer).
beforeEach(() => {
  getThreads.mockReset();
});
afterEach(() => {
  cleanup();
  clockSpy?.mockRestore();
  clockSpy = null;
  clockOffset = 0;
});

describe('OutsideViewMatches — Refresh keeps focus and says what came back', () => {
  it('🔴 Refresh keeps keyboard focus in the section (round-17 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 1));
    render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    const refresh = screen.getByRole('button', { name: REFRESH });
    refresh.focus();
    // What the root holds at the moment it takes focus — what a screen reader starts reading.
    const group = screen.getByRole('region', { name: 'Also found in other views' });
    let readOnFocus = '';
    group.addEventListener('focus', () => {
      readOnFocus = group.textContent ?? '';
    });
    fireEvent.click(refresh);
    // Focus lands once the section shows "Checking…" — not while it still holds the old rows.
    expect(document.activeElement).toBe(group);
    expect(readOnFocus).toMatch(/Checking other views/);
    expect(readOnFocus).not.toMatch(/Old two/);
    await screen.findByText('Fresh one');
    expect(document.activeElement).toBe(group);
    expect(group).toBe(screen.getByRole('region', { name: 'Also found in other views' }));
  });

  /** Pages once, then presses Refresh (focused, as from the keyboard); returns the section root. */
  const pageThenRefresh = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    const root = screen.getByRole('region', { name: 'Also found in other views' });
    const refresh = screen.getByRole('button', { name: REFRESH });
    refresh.focus();
    fireEvent.click(refresh);
    return root;
  };
  const NOTHING = 'No matches in other views for this search now.';

  it('🔴 Refresh keeps focus when the fresh answer has nothing elsewhere, and says so (round-18 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0));
    render(section(filters()));
    const root = await pageThenRefresh();
    await screen.findByText(NOTHING);
    expect(document.activeElement).toBe(root);
    // Rendered inside the focusable root (not a bare div React reused in its place).
    expect(screen.getByText(NOTHING).closest('[tabindex="-1"]')).toBe(root);
  });

  const olderBackend = { success: true, data: [], pagination: { page: 1, limit: 25, total: 0 } };

  it('🔴 a Refresh answered by an older backend keeps focus and says it could not check (round-20 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(olderBackend);
    render(section(filters()));
    const root = await pageThenRefresh();
    await screen.findByText(/could not be checked/);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 an older backend\'s answer after Refresh found nothing removes the "no matches" line (round-20 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0))
      .mockResolvedValueOnce(olderBackend);
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(NOTHING);
    // Focus elsewhere: the answer is not owed, so only the clear can remove the line.
    (document.activeElement as HTMLElement).blur();
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.queryByText(NOTHING)).toBeNull());
  });

  it('🔴 a search changed while a Refresh is out does not say "no matches" for the new one (round-20 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(answer([], 0));
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(/Checking other views/);
    (document.activeElement as HTMLElement).blur(); // typing the new search moves focus away
    rerender(section(filters({ search: 'other@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.queryByText(/Checking other views/)).toBeNull());
    expect(screen.queryByText(NOTHING)).toBeNull();
  });

  it('🔴 a Refresh that fails, then retries to nothing, still says so (round-19 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(answer([], 0));
    const { rerender } = render(section(filters()));
    const root = await pageThenRefresh();
    await screen.findByText(/could not be checked/);
    expect(document.activeElement).toBe(root);
    // Past the failed-retry window (FAILED_RETRY_MS = 4 refresh windows).
    for (let windows = 0; windows < 5; windows += 1) afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await screen.findByText(NOTHING);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 after Refresh found nothing, a list move re-asks without "Checking…" and keeps the line', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0))
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(NOTHING);
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    expect(screen.queryByText(/Checking other views/)).toBeNull();
    expect(screen.getByText(NOTHING)).toBeTruthy();
  });

  it('🔴 a new search after Refresh found nothing says nothing when it finds nothing either', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0))
      .mockResolvedValueOnce(answer([], 0));
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(NOTHING);
    (document.activeElement as HTMLElement).blur(); // typing the new search moves focus away
    rerender(section(filters({ search: 'other@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.queryByText(/Checking other views/)).toBeNull());
    expect(screen.queryByText(NOTHING)).toBeNull();
  });

  /** Refresh answered with matches; the list then moves and is re-asked (answer: `next`). */
  const refreshWithMatchesThenMove = async (next: unknown, blur: boolean) => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 1))
      .mockResolvedValueOnce(next);
    const { rerender } = render(section(filters()));
    const root = await pageThenRefresh();
    await screen.findByText('Fresh one');
    if (blur) (document.activeElement as HTMLElement).blur();
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.queryByText('Fresh one')).toBeNull());
    return root;
  };

  it('🔴 focus still in the section when a later re-ask finds nothing: kept, and said (round-21 review)', async () => {
    const root = await refreshWithMatchesThenMove(answer([], 0), false);
    await screen.findByText(NOTHING);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 …and an older backend answering that re-ask keeps focus too, as a failed check (round-21 review)', async () => {
    const root = await refreshWithMatchesThenMove(olderBackend, false);
    await screen.findByText(/could not be checked/);
    expect(document.activeElement).toBe(root);
  });

  /** Page 1 with Show more; keyboard focus on `button`; the list moves; re-asked with `next`. */
  const focusInsideThenMove = async (button: RegExp, next: () => Promise<unknown>) => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockImplementationOnce(next);
    const { rerender } = render(section(filters()));
    const control = await screen.findByRole('button', { name: button });
    const root = screen.getByRole('region', { name: 'Also found in other views' });
    control.focus();
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    return root;
  };

  it('🔴 focus on Show more when a re-ask finds nothing moves to the section root (round-22 review)', async () => {
    const root = await focusInsideThenMove(/Show more/, () => Promise.resolve(answer([], 0)));
    await screen.findByText(NOTHING);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 focus on a jump button when an older backend answers moves to the root (round-22 review)', async () => {
    const root = await focusInsideThenMove(/Show in that view/, () =>
      Promise.resolve(olderBackend)
    );
    await screen.findByText(/could not be checked/);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 focus on Show more when a re-ask fails moves to the root (round-22 review)', async () => {
    const root = await focusInsideThenMove(/Show more/, () => Promise.reject(new Error('network')));
    await screen.findByText(/could not be checked/);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 a dropped answer leaves no focus pull behind for a later render (round-23 review)', async () => {
    let answerReAsk = (_value: unknown) => {};
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockReturnValueOnce(new Promise((done) => (answerReAsk = done)))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30));
    const { rerender } = render(section(filters()));
    await screen.findByText('Old one');
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2')); // an automatic re-ask goes out
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    const more = screen.getByRole('button', { name: /Show more/ });
    more.focus();
    fireEvent.click(more);
    await screen.findByText('Old two'); // page 2 lands: the re-ask is overtaken
    answerReAsk(answer([], 0)); // …and dropped, with focus still inside
    await new Promise((done) => setTimeout(done, 0));
    (document.activeElement as HTMLElement).blur(); // the agent clicks elsewhere
    rerender(section(filters(), undefined, undefined, 'r3')); // any later render
    await new Promise((done) => setTimeout(done, 0));
    expect(document.activeElement).toBe(document.body);
  });

  it('🔴 a Refresh the agent left before it answered still says nothing was found (round-23 review)', async () => {
    let answerRefresh = (_value: unknown) => {};
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockReturnValueOnce(new Promise((done) => (answerRefresh = done)));
    render(section(filters()));
    const root = await pageThenRefresh();
    expect(root.className).toContain('mt-4'); // the root carries the section's top margin
    await screen.findByText(/Checking other views/);
    (document.activeElement as HTMLElement).blur(); // focus leaves before the answer
    answerRefresh(answer([], 0));
    await screen.findByText(NOTHING);
  });

  it('🔴 focus inside when the search changes moves to the root, shown as Checking… (round-23 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    const jump = await screen.findByRole('button', { name: /Show in that view/ });
    const root = screen.getByRole('region', { name: 'Also found in other views' });
    jump.focus();
    rerender(section(filters({ search: 'two@shop.example' })));
    await screen.findByText(/Checking other views/);
    expect(document.activeElement).toBe(root);
  });

  it('[control] focus elsewhere when the search changes stays where it is', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([], 0));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    await screen.findByText('Old one');
    rerender(section(filters({ search: 'two@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Checking other views/)).toBeNull());
    expect(document.activeElement).toBe(document.body);
    expect(screen.queryByText(NOTHING)).toBeNull();
  });

  it('[control] a search changed while the list is still loading shows nothing yet (focus elsewhere)', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    await screen.findByText('Old one');
    rerender(section(filters({ search: 'two@shop.example' }), undefined, undefined, 'r1', false));
    await waitFor(() => expect(screen.queryByText('Old one')).toBeNull());
    expect(screen.queryByText(/Checking other views/)).toBeNull();
    expect(getThreads).toHaveBeenCalledTimes(1);
  });

  it('🔴 the last Show more, pressed from the keyboard, leaves focus on the root (round-24 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 2))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 2));
    render(section(filters()));
    const more = await screen.findByRole('button', { name: /Show more/ });
    more.focus();
    fireEvent.click(more);
    await screen.findByText('Old two');
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Also found in other views' })
    );
  });

  it('🔴 back on a search that failed a moment ago: "could not be checked", not silence (round-24 review)', async () => {
    getThreads
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Other one')], 1));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    await screen.findByText(/could not be checked/);
    rerender(section(filters({ search: 'two@shop.example' })));
    await screen.findByText('Other one');
    rerender(section(filters({ search: 'one@shop.example' })));
    await screen.findByText(/could not be checked/);
    expect(getThreads).toHaveBeenCalledTimes(2); // not asked again inside its retry window
  });

  it('🔴 focus inside when the search changes while the list re-reads: root kept, Checking… (round-24 review)', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    const jump = await screen.findByRole('button', { name: /Show in that view/ });
    const root = screen.getByRole('region', { name: 'Also found in other views' });
    jump.focus();
    rerender(section(filters({ search: 'two@shop.example' }), undefined, undefined, 'r1', false));
    await screen.findByText(/Checking other views/);
    expect(document.activeElement).toBe(root);
  });

  it('🔴 a dropped FAILURE leaves no focus pull behind either (round-24 review)', async () => {
    let failReAsk = (_reason: unknown) => {};
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockReturnValueOnce(new Promise((_done, fail) => (failReAsk = fail)))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30));
    const { rerender } = render(section(filters()));
    await screen.findByText('Old one');
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2')); // an automatic re-ask goes out
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    const more = screen.getByRole('button', { name: /Show more/ });
    more.focus();
    fireEvent.click(more);
    await screen.findByText('Old two'); // page 2 lands: the re-ask is overtaken
    failReAsk(new Error('network')); // …and its failure dropped, with focus still inside
    await new Promise((done) => setTimeout(done, 0));
    (document.activeElement as HTMLElement).blur();
    rerender(section(filters(), undefined, undefined, 'r3'));
    await new Promise((done) => setTimeout(done, 0));
    expect(document.activeElement).toBe(document.body);
  });

  it('🔴 back, with focus inside, on a search an older backend answered: a failed check, not Checking… (round-25 review)', async () => {
    getThreads
      .mockResolvedValueOnce(olderBackend)
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Other one')], 1));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    rerender(section(filters({ search: 'two@shop.example' })));
    const jump = await screen.findByRole('button', { name: /Show in that view/ });
    jump.focus();
    rerender(section(filters({ search: 'one@shop.example' })));
    await screen.findByText(/could not be checked/);
    expect(screen.queryByText(/Checking other views/)).toBeNull();
    expect(getThreads).toHaveBeenCalledTimes(2); // its quiet window: not asked again yet
  });

  it('🔴 no "Checking…" left over a quiet window once focus has gone (round-26 review)', async () => {
    getThreads
      .mockResolvedValueOnce(olderBackend) // B: an older backend — B's quiet window
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30)); // A
    const { rerender } = render(section(filters({ search: 'b@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    rerender(section(filters({ search: 'a@shop.example' })));
    const jump = await screen.findByRole('button', { name: /Show in that view/ });
    jump.focus();
    // Back to B while the list re-reads: Checking…, focus on the root.
    rerender(section(filters({ search: 'b@shop.example' }), undefined, undefined, 'r1', false));
    await screen.findByText(/Checking other views/);
    (document.activeElement as HTMLElement).blur(); // focus leaves before the list lands
    rerender(section(filters({ search: 'b@shop.example' }), undefined, undefined, 'r2', true));
    await waitFor(() => expect(screen.queryByText(/Checking other views/)).toBeNull());
    expect(screen.queryByText(/could not be checked/)).toBeNull();
    expect(getThreads).toHaveBeenCalledTimes(2); // B's quiet window: nothing asked
  });

  it('[control] Refresh pressed with focus outside (a Safari mouse click) leaves focus there', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 1));
    render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByRole('button', { name: REFRESH }));
    await screen.findByText('Fresh one');
    expect(document.activeElement).toBe(document.body);
  });

  it('[control] focus on a button the fresh answer keeps stays on that button', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30));
    const { rerender } = render(section(filters()));
    const more = await screen.findByRole('button', { name: /Show more/ });
    more.focus();
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Show more/ }))
    );
  });

  it('🔴 focus elsewhere: a later re-ask that finds nothing after a Refresh with matches says nothing (round-21 review)', async () => {
    await refreshWithMatchesThenMove(answer([], 0), true);
    expect(screen.queryByText(NOTHING)).toBeNull();
    expect(screen.queryByText(/Checking other views/)).toBeNull();
  });

  it('🔴 matches coming back end the "no matches" line for good (round-21 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0))
      .mockResolvedValueOnce(answer([thread(4, 'terminal', 'Back one')], 1))
      .mockResolvedValueOnce(answer([], 0));
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(NOTHING);
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await screen.findByText('Back one');
    (document.activeElement as HTMLElement).blur();
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r3'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(screen.queryByText('Back one')).toBeNull());
    expect(screen.queryByText(NOTHING)).toBeNull();
  });

  it('🔴 a failed re-ask replaces the "no matches" line with "could not be checked" (round-21 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([], 0))
      .mockRejectedValueOnce(new Error('network'));
    const { rerender } = render(section(filters()));
    await pageThenRefresh();
    await screen.findByText(NOTHING);
    afterRefreshWindow();
    rerender(section(filters(), undefined, undefined, 'r2'));
    await screen.findByText(/could not be checked/);
    expect(screen.queryByText(NOTHING)).toBeNull();
  });

  it('[control] a search with nothing elsewhere says nothing without a Refresh', async () => {
    getThreads.mockResolvedValueOnce(answer([], 0));
    const { container } = render(section(filters()));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/Checking other views/)).toBeNull());
    expect(screen.queryByText(NOTHING)).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull(); // no empty root left behind
  });
});
