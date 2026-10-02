/**
 * Mutation kills — the header's Related chips (ticket, Merged · n), their popovers' open/close
 * and focus return, the SLA record chip, the channel label and the meta strip's first paint.
 * Shared mocks: md4.header.utils.tsx (imported first so its mocks register before the header).
 */
import { describe, it, expect, vi } from 'vitest';
import { svc, message, ticket, Where, twoTickets } from './md4.header.utils';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

type Props = Partial<Parameters<typeof MessageDetailHeader>[0]>;
const client = new QueryClient();
const tree = (over: Props = {}) => (
  <ThemeProvider>
    <QueryClientProvider client={client}>
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
const esc = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 15)));

describe('Related chips — shape on every viewport', () => {
  it('the ticket chip and the Merged chip carry the Related chip shape and the 26px phone height', async () => {
    twoTickets();
    svc.listMerges.mockResolvedValue([merged(50)]);
    render(tree());
    for (const id of ['ticket-chip', 'merged-chip']) {
      const cls = (await screen.findByTestId(id)).className;
      for (const token of ['h-[23px]', 'max-sm:h-[26px]', 'px-2', 'bg-card', 'font-sans']) {
        expect(cls).toContain(token);
      }
    }
  });

  it('the SLA record chip carries its state colour and the phone height', () => {
    render(
      tree({
        message: {
          ...message,
          status: 'resolved',
          firstResponseAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        } as Message,
      })
    );
    const cls = screen.getByTestId('sla-record').className;
    for (const token of ['text-muted-foreground', 'border-border', 'bg-muted', 'max-sm:h-[26px]']) {
      expect(cls).toContain(token);
    }
  });

  it('the channel label is set as a label and truncates on a phone', () => {
    render(tree());
    const channel = screen.getByTestId('detail-top-row').querySelector<HTMLElement>('span[title]')!;
    for (const token of ['uppercase', 'max-sm:truncate', 'max-sm:max-w-full']) {
      expect(channel.className).toContain(token);
    }
  });
});

describe('The ticket chip', () => {
  it('two tickets: the chip reads "#7" then "+1" — once', async () => {
    twoTickets();
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.textContent).toBe('#7+1');
    expect(within(chip).getByText('#7').className).toContain('font-mono');
  });

  it('one ticket hidden from this viewer: named in the singular', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 1 });
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.getAttribute('aria-label')).toBe(
      '1 hidden — on 1 ticket in departments you cannot open'
    );
  });

  it('CONTROL: two hidden are named in the plural', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 2 });
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.getAttribute('aria-label')).toBe(
      '2 hidden — on 2 tickets in departments you cannot open'
    );
  });

  it('clicking the chip toggles its popover; closing hands focus back to the chip', async () => {
    twoTickets();
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    fireEvent.click(chip);
    expect(await screen.findByRole('dialog', { name: 'Tickets' })).toBeTruthy();
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tickets' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
    fireEvent.click(chip);
    expect(await screen.findByRole('dialog', { name: 'Tickets' })).toBeTruthy();
  });

  it('More while the popover is up, then Esc: focus goes to the chip the popover returns to', async () => {
    twoTickets();
    render(tree());
    const chip = await screen.findByTestId('ticket-chip');
    fireEvent.click(chip);
    await screen.findByRole('dialog', { name: 'Tickets' });
    // A click alone (no press) leaves the popover up while More opens.
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByTestId('more-menu')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Tickets' })).toBeTruthy();
    esc();
    await waitFor(() => expect(screen.queryByTestId('more-menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });
});

describe('The Merged chip', () => {
  it('names the count in the plural and toggles its popover', async () => {
    svc.listMerges.mockResolvedValue([merged(50), merged(51)]);
    render(tree());
    const chip = await screen.findByTestId('merged-chip');
    expect(chip.getAttribute('aria-label')).toBe('Merged · 2 — 2 threads merged in');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chip);
    expect(await screen.findByRole('dialog', { name: 'Same conversation' })).toBeTruthy();
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Same conversation' })).toBeNull()
    );
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('CONTROL: one merge is named in the singular', async () => {
    svc.listMerges.mockResolvedValue([merged(50)]);
    render(tree());
    const chip = await screen.findByTestId('merged-chip');
    expect(chip.getAttribute('aria-label')).toBe('Merged · 1 — 1 thread merged in');
  });

  it('Esc closes Same conversation and hands focus back to the Merged chip', async () => {
    svc.listMerges.mockResolvedValue([merged(50)]);
    render(tree());
    const chip = await screen.findByTestId('merged-chip');
    fireEvent.click(chip);
    await screen.findByRole('dialog', { name: 'Same conversation' });
    esc();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Same conversation' })).toBeNull()
    );
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('a thread switch closes Same conversation even when the host keeps a merge list', async () => {
    const merges = [merged(50)];
    const onReloadMerges = vi.fn();
    const { rerender } = render(tree({ merges, onReloadMerges }));
    fireEvent.click(await screen.findByTestId('merged-chip'));
    await screen.findByRole('dialog', { name: 'Same conversation' });
    rerender(
      tree({ merges, onReloadMerges, message: { ...message, id: 2, publicId: 'SUP-2' } as Message })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Same conversation' })).toBeNull()
    );
    expect(screen.getByTestId('merged-chip')).toBeTruthy();
  });
});

describe('Header wiring', () => {
  it('New ticket after a thread switch starts from the thread now shown', () => {
    const { rerender } = render(tree());
    rerender(tree({ message: { ...message, id: 2, publicId: 'SUP-2' } as Message }));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByTestId('more-menu')).getByText('Create ticket'));
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=2');
  });

  it('metaTarget null (sidebar not mounted yet): no meta strip on first paint', async () => {
    render(tree({ metaTarget: null }));
    await settle();
    expect(screen.queryByText('Dept')).toBeNull();
    expect(screen.queryByText('Assigned')).toBeNull();
  });

  it('CONTROL: no metaTarget renders the inline meta strip', async () => {
    render(tree());
    expect(await screen.findByText('Dept')).toBeTruthy();
  });

  it('CONTROL: the ticket fixture has a resolved row the headline skips', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9, status: 'resolved' })],
    });
    render(tree());
    expect((await screen.findByTestId('ticket-chip')).textContent).toBe('#9');
  });
});
