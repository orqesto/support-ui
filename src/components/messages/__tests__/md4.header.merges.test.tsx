/**
 * Message detail v4 — the header: the "Merged · n" chip and Same conversation (H4); one merges
 * read per open. Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { perms, svc, message, renderHeader } from './md4.header.utils';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import type { ManualMerge } from '@/services/conversationMerge.service';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Permission } from '@/types/roles';
import { useState } from 'react';
import { useThreadMergeContext } from '../useThreadMergeContext';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('H4 — the Merged chip and Same conversation', () => {
  const merged = {
    id: 50,
    publicId: 'SUP-50',
    subject: 'Old',
    mergedAt: '2026-09-20T10:00:00Z',
    mergedBy: null,
  };

  it('no chip at 0 merges; "Merged · 1" at 1', async () => {
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledWith(1));
    expect(screen.queryByTestId('merged-chip')).not.toBeInTheDocument();
  });

  it('opens Same conversation: the merged thread with Unmerge, and Merge…', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    const chip = await screen.findByTestId('merged-chip');
    expect(chip.textContent).toBe('Merged · 1');
    expect(chip).toHaveAccessibleName('Merged · 1 — 1 thread merged in');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    expect(within(popover).getByText(/Two threads become one/)).toBeInTheDocument();
    expect(within(popover).getByText('TES-SUP-50')).toBeInTheDocument();
    svc.listMerges.mockResolvedValue([]);
    fireEvent.click(within(popover).getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(svc.unmerge).toHaveBeenCalledWith(1, 50));
    // The list reloads after an unmerge: the chip goes with the last merge.
    await waitFor(() => expect(screen.queryByTestId('merged-chip')).not.toBeInTheDocument());
  });

  it('a merged-in row says when it was merged; an unreadable date says nothing', async () => {
    svc.listMerges.mockResolvedValue([
      merged,
      { id: 51, publicId: 'SUP-51', subject: 'Other', mergedAt: 'not-a-date', mergedBy: null },
    ]);
    renderHeader();
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    const row = (id: string) => within(popover).getByText(id).closest('li')!;
    expect(row('TES-SUP-50').textContent).toContain(new Date(merged.mergedAt).toLocaleDateString());
    expect(row('TES-SUP-51').textContent).not.toContain('Invalid Date');
  });

  it('Merge… opens the merge picker', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Merge…' }));
    expect(await screen.findByText('Merge with another thread')).toBeInTheDocument();
    expect(screen.getByText('Only email threads can merge into this one.')).toBeInTheDocument();
  });

  it('the merge picker names a product channel with its capitals: "Only WhatsApp threads"', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader({ message: { ...message, channel: 'whatsapp' } as unknown as Message });
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Merge…' }));
    expect(
      await screen.findByText('Only WhatsApp threads can merge into this one.')
    ).toBeInTheDocument();
  });

  it('merge picker: an older search landing after a newer one does not overwrite it', async () => {
    const row = (id: number, subject: string) => ({
      latestMessage: { id, subject, channel: 'email', sender: 'x@example.com' },
      sender: 'x@example.com',
    });
    let first: (value: unknown) => void = () => {};
    svc.getThreads
      .mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
      .mockResolvedValueOnce({ data: [row(70, 'Newer answer')] });
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const openPicker = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
      fireEvent.click(within(screen.getByRole('menu')).getByText('Merge with another thread…'));
    };
    await openPicker();
    await screen.findByText('Merge with another thread');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() =>
      expect(screen.queryByText('Merge with another thread')).not.toBeInTheDocument()
    );
    await openPicker();
    expect(await screen.findByText('Newer answer')).toBeInTheDocument();
    await act(async () => {
      first({ data: [row(60, 'Stale answer')] });
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale answer')).not.toBeInTheDocument();
    expect(screen.getByText('Newer answer')).toBeInTheDocument();
  });

  it('merge picker: a search that fails clears the rows the previous search found', async () => {
    svc.getThreads
      .mockResolvedValueOnce({
        data: [
          {
            latestMessage: { id: 70, subject: 'Acme order', channel: 'email' },
            sender: 'bob@acme.test',
          },
        ],
      })
      .mockRejectedValueOnce(new Error('network down'));
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Merge with another thread…'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Acme order')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose' })).toBeInTheDocument();
    const box = within(dialog).getByPlaceholderText('Thread number, address or subject');
    fireEvent.change(box, { target: { value: 'foo' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(
      await within(dialog).findByText('Could not search threads just now.')
    ).toBeInTheDocument();
    expect(svc.getThreads).toHaveBeenLastCalledWith({ search: 'foo', lifecycle: 'all' }, 1, 25);
    // Under the error: no row from the earlier search, nothing to Choose.
    expect(within(dialog).queryByText('Acme order')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Choose' })).toBeNull();
  });

  it('without MANAGE_TICKETS: the merges show, but no Unmerge and no Merge…', async () => {
    perms.denied.add(Permission.MANAGE_TICKETS);
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    expect(within(popover).getByText('TES-SUP-50')).toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: /Unmerge/ })).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Merge…' })).toBeNull();
  });
});

describe('Merges — one read per open', () => {
  it('a host that passes its merge list: the header shows it and does not ask again', async () => {
    const reload = vi.fn();
    renderHeader({
      merges: [{ id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null }],
      onReloadMerges: reload,
    } as Partial<Parameters<typeof MessageDetailHeader>[0]>);
    expect(await screen.findByTestId('merged-chip')).toHaveTextContent('Merged · 1');
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(svc.listMerges).not.toHaveBeenCalled();
  });

  it('after an unmerge it asks the HOST to re-read', async () => {
    const reload = vi.fn();
    renderHeader({
      merges: [{ id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null }],
      onReloadMerges: reload,
    } as Partial<Parameters<typeof MessageDetailHeader>[0]>);
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(svc.listMerges).not.toHaveBeenCalled();
  });

  it('CONTROL: without a host list the header reads it itself (other hosts keep working)', async () => {
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(1));
  });

  /*
    MessageDetail's wiring, for real: the merge list comes from useThreadMergeContext, whose read
    also follows the thread refresh key that the header's onRefresh bumps. A merge or an unmerge
    from the header must cost ONE re-read, not an explicit reload plus the refresh's.
  */
  const MessageDetailLikeHost = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const context = useThreadMergeContext(message.id, true, refreshKey);
    return (
      <MessageDetailHeader
        message={message}
        showFullPageButton={false}
        isFullPage
        threadCount={1}
        merges={context.merges}
        onReloadMerges={context.reloadMerges}
        onMergeChange={context.applyMergeChange}
        onRefresh={() => setRefreshKey((key) => key + 1)}
      />
    );
  };
  const renderWithHost = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/messages/1']}>
            <MessageDetailLikeHost />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  it('an unmerge from the header re-reads the merge list ONCE', async () => {
    svc.listMerges.mockResolvedValue([
      { id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null },
    ]);
    renderWithHost();
    fireEvent.click(await screen.findByTestId('merged-chip'));
    await settle();
    expect(svc.listMerges).toHaveBeenCalledTimes(1); // the open
    svc.listMerges.mockResolvedValue([]);
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(svc.unmerge).toHaveBeenCalledWith(1, 50));
    await settle();
    expect(svc.listMerges).toHaveBeenCalledTimes(2);
    // …and that one read is what the chip shows: the last merge undone, the chip goes.
    expect(screen.queryByTestId('merged-chip')).not.toBeInTheDocument();
  });

  it('a merge INTO this thread re-reads the merge list ONCE, and the page can scroll after', async () => {
    document.body.style.overflow = '';
    svc.merge.mockResolvedValue(undefined);
    svc.getThreads.mockResolvedValue({
      data: [
        {
          latestMessage: { id: 70, subject: 'Other thread', channel: 'email' },
          sender: 'bob@example.com',
        },
      ],
    });
    renderWithHost();
    await settle();
    expect(svc.listMerges).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Merge with another thread…'));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    // Picker and confirm are both up: the page is held still.
    expect(document.body.style.overflow).toBe('hidden');
    const keep = await screen.findByRole('radio', { name: /this thread/ });
    fireEvent.click(keep);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(svc.merge).toHaveBeenCalledWith(1, [70], undefined));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(svc.listMerges).toHaveBeenCalledTimes(2);
    // Both dialogs closed in one update: the page gets its own overflow back (phone: it scrolls).
    expect(document.body.style.overflow).toBe('');
  });
});

/*
  A merges read that FAILS (listMerges → null) after the list is on screen. Before: the host set
  merges=null, which unmounted an open merge picker mid-search and took the chip with it — and the
  picker came back by itself on the next good read (mergePickerOpen had stayed true).
*/
describe('Merges — a failed refresh', () => {
  const merged = { id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null };
  const pickerTitle = () => screen.queryByText('Merge with another thread', { selector: 'h2' });
  const wrap = (node: React.ReactNode) => (
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/messages/1']}>{node}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
  const openPickerFromMore = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Merge with another thread…'));
    await waitFor(() => expect(pickerTitle()).not.toBeNull());
  };

  let bumpRefresh: () => void = () => {};
  const RefreshingHost = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    bumpRefresh = () => setRefreshKey((key) => key + 1);
    const context = useThreadMergeContext(message.id, true, refreshKey);
    return (
      <MessageDetailHeader
        message={message}
        showFullPageButton={false}
        isFullPage
        threadCount={1}
        merges={context.merges}
        onReloadMerges={context.reloadMerges}
        onMergeChange={context.applyMergeChange}
      />
    );
  };

  it('useThreadMergeContext: a refresh that fails keeps the list — chip and open picker stay', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    render(wrap(<RefreshingHost />));
    expect(await screen.findByTestId('merged-chip')).toHaveTextContent('Merged · 1');
    await openPickerFromMore();
    svc.listMerges.mockResolvedValue(null);
    act(() => bumpRefresh());
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(pickerTitle()).not.toBeNull();
    expect(screen.getByTestId('merged-chip')).toHaveTextContent('Merged · 1');
  });

  it('CONTROL: a FIRST read that fails offers nothing merge-related', async () => {
    svc.listMerges.mockResolvedValue(null);
    render(wrap(<RefreshingHost />));
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByTestId('merged-chip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).queryByText('Merge with another thread…')).toBeNull();
  });

  /*
    After an unmerge the server CONFIRMED, a failed re-read must not leave the thread listed
    ("Merged · 1", Unmerge offered again) beside the "…unmerged" toast.
  */
  const unmergeWithFailingReread = async (rows: ManualMerge[]) => {
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    expect(within(popover).getAllByRole('button', { name: /^Unmerge/ })).toHaveLength(rows.length);
    svc.listMerges.mockResolvedValue(null);
    fireEvent.click(within(popover).getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  };
  const other = { id: 51, publicId: 'SUP-51', subject: 'Other', mergedAt: null, mergedBy: null };

  it("the header's OWN read (no host): an unmerge whose re-read fails still drops that thread", async () => {
    svc.listMerges.mockResolvedValue([merged, other]);
    renderHeader();
    await unmergeWithFailingReread([merged, other]);
    expect(screen.getByTestId('merged-chip')).toHaveTextContent('Merged · 1');
    expect(screen.queryByRole('button', { name: 'Unmerge TES-SUP-50' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unmerge TES-SUP-51' })).toBeInTheDocument();
  });

  it('host-owned (useThreadMergeContext): an unmerge whose re-read fails still drops the chip', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    render(wrap(<RefreshingHost />));
    await unmergeWithFailingReread([merged]);
    expect(screen.queryByTestId('merged-chip')).toBeNull();
  });

  it('host-owned: a merge INTO this thread whose re-read fails still lists the merged-in thread', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    svc.merge.mockResolvedValue(undefined);
    svc.getThreads.mockResolvedValue({
      data: [{ latestMessage: { id: 70, publicId: 'SUP-70', channel: 'email' }, sender: 'b@x.io' }],
    });
    render(wrap(<RefreshingHost />));
    await screen.findByTestId('merged-chip');
    await openPickerFromMore();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose' }));
    fireEvent.click(await screen.findByRole('radio', { name: /this thread/ }));
    svc.listMerges.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(svc.merge).toHaveBeenCalledWith(1, [70], undefined));
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByTestId('merged-chip')).toHaveTextContent('Merged · 2');
    fireEvent.click(screen.getByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    expect(within(popover).getByText('TES-SUP-70')).toBeInTheDocument();
  });

  it('header: merges going null closes the picker — it does not come back on the next good read', async () => {
    let setHostMerges: (rows: ManualMerge[] | null) => void = () => {};
    const Host = () => {
      const [merges, setMerges] = useState<ManualMerge[] | null>([merged]);
      setHostMerges = setMerges;
      return (
        <MessageDetailHeader
          message={message}
          showFullPageButton={false}
          isFullPage
          threadCount={1}
          merges={merges}
          onReloadMerges={() => {}}
        />
      );
    };
    render(wrap(<Host />));
    await screen.findByTestId('merged-chip');
    await openPickerFromMore();
    act(() => setHostMerges(null));
    expect(pickerTitle()).toBeNull();
    expect(screen.queryByTestId('merged-chip')).toBeNull();
    // Its pending focus return runs: focus is not left on <body>.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }))
    );
    act(() => setHostMerges([merged]));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(pickerTitle()).toBeNull();
    expect(screen.getByTestId('merged-chip')).toBeInTheDocument();
  });
});
