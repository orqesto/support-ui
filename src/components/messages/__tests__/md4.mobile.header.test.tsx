/**
 * Message detail v4 — the phone layout: the sticky header row and Back (M1), subject and the
 * Details card (M2), chips (M3). Shared mocks and render helpers: md4.mobile.utils.tsx. Every
 * phone test has a desktop CONTROL.
 */
import { describe, it, expect, vi } from 'vitest';
import { setViewport, baseMessage, renderDetail, topRow, classOf, svc } from './md4.mobile.utils';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailPage } from '@/pages/MessageDetailPage';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('M1 — the phone header row', () => {
  it('a sticky 52px row: Back, the id centred, More — and none of the desktop icons', () => {
    setViewport(true);
    renderDetail({}, { isFullPage: true });
    const row = topRow();
    expect(within(row).getByRole('button', { name: 'Back to inbox' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'More actions' })).toBeTruthy();
    expect(within(row).getByText(/101/)).toBeTruthy();
    for (const name of ['Copy link', 'Refresh thread', 'Open full page', 'Close']) {
      expect(within(row).queryByRole('button', { name })).toBeNull();
      expect(within(row).queryByRole('link', { name })).toBeNull();
    }
    const cls = classOf(row);
    expect(cls).toContain('max-sm:sticky');
    expect(cls).toContain('max-sm:top-[var(--md-sticky-top,0px)]');
    expect(cls).toContain('max-sm:h-[52px]');
    // A sticky element only sticks inside its parent's box: the header's own wrapper has none on
    // a phone, so the row's parent is the detail's whole column.
    expect(classOf(row.parentElement)).toContain('max-sm:contents');
    // The More target is 44px on a phone.
    expect(classOf(within(row).getByRole('button', { name: 'More actions' }))).toContain(
      'max-sm:w-11'
    );
  });

  it('sticks under the app header (a phone always opens the full page)', () => {
    setViewport(true);
    renderDetail({}, { isFullPage: true });
    expect(
      screen.getByTestId('message-detail-root').style.getPropertyValue('--md-sticky-top')
    ).toBe('var(--mobile-header-h, 0px)');
    // The document scrolls — the detail neither clips nor scrolls on a phone, or the
    // sticky rows would stick to a box that never moves.
    const root = screen.getByTestId('message-detail-root');
    expect(classOf(root)).toContain('max-sm:overflow-visible');
    expect(classOf(root)).toContain('max-sm:h-auto');
    expect(classOf(root.firstElementChild)).toContain('max-sm:overflow-visible');
    // …but it clips sideways (clip, not hidden: no scroll container), so nothing widens the page.
    expect(classOf(root)).toContain('max-sm:overflow-x-clip');
    expect(classOf(root.firstElementChild)).toContain('max-sm:overflow-x-clip');
    expect(classOf(screen.getByTestId('thread-scroller'))).toContain('max-sm:flex-none');
  });

  it('Back goes through the prompt-aware close: an unread triage thread asks "Mark as read?"', async () => {
    setViewport(true);
    const { onClose } = renderDetail(
      { status: 'filtered', metadata: { filtered: true }, isRead: false } as Partial<Message>,
      { isFullPage: true }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(await screen.findByText('Mark as read?')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('…and a read thread just goes back', () => {
    setViewport(true);
    const { onClose } = renderDetail({}, { isFullPage: true });
    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('More carries Copy link, Refresh and the read toggle on a phone, as a bottom sheet', () => {
    setViewport(true);
    renderDetail({
      status: 'filtered',
      metadata: { filtered: true },
      isRead: true,
    } as Partial<Message>);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    for (const name of ['Copy link', 'Refresh thread', 'Mark as unread']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeTruthy();
    }
    const cls = classOf(menu);
    expect(cls).toContain('max-sm:fixed');
    expect(cls).toContain('max-sm:bottom-2');
    expect(cls).toContain('max-sm:max-h-[72vh]');
    expect(cls).toContain('max-sm:rounded-2xl');
    expect(classOf(within(menu).getByRole('menuitem', { name: 'Copy link' }))).toContain(
      'max-sm:min-h-[46px]'
    );
    // The dim scrim behind it.
    const scrim = screen
      .getAllByRole('button', { name: 'Close' })
      .find((el) => classOf(el).includes('fixed inset-0 z-40'));
    expect(classOf(scrim ?? null)).toContain('max-sm:bg-black/40');
  });

  it('CONTROL desktop: no Back, the icons stay, and Copy link is not in More', () => {
    setViewport(false);
    renderDetail({
      status: 'filtered',
      metadata: { filtered: true },
      isRead: true,
    } as Partial<Message>);
    const row = topRow();
    expect(within(row).queryByRole('button', { name: 'Back to inbox' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Refresh thread' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Refresh thread' })).toBeNull();
  });
});

describe('M1 — the full page has one Back on a phone', () => {
  const renderPage = () => {
    svc.message.getById = vi.fn().mockResolvedValue({ success: true, data: baseMessage });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/messages/101']}>
          <Routes>
            <Route path="/messages/:id" element={<MessageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('phone: the "Back · Message Details" bar is gone; the header row carries Back', async () => {
    setViewport(true);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Back to inbox' })).toBeTruthy();
    expect(screen.queryByText('Message Details')).toBeNull();
    // Nothing on the way down clips (the document scrolls) and the detail runs edge to edge.
    const frame = screen.getByTestId('detail-page-frame');
    expect(classOf(frame)).toContain('max-sm:h-auto');
    expect(classOf(frame.parentElement)).toContain('max-sm:overflow-visible');
    expect(classOf(frame.parentElement!.parentElement)).toContain('max-sm:overflow-visible');
    expect(classOf(frame.parentElement!.parentElement)).toContain('max-sm:-mx-2');
  });

  it('CONTROL desktop: the bar stays, and there is no header Back', async () => {
    setViewport(false);
    renderPage();
    expect(await screen.findByText('Message Details')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to inbox' })).toBeNull();
  });
});

describe('M2 — subject and the sender Details card', () => {
  it('phone: a collapsed card; expanded it lists the addresses and the meta rows', () => {
    setViewport(true);
    renderDetail();
    const card = screen.getByTestId('mobile-sender-card');
    const toggle = within(card).getByRole('button', { name: /Ada Lovelace/ });
    expect(within(card).getByText('ada@example.com')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(card).queryByText('Received at')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(classOf(within(card).getByTestId('mobile-sender-chevron'))).toContain('rotate-180');
    const region = within(card).getByRole('region', { name: 'Sender details' });
    expect(toggle.getAttribute('aria-controls')).toBe(region.id);
    expect(within(region).getByText('Received at')).toBeTruthy();
    expect(within(region).getAllByText('support@acme.test')).toHaveLength(2); // Received at + To
    expect(within(region).getByText('billing@acme.test')).toBeTruthy(); // Cc
    // The meta rows live in the card, and only there (the inline strip is not rendered).
    const rows = within(region).getByTestId('meta-card-rows');
    expect(within(rows).getByText('Dept')).toBeTruthy();
    expect(within(rows).getByText('Assigned')).toBeTruthy();
    expect(screen.getAllByText('Dept')).toHaveLength(1);
    expect(classOf(within(rows).getByText('Dept'))).toContain('w-[84px]');
  });

  it('phone: the card labels its Labels row, as it does Dept and Assigned', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const rows = screen.getByTestId('meta-card-rows');
    expect(classOf(within(rows).getByText('Labels'))).toContain('w-[84px]');
  });

  it('phone: a sender whose name IS the address (`a@x <a@x>`) shows the address once', () => {
    setViewport(true);
    renderDetail({ sender: 'ada@example.com <ada@example.com>' } as Partial<Message>);
    const card = screen.getByTestId('mobile-sender-card');
    expect(within(card).getAllByText('ada@example.com')).toHaveLength(1);
    cleanup();
    // The quoted display name is the mail header's quoting, not part of the name.
    renderDetail({ sender: '"Lovelace, Ada" <ada@example.com>' } as Partial<Message>);
    const quoted = screen.getByTestId('mobile-sender-card');
    expect(within(quoted).getByText('Lovelace, Ada')).toBeTruthy();
    expect(within(quoted).getByText('ada@example.com')).toBeTruthy();
  });

  it('desktop: the same sender — the address once, no bold name beside it', () => {
    setViewport(false);
    renderDetail({ sender: 'ada@example.com <ada@example.com>' } as Partial<Message>);
    const profile = screen.getByTitle('View contact profile');
    expect(within(profile).getAllByText('ada@example.com')).toHaveLength(1);
    expect(profile.querySelector('b')).toBeNull();
  });

  it('phone: no Cc row without a Cc, no address rows without recipients', () => {
    setViewport(true);
    renderDetail({
      recipients: { to: ['support@acme.test'], cc: [], bcc: [] },
    } as Partial<Message>);
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.queryByText('Cc')).toBeNull();
    cleanup();
    renderDetail({ recipients: undefined } as Partial<Message>);
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(screen.queryByText('Received at')).toBeNull();
    expect(screen.getByText('Dept')).toBeTruthy();
  });

  it('phone: the chips row drops the sender identity; the subject is 17px, pretty-wrapped', () => {
    setViewport(true);
    renderDetail();
    expect(screen.queryByText('received at')).toBeNull();
    expect(screen.queryByTitle('View contact profile')).toBeNull();
    const subject = screen.getByRole('heading', { level: 2 });
    expect(classOf(subject)).toContain('max-sm:text-[17px]');
    expect(classOf(subject)).toContain('max-sm:[text-wrap:pretty]');
    expect(classOf(subject)).toContain('max-sm:line-clamp-none');
  });

  it('CONTROL desktop: no card, the identity row and the inline meta strip stay', () => {
    setViewport(false);
    renderDetail();
    expect(screen.queryByTestId('mobile-sender-card')).toBeNull();
    expect(screen.getByTitle('View contact profile')).toBeTruthy();
    expect(screen.getByText('received at')).toBeTruthy();
    expect(screen.getByText('Dept')).toBeTruthy();
    expect(screen.queryByTestId('meta-card-rows')).toBeNull();
  });
});

describe('M3 — chips', () => {
  it('the row wraps (never scrolls sideways) and the chips are 26px on a phone', () => {
    setViewport(true);
    renderDetail({
      slaResponseMinutes: 60,
      createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    } as Partial<Message>);
    const chips = screen.getByTestId('header-chips');
    expect(classOf(chips)).toContain('flex-wrap');
    expect(classOf(chips)).not.toContain('overflow-x-auto');
    // The status chip (a Select chip) and the SLA chip.
    expect(screen.getByText('In progress').closest('[class*="max-sm:h-[26px]"]')).not.toBeNull();
    expect(classOf(screen.getByTestId('sla-clock'))).toContain('max-sm:h-[26px]');
  });

  it('CONTROL desktop: the status chip keeps its 23px height', () => {
    setViewport(false);
    renderDetail();
    expect(screen.getByText('In progress').closest('[class*="h-[23px]"]')).not.toBeNull();
  });
});

describe('M2 — the Details card lists Bcc and wraps long addresses', () => {
  it('a Bcc row, and To/Cc values wrap instead of truncating', () => {
    setViewport(true);
    const long = 'a-very-long-shared-inbox-address-for-billing-disputes@subsidiary.example.com';
    renderDetail({
      recipients: { to: [long], cc: [], bcc: ['audit@acme.test'] },
    } as Partial<Message>);
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const region = screen.getByRole('region', { name: 'Sender details' });
    expect(within(region).getByText('Bcc')).toBeTruthy();
    expect(within(region).getByText('audit@acme.test')).toBeTruthy();
    const toValue = within(region)
      .getAllByText(long)
      .find((el) => el.tagName === 'DD')!;
    expect(classOf(toValue)).not.toContain('truncate');
    expect(classOf(toValue)).toContain('break-words');
  });
});
