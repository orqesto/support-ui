import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

/**
 * L3 (owner 2026-11-12): the header reads the thread's verdict as the lane and the detail do.
 *   - Its Spam badge follows the NEWEST inbound mail's verdict (`message.isSpam`, as the action
 *     strip reads it), not the first mail's frozen `metadata.spamCheck`.
 *   - Its active state comes from `deriveThreadFlags` (threadFlags.ts), so a spam verdict outside
 *     triage makes it inactive here as it does in the detail: no "Mark as suspicious" on it.
 */ vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: true,
    isOrgAdmin: true,
    canManage: true,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) }),
}));
vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock('@/services/settings.service', () => ({
  labelService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
// Child components fetch through the api-client; keep every request inside the test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { MessageDetailHeader } from '../MessageDetailHeader';
import { MessageSignalBadges } from '../MessageSignalBadges';
import { deriveThreadFlags } from '../messageDetail/threadFlags';
import { MessageActionStrip } from '../MessageActionStrip';
import { ThemeProvider } from '@/contexts/ThemeContext';

afterEach(cleanup);

const thread = (over: Record<string, unknown> = {}): Message =>
  ({
    id: 1,
    publicId: 'SUP-1',
    status: 'open',
    channel: 'email',
    sender: 'customer@example.com',
    subject: 'Hello',
    createdAt: '2026-10-11T10:00:00Z',
    metadata: { analysis: { category: 'other' } },
    ...over,
  }) as unknown as Message;

const renderHeader = (msg: Message) =>
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MessageDetailHeader
            message={msg}
            showFullPageButton={false}
            isFullPage
            threadCount={1}
            onClassify={vi.fn().mockResolvedValue(undefined)}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

const spamFirstMail = {
  analysis: { category: 'other' },
  spamCheck: { isSpam: true, category: 'spam' },
};
const cleanFirstMail = {
  analysis: { category: 'other' },
  spamCheck: { isSpam: false, category: 'legitimate' },
};
const spamBadges = () => screen.queryAllByText(/^Spam$/);

describe('header Spam badge: the newest inbound verdict', () => {
  it('a first mail judged spam, cleared by the newest mail (isSpam false): no Spam badge', () => {
    renderHeader(thread({ isSpam: false, metadata: spamFirstMail }));
    expect(spamBadges()).toHaveLength(0);
  });

  it('a clean first mail, the newest mail judged spam (isSpam true): the Spam badge', () => {
    renderHeader(thread({ isSpam: true, metadata: cleanFirstMail }));
    expect(spamBadges().length).toBeGreaterThan(0);
  });

  it('CONTROL: an older backend (no isSpam) still reads the first mail', () => {
    renderHeader(thread({ metadata: spamFirstMail }));
    expect(spamBadges().length).toBeGreaterThan(0);
  });

  it('CONTROL: a clean thread has no Spam badge', () => {
    renderHeader(thread({ isSpam: false, metadata: cleanFirstMail }));
    expect(spamBadges()).toHaveLength(0);
  });
});

describe('header active state: deriveThreadFlags', () => {
  const menu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    return screen.getByRole('menu');
  };

  it('a spam verdict outside triage (open + spam) is not active: no "Mark as suspicious"', () => {
    renderHeader(thread({ isSpam: true, metadata: spamFirstMail }));
    expect(within(menu()).queryByText('Mark as suspicious')).toBeNull();
  });

  it('CONTROL: a clean open thread is active and offers it', () => {
    renderHeader(thread({ isSpam: false, metadata: cleanFirstMail }));
    expect(within(menu()).getByText('Mark as suspicious')).toBeInTheDocument();
  });
});

describe('spam badge category label (MessageSignalBadges): only from a first mail that was spam', () => {
  it("a thread turned spam by a follow-up is labelled Spam, not its first mail's Legitimate", () => {
    render(<MessageSignalBadges message={thread({ isSpam: true, metadata: cleanFirstMail })} />);
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(screen.queryByText('Legitimate')).toBeNull();
  });

  it('CONTROL: a first mail that was spam still names its category', () => {
    render(
      <MessageSignalBadges
        message={thread({
          isSpam: true,
          metadata: { spamCheck: { isSpam: true, category: 'promotional' } },
        })}
      />
    );
    expect(screen.getByText('Promotional')).toBeInTheDocument();
  });
});

describe('threadFlags: spam outside triage follows the newest inbound mail', () => {
  it('newest mail clean, first mail spam: not flagged, active, and the header offers its actions', () => {
    const msg = thread({ isSpam: false, metadata: spamFirstMail });
    expect(deriveThreadFlags(msg)).toMatchObject({
      isSpamFlaggedOutsideTriage: false,
      isActive: true,
    });
    renderHeader(msg);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getByText('Mark as suspicious')).toBeInTheDocument();
  });

  it('newest mail spam, first mail clean: flagged, not active', () => {
    expect(deriveThreadFlags(thread({ isSpam: true, metadata: cleanFirstMail }))).toMatchObject({
      isSpamFlaggedOutsideTriage: true,
      isActive: false,
    });
  });

  it('CONTROL: a single-mail thread (older backend, no isSpam) reads its one mail as before', () => {
    expect(deriveThreadFlags(thread({ metadata: spamFirstMail })).isSpamFlaggedOutsideTriage).toBe(
      true
    );
    expect(deriveThreadFlags(thread({ metadata: cleanFirstMail })).isSpamFlaggedOutsideTriage).toBe(
      false
    );
  });
});

describe('header More menu on a resolved thread (owner 2026-11-12: unchanged)', () => {
  const items = (status: string) => {
    renderHeader(thread({ status, isLead: true, isSpam: false, metadata: cleanFirstMail }));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    return within(screen.getByRole('menu'));
  };

  it('a resolved thread offers neither "Mark as suspicious" nor "Not a lead — close"', () => {
    const menu = items('resolved');
    expect(menu.queryByText('Mark as suspicious')).toBeNull();
    expect(menu.queryByText('Not a lead — close')).toBeNull();
  });

  it('CONTROL: an open thread offers both', () => {
    const menu = items('open');
    expect(menu.getByText('Mark as suspicious')).toBeInTheDocument();
    expect(menu.getByText('Not a lead — close')).toBeInTheDocument();
  });
});

describe('spam badge category: latestSpamCategory (the newest classified mail)', () => {
  it('shows the newest mail’s category over the first mail’s', () => {
    render(
      <MessageSignalBadges
        message={thread({
          isSpam: true,
          latestSpamCategory: 'promotional',
          metadata: { spamCheck: { isSpam: true, category: 'spam' } },
        })}
      />
    );
    expect(screen.getByText('Promotional')).toBeInTheDocument();
  });

  it('null (the newest mail has no category) reads plain Spam, not the first mail’s', () => {
    render(
      <MessageSignalBadges
        message={thread({
          isSpam: true,
          latestSpamCategory: null,
          metadata: { spamCheck: { isSpam: true, category: 'promotional' } },
        })}
      />
    );
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(screen.queryByText('Promotional')).toBeNull();
  });

  it('CONTROL: field absent (older backend) falls back to the first mail’s category', () => {
    render(
      <MessageSignalBadges
        message={thread({
          isSpam: true,
          metadata: { spamCheck: { isSpam: true, category: 'promotional' } },
        })}
      />
    );
    expect(screen.getByText('Promotional')).toBeInTheDocument();
  });
});

describe('review 1: an agent’s spam confirmation does not override a newer clean mail', () => {
  const confirmedThenClean = thread({
    isSpam: false,
    spamConfirmedAt: '2026-11-01T10:00:00Z',
    metadata: spamFirstMail,
  });

  it('not flagged, active; the header shows no Spam badge', () => {
    expect(deriveThreadFlags(confirmedThenClean)).toMatchObject({
      isSpamFlaggedOutsideTriage: false,
      isActive: true,
    });
    renderHeader(confirmedThenClean);
    expect(screen.queryAllByText(/^Spam/)).toHaveLength(0);
  });

  it('CONTROL: confirmed and the newest mail still spam: flagged', () => {
    expect(
      deriveThreadFlags(thread({ ...confirmedThenClean, isSpam: true })).isSpamFlaggedOutsideTriage
    ).toBe(true);
  });
});

describe('review 3: the strip’s security warning reads the newest mail’s category', () => {
  const strip = (over: Record<string, unknown>) =>
    render(
      <MessageActionStrip
        message={thread(over)}
        isFiltered={false}
        isSuspicious
        isActive={false}
        hasLinkedTicket={false}
        setReopenDialogOpen={() => {}}
        onClassify={vi.fn().mockResolvedValue(undefined)}
      />
    );
  const legitimateFirst = { spamCheck: { isSpam: false, category: 'legitimate' } };
  const phishingFirst = { spamCheck: { isSpam: false, category: 'phishing' } };

  it('phishing on the newest mail: the warning shows', () => {
    strip({ isSuspicious: true, latestSpamCategory: 'phishing', metadata: legitimateFirst });
    expect(screen.getByText(/Flagged as possible phishing/)).toBeInTheDocument();
  });

  it('phishing only on the first mail, the newest clean: no warning', () => {
    strip({ isSuspicious: true, latestSpamCategory: null, metadata: phishingFirst });
    expect(screen.queryByText(/Flagged as possible phishing/)).toBeNull();
    expect(screen.getByText('Flagged as suspicious by spam filter')).toBeInTheDocument();
  });

  it('CONTROL: field absent (older backend): the first mail’s phishing still warns', () => {
    strip({ isSuspicious: true, metadata: phishingFirst });
    expect(screen.getByText(/Flagged as possible phishing/)).toBeInTheDocument();
  });

  it('the filtered banner too: the newest mail’s category names it', () => {
    render(
      <MessageActionStrip
        message={thread({
          status: 'filtered',
          latestSpamCategory: 'phishing',
          metadata: { spamCheck: { isSpam: true, category: 'promotional' } },
        })}
        isFiltered
        isSuspicious={false}
        isActive={false}
        hasLinkedTicket={false}
        setReopenDialogOpen={() => {}}
        onClassify={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText(/Phishing threat detected/)).toBeInTheDocument();
  });
});

describe('review 5: the spam tooltip does not explain the newest mail with the first mail’s flags', () => {
  const firstMailFlags = {
    spamCheck: { isSpam: true, category: 'spam', redFlags: ['all-caps-subject'] },
  };
  const hoverSpamBadge = () => {
    const badge = screen.getAllByText(/^(Spam|Promotional)$/)[0];
    fireEvent.mouseEnter(badge.closest('[role="presentation"]') ?? badge);
  };

  it('with latestSpamCategory: just the label, no first-mail flags', async () => {
    render(
      <MessageSignalBadges
        message={thread({
          isSpam: true,
          latestSpamCategory: 'promotional',
          metadata: firstMailFlags,
        })}
      />
    );
    hoverSpamBadge();
    // The badge and its tooltip both say the label (the tooltip opens after its delay).
    await waitFor(() => expect(screen.getAllByText('Promotional')).toHaveLength(2));
    expect(screen.queryByText(/All-caps subject/)).toBeNull();
  });

  it('CONTROL: field absent: today’s tooltip with the flags', async () => {
    render(<MessageSignalBadges message={thread({ isSpam: true, metadata: firstMailFlags })} />);
    hoverSpamBadge();
    expect(await screen.findByText(/All-caps subject/)).toBeInTheDocument();
  });
});
