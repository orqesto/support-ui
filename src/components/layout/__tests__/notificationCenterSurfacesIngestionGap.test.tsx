/**
 * The Notification Center must RENDER ingestion gaps, and the SLA bell must not.
 *
 * ⛔ This exists because of an observed failure, not a hypothetical one. On staging,
 * 2026-09-10, a real `ingestion_gap` row (source 3, checkpoint 25h ahead, nine hours of a
 * mailbox unreachable) rendered in the bell under **SLA BREACHES** as a generic amber row
 * titled "Notification" reading **"nullm over"** — because the fail-open SLA filter catches
 * any kind not listed in `NON_SLA_BELL_KINDS`, and this kind carries no `minutesOverdue`.
 *
 * So there are two assertions, and BOTH have to hold: the kind is excluded from the SLA bell
 * (otherwise "nullm over" comes back) AND it is rendered here (otherwise excluding it makes
 * the alert reach nobody, which is strictly worse — the exact near-miss the sibling test for
 * unanswered outbound documents).
 */
import type { ComponentProps } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TokenLimitAlert } from '@/hooks/useTokenLimitAlerts';

// The hooks left real (dark mailboxes, KB review) read /api/notifications on mount; unmocked,
// jsdom sends real requests that fail into whichever test is still waiting (audit pass 8).
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { data: { notifications: [] } } }),
    patch: () => Promise.resolve({ data: {} }),
  },
}));

let gapAlerts: Array<Record<string, unknown>> = [];

vi.mock('@/hooks/useIngestionGapAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useIngestionGapAlerts');
  return {
    ...actual,
    useIngestionGapAlerts: () => ({ alerts: gapAlerts, dismiss: vi.fn(), refresh: vi.fn() }),
  };
});

vi.mock('@/hooks/useNotificationCounts', () => ({
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/hooks/useAiProviderAlerts', () => ({
  useAiProviderAlerts: () => ({ alerts: [], dismiss: vi.fn() }),
  AI_PROVIDER_DOWN_KIND: 'ai_provider_down',
}));
vi.mock('@/hooks/useStaleKbAlerts', () => ({
  useStaleKbAlerts: () => ({ alerts: [], dismiss: vi.fn(), refresh: vi.fn() }),
  KB_DOCUMENT_STALE_KIND: 'kb_document_stale',
}));
vi.mock('@/hooks/useUnansweredOutboundAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/hooks/useUnansweredOutboundAlerts'
  );
  return {
    ...actual,
    useUnansweredOutboundAlerts: () => ({
      alerts: [],
      truncated: false,
      dismiss: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

// The daily-token-limit hook polls /api/notifications on mount; unmocked, jsdom would send a
// real request from every bell render here (audit F11).
// `badged` is worked out by the hook's own rule (`isNoLongerInForce`), not handed in: a badge test
// that supplies its own count proves nothing about which notices are badged (audit pass 8).
let tokenLimitState: { alerts: TokenLimitAlert[] } = { alerts: [] };
/** A KB limit notice in the hook's real shape (typed: a missing field fails type-check). */
const makeLimitAlert = (over: Partial<TokenLimitAlert> = {}): TokenLimitAlert => ({
  id: 77,
  bucket: 'kb',
  title: 'Daily AI limit for KB processing reached',
  spent: 5_000_100,
  limit: 5_000_000,
  enforced: true,
  resetsAt: '2099-01-01T00:00:00.000Z',
  effect: null,
  releasedAt: null,
  checkedAt: null,
  releasePartial: null,
  releaseKind: null,
  releaseCause: 'limit_setting',
  ...over,
});
let tokenLimitRefreshes = 0;
let tokenLimitDismissed: number[] = [];
vi.mock('@/hooks/useTokenLimitAlerts', async () => {
  const actual = await vi.importActual<{
    isNoLongerInForce: (alert: TokenLimitAlert) => boolean;
  }>('@/hooks/useTokenLimitAlerts');
  return {
    ...actual,
    useTokenLimitAlerts: () => ({
      ...tokenLimitState,
      badged: tokenLimitState.alerts.filter((alert) => !actual.isNoLongerInForce(alert)).length,
      dismiss: (id: number) => {
        tokenLimitDismissed.push(id);
      },
      refresh: () => {
        tokenLimitRefreshes += 1;
      },
    }),
  };
});

const { NotificationCenter } = await import('../NotificationCenter');

type CenterProps = ComponentProps<typeof NotificationCenter>;

const slaProp: CenterProps['sla'] = {
  notifications: [],
  total: 0,
  unreadCount: 0,
  fetchError: false,
  onlyAssignedToMe: false,
  setOnlyMine: vi.fn(),
  clearAll: () => Promise.resolve(),
  dismiss: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};

const learningProp: CenterProps['learning'] = {
  notifications: [],
  suggestions: [],
  unreadCount: 0,
  fetchError: false,
  isOrgAdmin: false,
  markAllRead: vi.fn(),
  refresh: vi.fn(),
};

const open = () => {
  render(
    <MemoryRouter>
      <NotificationCenter sla={slaProp} learning={learningProp} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getAllByRole('button')[0]);
};

/** The taco row, field for field as the backend published it on 2026-09-10. */
const tacoGap = {
  id: 8243,
  title: 'Mail may be missing — this mailbox’s sync position was in the future',
  messageSourceId: 3,
  mailbox: 'Gmail-usetixly@gmail.com',
  cause: 'checkpoint_ahead',
  minutesAhead: 1500,
  window: '2026-09-10T07:58:28.754Z → 2026-09-11T08:58:03.336Z',
  recovery: 're-scanning the last 48h; raise MAIL_POLL_OVERLAP_HOURS to reach further back',
  skipped: [],
  skippedOverflow: false,
};

beforeEach(() => {
  gapAlerts = [];
  tokenLimitState = { alerts: [] };
  tokenLimitRefreshes = 0;
  tokenLimitDismissed = [];
});
afterEach(() => cleanup());

describe('Notification Center — ingestion gaps', () => {
  it('renders the gap, names the mailbox, and says the skew in human units', () => {
    gapAlerts = [tacoGap];
    open();
    expect(screen.getByText(/sync position was in the future/)).toBeTruthy();
    expect(screen.getByText('Gmail-usetixly@gmail.com')).toBeTruthy();
    // 1500 minutes is 25 hours. ⛔ The raw figure is what made this unreadable in the logs.
    expect(screen.getByText(/25 hours in the future/)).toBeTruthy();
    expect(screen.queryByText(/1500/)).toBeNull();
  });

  it('shows the blind window and the recovery the backend reported', () => {
    gapAlerts = [tacoGap];
    open();
    expect(screen.getByText(/2026-09-10T07:58:28.754Z/)).toBeTruthy();
    expect(screen.getByText(/raise MAIL_POLL_OVERLAP_HOURS/)).toBeTruthy();
  });

  it('never renders the "nullm over" shape that the fail-open SLA bell produced', () => {
    gapAlerts = [tacoGap];
    open();
    expect(screen.queryByText(/nullm/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  /**
   * ⛔ The three causes are NOT the same event, and an earlier version of this section wrote
   * one sentence for all of them — "this mailbox's sync position was wrong" — which is false
   * for two and, worse, told an operator mail had been lost when `cannot_resume` explicitly
   * loses nothing. `source_stopped_polling`, which an earlier version of this test asserted
   * against, is not a cause the backend has ever published.
   */
  it('says what day_too_large actually is — a listing cap, not a wrong clock', () => {
    gapAlerts = [
      {
        ...tacoGap,
        id: 9001,
        title: 'Mail may be missing — a day held more messages than one sync can read',
        cause: 'day_too_large',
        minutesAhead: null,
        window: '2026-09-08',
      },
    ];
    open();
    expect(screen.getByText(/held more messages than a single sync can list/)).toBeTruthy();
    expect(screen.queryByText(/sync position/)).toBeNull();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('does not claim mail was lost for cannot_resume, where nothing is lost', () => {
    gapAlerts = [
      {
        ...tacoGap,
        id: 9002,
        title: 'Mail may be missing — this mailbox’s sync cannot reach its older messages',
        cause: 'cannot_resume',
        minutesAhead: null,
        window: null,
      },
    ];
    open();
    expect(screen.getByText(/Nothing is lost/)).toBeTruthy();
    expect(screen.queryByText(/was never fetched/)).toBeNull();
  });

  /** Titles and window strings exactly as the backend writes them (ingestionGapAlert.ts TITLES, sentDrain.ts). */
  const UNREADABLE_TITLE =
    'Sent messages could not be imported — the sync failed on them repeatedly';
  const STRANDED_TITLE =
    'Sent mail may be missing — the sent-folder drain could not reach its oldest part';

  it.each([
    ['ids kept', '2 sent message(s): 18f3a1, 18f3a2'],
    [
      'ids NOT kept',
      'More sent messages were given up on than could be tracked; their ids were not kept',
    ],
  ])(
    'unreadable_message (%s): says they were NOT imported, shows the window, names the runbook section',
    (_label, window) => {
      gapAlerts = [
        {
          ...tacoGap,
          id: 9004,
          title: UNREADABLE_TITLE,
          cause: 'unreadable_message',
          minutesAhead: null,
          window,
        },
      ];
      open();
      expect(screen.getByText(UNREADABLE_TITLE)).toBeTruthy();
      expect(screen.getByText(window)).toBeTruthy();
      expect(screen.getByText(/stopped waiting for them — they were not imported/)).toBeTruthy();
      expect(screen.getByText(/ids are listed below when they were kept/)).toBeTruthy();
      // Cited by NAME: the runbook's section numbers are shared by two PRs and can shift.
      expect(screen.getByText(/runbook, section ‘Unreadable sent messages’/)).toBeTruthy();
      expect(screen.queryByText(/§5\.1/)).toBeNull();
      expect(screen.queryByText(/may not have been fetched/)).toBeNull();
    }
  );

  it('unreadable_live_message: says it was NOT imported, shows the folder + UID, names the runbook section', () => {
    // Title and window exactly as the backend writes them (ingestionGapAlert.ts TITLES, imapMailboxWrites.ts).
    const title =
      'A message could not be imported — the sync failed on it repeatedly and moved past it';
    const window = 'INBOX UID 48213';
    gapAlerts = [
      { ...tacoGap, id: 9006, title, cause: 'unreadable_live_message', minutesAhead: null, window },
    ];
    open();
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(window)).toBeTruthy();
    expect(screen.getByText(/that message was not imported/)).toBeTruthy();
    expect(screen.getByText(/runbook, section ‘Unreadable live messages \(IMAP\)’/)).toBeTruthy();
    expect(screen.queryByText(/may not have been fetched/)).toBeNull();
  });

  it('unreadable_live_gmail_message: its own caption, no IMAP folder/UID wording, names the Gmail section', () => {
    // Title and window exactly as the backend writes them (ingestionGapAlert.ts TITLES,
    // gmail/transientFetchFailures.ts).
    const title =
      'Gmail messages could not be imported — Gmail failed on them repeatedly; each is re-tried about once a day';
    const window = 'Gmail message 18f2a9c0d1e2b3a4';
    gapAlerts = [
      {
        ...tacoGap,
        id: 9007,
        title,
        cause: 'unreadable_live_gmail_message',
        minutesAhead: null,
        window,
      },
    ];
    open();
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(window)).toBeTruthy();
    expect(screen.getByText(/they were not imported/)).toBeTruthy();
    expect(screen.getByText(/server or network error/)).toBeTruthy();
    expect(screen.getAllByText(/re-tried about once a day/).length).toBeGreaterThan(0);
    expect(screen.getByText(/runbook, section ‘Unreadable live messages \(Gmail\)’/)).toBeTruthy();
    expect(screen.queryByText(/UID/)).toBeNull();
    expect(screen.queryByText(/\(IMAP\)/)).toBeNull();
    expect(screen.queryByText(/may not have been fetched/)).toBeNull();
  });

  it('unreadable_live_gmail_message: lists EVERY skipped id, not only the latest in the window', () => {
    gapAlerts = [
      {
        ...tacoGap,
        id: 9008,
        title: 'Gmail messages could not be imported',
        cause: 'unreadable_live_gmail_message',
        minutesAhead: null,
        window: 'Gmail message bbb222',
        skipped: ['aaa111', 'bbb222'],
        skippedOverflow: false,
      },
    ];
    open();
    expect(screen.getByText(/2 not imported: aaa111, bbb222/)).toBeTruthy();
    expect(screen.queryByText('Gmail message bbb222')).toBeNull();
  });

  it('unreadable_live_gmail_message: an overflowed list with no ids left promises none', () => {
    const window = 'Gmail messages given up on earlier; their ids were no longer kept';
    gapAlerts = [
      {
        ...tacoGap,
        id: 9010,
        title: 'Gmail messages could not be imported',
        cause: 'unreadable_live_gmail_message',
        minutesAhead: null,
        window,
        skipped: [],
        skippedOverflow: true,
      },
    ];
    open();
    expect(screen.getByText(window)).toBeTruthy();
    expect(screen.queryByText(/shown below/)).toBeNull();
  });

  it('unreadable_live_gmail_message: an overflowed list says it shows only the latest', () => {
    gapAlerts = [
      {
        ...tacoGap,
        id: 9009,
        title: 'Gmail messages could not be imported',
        cause: 'unreadable_live_gmail_message',
        minutesAhead: null,
        window: 'Gmail message ccc',
        skipped: ['ccc'],
        skippedOverflow: true,
      },
    ];
    open();
    expect(screen.getByText(/1\+ not imported \(latest 1 shown\): ccc/)).toBeTruthy();
  });

  it('sent_drain_stranded: the caption points at the date the window shows', () => {
    const window =
      'sent mail older than 2026-09-10T00:00:00.000Z (the sent window now starts at 2026-09-12T07:00:00.000Z — checkpoint minus overlap)';
    gapAlerts = [
      {
        ...tacoGap,
        id: 9005,
        title: STRANDED_TITLE,
        cause: 'sent_drain_stranded',
        minutesAhead: null,
        window,
      },
    ];
    open();
    expect(screen.getByText(STRANDED_TITLE)).toBeTruthy();
    expect(screen.getByText(window)).toBeTruthy();
    expect(screen.getByText(/sent-folder sync could not reach its oldest part/)).toBeTruthy();
    expect(screen.getByText(/older than the first date shown may be missing/)).toBeTruthy();
    expect(screen.queryByText(/may not have been fetched/)).toBeNull();
  });

  it('renders the backend title rather than one hardcoded headline', () => {
    gapAlerts = [
      {
        ...tacoGap,
        id: 9003,
        title: 'Mail may be missing — a totally new cause we added later',
        cause: 'brand_new_cause',
        minutesAhead: null,
      },
    ];
    open();
    expect(screen.getByText(/a totally new cause we added later/)).toBeTruthy();
  });

  /** Zero is a real value the hook deliberately preserves; the prose must still read. */
  it('does not say "0 minutes in the future" when the skew rounds to nothing', () => {
    gapAlerts = [{ ...tacoGap, id: 9004, minutesAhead: 0 }];
    open();
    expect(screen.queryByText(/0 minutes in the future/)).toBeNull();
    // Still the checkpoint_ahead sentence, just without a figure — the cause IS skew here.
    expect(screen.getAllByText(/sync position was in the future/).length).toBeGreaterThan(0);
  });

  it('is absent from the panel when there is no gap', () => {
    gapAlerts = [];
    open();
    expect(screen.queryByText(/Mail may be missing/)).toBeNull();
  });
});

describe('Notification Center — daily AI limit notices on the badge (audit F3)', () => {
  const limitAlert = (resetsAt: string) => makeLimitAlert({ resetsAt });
  const badge = () => screen.getByRole('button', { name: 'Notifications' }).textContent;

  it("an earlier day's notice is listed but not badged", () => {
    tokenLimitState = { alerts: [limitAlert('2000-01-01T00:00:00.000Z')] };
    open();
    expect(badge()).toBe('');
    expect(screen.getByText(/AI limit for KB processing was reached/)).toBeTruthy();
  });

  it("CONTROL: today's notice is listed and badged", () => {
    tokenLimitState = { alerts: [limitAlert('2099-01-01T00:00:00.000Z')] };
    open();
    expect(badge()).toBe('1');
    expect(screen.getByText(/AI limit for KB processing/)).toBeTruthy();
  });
});

describe('Notification Center — Clear all and the limit notices (audit pass 8, F8-2)', () => {
  it('re-reads the limit notices once dismiss-all has answered', async () => {
    const sla = {
      ...slaProp,
      notifications: [
        {
          id: 501,
          kind: 'sla_breach',
          title: 'SLA breach',
          message: 'First response overdue',
          severity: 'warning',
          isRead: false,
          createdAt: new Date().toISOString(),
          details: {},
        },
      ],
      total: 1,
      unreadCount: 1,
    } as unknown as CenterProps['sla'];
    render(
      <MemoryRouter>
        <NotificationCenter sla={sla} learning={learningProp} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(tokenLimitRefreshes).toBe(1));
  });

  it('does NOT re-read before dismiss-all answers (pass 9, deferred promise)', async () => {
    let answer: () => void = () => {};
    const sla = {
      ...slaProp,
      notifications: [
        {
          id: 502,
          kind: 'sla_breach',
          title: 'SLA breach',
          message: 'First response overdue',
          severity: 'warning',
          isRead: false,
          createdAt: new Date().toISOString(),
          details: {},
        },
      ],
      total: 1,
      unreadCount: 1,
      clearAll: () => new Promise<void>((resolve) => (answer = resolve)),
    } as unknown as CenterProps['sla'];
    render(
      <MemoryRouter>
        <NotificationCenter sla={sla} learning={learningProp} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(tokenLimitRefreshes).toBe(0);
    answer();
    await waitFor(() => expect(tokenLimitRefreshes).toBe(1));
  });

  it('R8: never removes a limit notice — dismiss-all keeps it; only the re-read may change it', async () => {
    tokenLimitState = {
      alerts: [makeLimitAlert()],
    };
    const sla = {
      ...slaProp,
      notifications: [
        {
          id: 501,
          kind: 'sla_breach',
          title: 'SLA breach',
          message: 'First response overdue',
          severity: 'warning',
          isRead: false,
          createdAt: new Date().toISOString(),
          details: {},
        },
      ],
      total: 1,
      unreadCount: 1,
    } as unknown as CenterProps['sla'];
    render(
      <MemoryRouter>
        <NotificationCenter sla={sla} learning={learningProp} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('Daily AI limit for KB processing reached')).toBeTruthy();
    await waitFor(() => expect(tokenLimitRefreshes).toBe(1));
    expect(tokenLimitDismissed).toEqual([]);
  });
});

describe('Notification Center — "Only mine"', () => {
  it('on: never claims ONLY assigned alerts — unassigned workspace alerts show too (pass 11)', () => {
    render(
      <MemoryRouter>
        <NotificationCenter sla={{ ...slaProp, onlyAssignedToMe: true }} learning={learningProp} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    const title = screen.getByRole('button', { name: 'Only mine' }).getAttribute('title') ?? '';
    expect(title).not.toContain('only assigned');
    expect(title).toContain(
      'unassigned workspace alerts (AI limits, AI provider down, mail intake)'
    );
  });

  it('CONTROL: off reads all org alerts', () => {
    open();
    expect(screen.getByRole('button', { name: 'Only mine' }).getAttribute('title')).toBe(
      'Showing all org alerts'
    );
  });
});

describe('Notification Center — "+N more" under the SLA list (pass 12 NIT)', () => {
  // `total` counts every kind the backend lists, AI-limit notices too, and Clear all keeps those
  // (R8) — so the line never tells the reader Clear all dismisses all N.
  it('says how many more are not listed, without promising Clear all dismisses them', () => {
    const breach = {
      id: 1,
      entityId: 10,
      type: 'message',
      organizationId: 4,
      severity: 'warning',
      breachAmount: 5,
      details: {},
      createdAt: '2026-10-01T10:00:00.000Z',
      receivedAt: 0,
      isRead: false,
    } as unknown as CenterProps['sla']['notifications'][number];
    render(
      <MemoryRouter>
        <NotificationCenter
          sla={{ ...slaProp, notifications: [breach], total: 4 }}
          learning={learningProp}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('+3 more not listed here')).toBeTruthy();
    expect(screen.queryByText(/dismiss all/)).toBeNull();
  });
});
