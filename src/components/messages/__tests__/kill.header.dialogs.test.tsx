/**
 * Mutation kills — the header's wiring to its two pickers (AddToTicketDialog, MergePickerDialog):
 * when they open and close, what their callbacks do, and that focus waits while one is up. The
 * pickers are stubbed (no modal), so the header's own guards are what is tested.
 * Shared mocks: md4.header.utils.tsx (imported first so its mocks register before the header).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { svc, message, ticket, Where, twoTickets } from './md4.header.utils';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type * as MergeThreadsModule from '../MergeThreads';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: toasts }));

type AddProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (result: {
    ticketId: number;
    alreadyOn: boolean;
    ticket: ReturnType<typeof ticket>;
    conversationId: number;
  }) => void;
};
type Row = { id: number; publicId?: string | null; subject?: string | null };
type MergeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: (survivor: Row, mergedIn: Row[]) => void;
};
const stubs = vi.hoisted(() => ({
  add: null as AddProps | null,
  merge: null as MergeProps | null,
  mergeOpenLog: [] as boolean[],
}));
vi.mock('../AddToTicketDialog', () => ({
  AddToTicketDialog: (props: AddProps) => {
    stubs.add = props;
    return props.open ? <div data-testid="add-stub">add picker</div> : null;
  },
}));
vi.mock('../MergeThreads', async (importOriginal) => ({
  ...(await importOriginal<typeof MergeThreadsModule>()),
  MergePickerDialog: (props: MergeProps) => {
    stubs.merge = props;
    stubs.mergeOpenLog.push(props.open);
    return props.open ? <div data-testid="merge-stub">merge picker</div> : null;
  },
}));

type Props = Partial<Parameters<typeof MessageDetailHeader>[0]>;
const tree = (over: Props = {}) => (
  <ThemeProvider>
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages/1']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <MessageDetailHeader
                  message={message}
                  showFullPageButton={false}
                  isFullPage
                  threadCount={1}
                  {...over}
                />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </ThemeProvider>
);
const merged = (id: number) => ({
  id,
  publicId: `SUP-${id}`,
  subject: 'Old',
  mergedAt: null,
  mergedBy: null,
});
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 15)));
const moreItem = async (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await within(screen.getByTestId('more-menu')).findByText(label));
};
const thread2 = { ...message, id: 2, publicId: 'SUP-2' } as Message;

beforeEach(() => {
  stubs.add = null;
  stubs.merge = null;
  stubs.mergeOpenLog.length = 0;
});

describe('Merge picker — open state', () => {
  it('is closed on the first render, with a merge list from the host', () => {
    render(tree({ merges: [], onReloadMerges: vi.fn() }));
    expect(stubs.mergeOpenLog[0]).toBe(false);
    expect(screen.queryByTestId('merge-stub')).toBeNull();
  });

  it('stays open when the host replaces the list with another non-empty one', async () => {
    const onReloadMerges = vi.fn();
    const { rerender } = render(tree({ merges: [merged(50)], onReloadMerges }));
    await moreItem('Merge with another thread…');
    expect(screen.getByTestId('merge-stub')).toBeTruthy();
    rerender(tree({ merges: [merged(50), merged(51)], onReloadMerges }));
    await settle();
    expect(screen.getByTestId('merge-stub')).toBeTruthy();
    expect(stubs.merge?.open).toBe(true);
  });

  it('unmounts at once (not one more open paint) when the list becomes null', async () => {
    const onReloadMerges = vi.fn();
    const { rerender } = render(tree({ merges: [merged(50)], onReloadMerges }));
    await moreItem('Merge with another thread…');
    expect(screen.getByTestId('merge-stub')).toBeTruthy();
    const before = stubs.mergeOpenLog.length;
    rerender(tree({ merges: null, onReloadMerges }));
    await settle();
    expect(stubs.mergeOpenLog.slice(before)).toEqual([]);
    expect(screen.queryByTestId('merge-stub')).toBeNull();
  });
});

describe('Add-to-ticket picker — open state', () => {
  it('stays open when the tickets state changes to anything but "unavailable"', async () => {
    twoTickets();
    const { rerender } = render(tree());
    await screen.findByTestId('ticket-chip');
    await moreItem('Add to ticket…');
    expect(screen.getByTestId('add-stub')).toBeTruthy();
    // The next read is in flight: the state goes back to "loading".
    svc.ticketsOfThread.mockReturnValue(new Promise(() => {}));
    rerender(tree({ message: thread2 }));
    await settle();
    expect(screen.getByTestId('add-stub')).toBeTruthy();
  });

  it('CONTROL: it closes when the backend turns out not to have ticket links', async () => {
    twoTickets();
    const { rerender } = render(tree());
    await screen.findByTestId('ticket-chip');
    await moreItem('Add to ticket…');
    svc.ticketsOfThread.mockResolvedValue({ unavailable: true, rows: [], hiddenCount: 0 });
    rerender(tree({ message: thread2 }));
    await waitFor(() => expect(screen.queryByTestId('add-stub')).toBeNull());
  });
});

describe('Focus waits while a picker is up', () => {
  it('Add to ticket… from the popover: focus is not handed back until the picker closes', async () => {
    twoTickets();
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    expect(screen.getByTestId('add-stub')).toBeTruthy();
    await settle();
    expect(document.activeElement).not.toBe(chip);
    act(() => stubs.add!.onOpenChange(false));
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('Merge… from Same conversation: focus is not handed back until the picker closes', async () => {
    svc.listMerges.mockResolvedValue([merged(50)]);
    render(tree());
    const chip = await screen.findByTestId('merged-chip');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Merge…' }));
    expect(screen.getByTestId('merge-stub')).toBeTruthy();
    await settle();
    expect(document.activeElement).not.toBe(chip);
    act(() => stubs.merge!.onOpenChange(false));
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });
});

describe('Picker callbacks', () => {
  it('an add that changed something raises no "already on" notice', async () => {
    twoTickets();
    render(tree());
    await screen.findByTestId('ticket-chip');
    act(() =>
      stubs.add!.onAdded({
        ticketId: 30,
        alreadyOn: false,
        ticket: ticket({ ticketId: 30, title: 'Login broken' }),
        conversationId: 1,
      })
    );
    expect(toasts.info).not.toHaveBeenCalled();
    act(() =>
      stubs.add!.onAdded({
        ticketId: 7,
        alreadyOn: true,
        ticket: ticket({ ticketId: 7 }),
        conversationId: 1,
      })
    );
    expect(toasts.info).toHaveBeenCalledWith('This thread is already on ticket #7.');
  });

  it('an add with no host onRefresh: no throw, and the chip shows the ticket', async () => {
    render(tree({ onRefresh: undefined }));
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalled());
    await settle();
    expect(() =>
      act(() =>
        stubs.add!.onAdded({
          ticketId: 30,
          alreadyOn: false,
          ticket: ticket({ ticketId: 30, title: 'Login broken', status: 'open' }),
          conversationId: 1,
        })
      )
    ).not.toThrow();
    expect((await screen.findByTestId('ticket-chip')).textContent).toBe('#30');
  });

  it('merged INTO this thread, no host onRefresh: no throw, the Merged chip appears', async () => {
    render(tree({ onRefresh: undefined }));
    await waitFor(() => expect(stubs.merge).not.toBeNull());
    await settle();
    expect(() =>
      act(() => stubs.merge!.onMerged!({ id: 1 }, [{ id: 50, publicId: 'SUP-50' }]))
    ).not.toThrow();
    expect(await screen.findByTestId('merged-chip')).toBeTruthy();
  });

  it('merged AWAY (another survivor): only the host refreshes — no merge re-read here', async () => {
    const onRefresh = vi.fn();
    render(tree({ onRefresh }));
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(1));
    await settle();
    act(() => stubs.merge!.onMerged!({ id: 99 }, [{ id: 1 }]));
    await settle();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(svc.listMerges).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('merged-chip')).toBeNull();
  });

  it('merged AWAY with no host onRefresh: no throw', async () => {
    render(tree({ onRefresh: undefined }));
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalledTimes(1));
    await settle();
    expect(() => act(() => stubs.merge!.onMerged!({ id: 99 }, [{ id: 1 }]))).not.toThrow();
    await settle();
    expect(svc.listMerges).toHaveBeenCalledTimes(1);
  });
});
