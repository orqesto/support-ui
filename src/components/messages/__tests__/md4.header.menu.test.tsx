/**
 * Message detail v4 — the header: the More menu — pickers, phone-only items, sentence case, the
 * destructive group (H5). Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { perms, svc, message, renderHeader, setPhone } from './md4.header.utils';
import { screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { toast } from '@/lib/toast';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('H5 — More menu', () => {
  const openMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    return screen.getByRole('menu');
  };

  it('offers Add to ticket… and Merge with another thread… — and still no Move to spam', async () => {
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    expect(within(menu).getByText('Add to ticket…')).toBeInTheDocument();
    expect(within(menu).getByText('Merge with another thread…')).toBeInTheDocument();
    expect(within(menu).getByText('Conversation history')).toBeInTheDocument();
    expect(within(menu).queryByText(/move to spam/i)).toBeNull();
  });

  it('every item reads in sentence case, as v4 does — the ones staging wrote in Title Case too', async () => {
    renderHeader({
      message: { ...message, isLead: true, externalThreadId: 'thread-1' } as unknown as Message,
      onClassify: vi.fn(),
      onDelete: vi.fn(),
    });
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.trim() ?? '');
    for (const label of [
      'Create lead ticket',
      'Check contradiction',
      'Unmark as lead',
      'Not a lead — close',
      'Mark as suspicious',
      'Delete message',
    ])
      expect(labels).toContain(label);
    // No capital after the first word, anywhere in the menu.
    expect(labels.filter((label) => /\s\p{Lu}/u.test(label))).toEqual([]);
  });

  it('a rule sets off the destructive group, whose items read as danger (v4 `#morePop`)', async () => {
    renderHeader({
      message: { ...message, isLead: true } as unknown as Message,
      onClassify: vi.fn(),
      onDelete: vi.fn(),
    });
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    const separators = within(menu).getAllByRole('separator');
    expect(separators).toHaveLength(1);
    // The rule sits right before "Mark as suspicious": everything after it is destructive.
    const after = separators[0].nextElementSibling;
    expect(after?.textContent?.trim()).toBe('Mark as suspicious');
    const item = (name: string) => within(menu).getByRole('menuitem', { name });
    for (const danger of ['Mark as suspicious', 'Delete message'])
      expect(item(danger).className).toContain('text-destructive');
    for (const plain of ['Conversation history', 'Reanalyse', 'Unmark as lead'])
      expect(item(plain).className).not.toContain('text-destructive');
  });

  it('only Delete in the destructive group: the rule still sits right above it', async () => {
    // A closed thread offers no "Mark as suspicious"; Delete alone is the destructive group.
    renderHeader({
      message: { ...message, status: 'closed' } as unknown as Message,
      onClassify: vi.fn(),
      onDelete: vi.fn(),
    });
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    expect(within(menu).queryByText('Mark as suspicious')).toBeNull();
    const separators = within(menu).getAllByRole('separator');
    expect(separators).toHaveLength(1);
    expect(separators[0].nextElementSibling?.textContent?.trim()).toBe('Delete message');
  });

  it('CONTROL: no destructive item, no rule', async () => {
    renderHeader({ message: { ...message, status: 'closed' } as unknown as Message });
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    expect(within(menu).queryByRole('separator')).toBeNull();
  });

  it('Add to ticket… opens the ticket picker even with no ticket', async () => {
    renderHeader();
    fireEvent.click(within(await openMenu()).getByText('Add to ticket…'));
    expect(await screen.findByText('Add this thread to a ticket')).toBeInTheDocument();
  });

  it('Merge with another thread… opens the merge picker', async () => {
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    fireEvent.click(within(await openMenu()).getByText('Merge with another thread…'));
    expect(await screen.findByText('Merge with another thread')).toBeInTheDocument();
  });

  it('no merge item when the backend cannot list merges (older backend)', async () => {
    svc.listMerges.mockResolvedValue(null);
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    expect(within(await openMenu()).queryByText('Merge with another thread…')).toBeNull();
  });

  it('no Add to ticket on an older backend without the route — Create ticket stays', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: true });
    renderHeader();
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const menu = await openMenu();
    expect(within(menu).queryByText('Add to ticket…')).toBeNull();
    fireEvent.click(within(menu).getByText('Create ticket'));
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=1');
  });

  it('without MANAGE_TICKETS: neither picker is offered — Create ticket is', async () => {
    perms.denied.add(Permission.MANAGE_TICKETS);
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const menu = await openMenu();
    expect(within(menu).queryByText('Add to ticket…')).toBeNull();
    expect(within(menu).queryByText('Merge with another thread…')).toBeNull();
    fireEvent.click(within(menu).getByText('Create ticket'));
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=1');
  });

  it('a resolved thread on no ticket can still start one (staging’s New ticket could)', async () => {
    renderHeader({ message: { ...message, status: 'resolved' } as Message });
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalled());
    expect(screen.queryByTestId('ticket-chip')).not.toBeInTheDocument();
    fireEvent.click(within(await openMenu()).getByText('Create ticket'));
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=1');
  });

  it('phones: Refresh thread and the read toggle move into More', async () => {
    setPhone(true);
    const onRefresh = vi.fn();
    const onToggleRead = vi.fn();
    renderHeader({ onRefresh, showReadToggle: true, isRead: true, onToggleRead });
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('Refresh thread'));
    expect(onRefresh).toHaveBeenCalled();
    fireEvent.click(within(await openMenu()).getByText('Mark as unread'));
    expect(onToggleRead).toHaveBeenCalled();
  });

  it('phones: no read toggle in More where the header shows none', async () => {
    setPhone(true);
    renderHeader({ onRefresh: vi.fn(), showReadToggle: false, onToggleRead: vi.fn() });
    const menu = await openMenu();
    expect(within(menu).getByText('Refresh thread')).toBeInTheDocument();
    expect(within(menu).queryByText(/Mark as (un)?read/)).toBeNull();
  });

  it('desktop: neither phone item is in More', async () => {
    setPhone(false);
    renderHeader({
      onRefresh: vi.fn(),
      showReadToggle: true,
      isRead: false,
      onToggleRead: vi.fn(),
    });
    const menu = await openMenu();
    expect(within(menu).queryByText('Refresh thread')).toBeNull();
    expect(within(menu).queryByText(/Mark as (un)?read/)).toBeNull();
  });

  describe('Copy link on a phone', () => {
    const setClipboard = (clipboard: unknown) =>
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    afterEach(() => setClipboard(undefined));

    it('says "Link copied" in a toast — the menu it was pressed in has closed', async () => {
      setPhone(true);
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      const success = vi.spyOn(toast, 'success').mockImplementation(() => {});
      renderHeader();
      fireEvent.click(within(await openMenu()).getByText('Copy link'));
      await waitFor(() => expect(success).toHaveBeenCalledWith('Link copied'));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/messages?id='));
      expect(screen.queryByRole('menu')).toBeNull();
      success.mockRestore();
    });

    it('says so when the copy fails — a refusal, or no clipboard at all (insecure context)', async () => {
      setPhone(true);
      const failure = vi.spyOn(toast, 'error').mockImplementation(() => {});
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
      renderHeader();
      fireEvent.click(within(await openMenu()).getByText('Copy link'));
      await waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
      setClipboard(undefined);
      fireEvent.click(within(await openMenu()).getByText('Copy link'));
      await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
      expect(failure.mock.calls[0][0]).toBe(
        'Could not copy the link (denied) — copy it from the address bar.'
      );
      expect(failure.mock.calls[1][0]).toBe(
        'Could not copy the link (the clipboard is not available here) — copy it from the address bar.'
      );
      failure.mockRestore();
    });

    it('a header unmounted while "Link copied" shows leaves no revert timer behind', async () => {
      setPhone(false);
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
      const { unmount } = renderHeader();
      const copy = await screen.findByRole('button', { name: 'Copy link' });
      await act(async () => {});
      vi.useFakeTimers();
      try {
        const before = vi.getTimerCount();
        fireEvent.click(copy);
        await act(async () => {});
        // CONTROL: the copy did schedule the 2 s revert (otherwise the 0 below proves nothing).
        expect(vi.getTimerCount()).toBe(before + 1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('CONTROL desktop: the icon copies with no toast (its tooltip says it)', async () => {
      setPhone(false);
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
      const success = vi.spyOn(toast, 'success').mockImplementation(() => {});
      renderHeader();
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      await act(async () => {});
      expect(success).not.toHaveBeenCalled();
      success.mockRestore();
    });
  });

  it('phones: no Open full page in More (a phone is always on the full page); desktop keeps the icon, not a menu item', async () => {
    setPhone(true);
    renderHeader({ showFullPageButton: false, isFullPage: true, onClose: vi.fn() });
    expect(within(await openMenu()).queryByText('Open full page')).toBeNull();
    cleanup();
    // Even handed the slide-over's props, the phone menu has no such item.
    setPhone(true);
    renderHeader({ showFullPageButton: true, isFullPage: false, onClose: vi.fn() });
    expect(within(await openMenu()).queryByText('Open full page')).toBeNull();
    cleanup();
    setPhone(false);
    renderHeader({ showFullPageButton: true, isFullPage: false, onClose: vi.fn() });
    expect(screen.getByRole('link', { name: 'Open full page' })).toBeInTheDocument();
    expect(within(await openMenu()).queryByText('Open full page')).toBeNull();
  });

  it('phones: the More sheet and its scrim render on <body>, out of the sticky row', async () => {
    setPhone(true);
    renderHeader();
    const menu = await openMenu();
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId('detail-top-row').contains(menu)).toBe(false);
    const scrim = screen
      .getAllByRole('button', { name: 'Close' })
      .find((el) => el.className.includes('fixed inset-0 z-40'))!;
    expect(scrim.parentElement).toBe(document.body);
    fireEvent.click(scrim);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('CONTROL desktop: the More menu stays in the row, under its button', async () => {
    setPhone(false);
    renderHeader();
    const menu = await openMenu();
    expect(screen.getByTestId('detail-top-row').contains(menu)).toBe(true);
  });
});
