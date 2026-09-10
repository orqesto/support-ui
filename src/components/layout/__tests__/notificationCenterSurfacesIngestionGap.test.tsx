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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
    '@/hooks/useUnansweredOutboundAlerts',
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

const { NotificationCenter } = await import('../NotificationCenter');

type CenterProps = ComponentProps<typeof NotificationCenter>;

const slaProp: CenterProps['sla'] = {
  notifications: [],
  total: 0,
  unreadCount: 0,
  fetchError: false,
  onlyAssignedToMe: false,
  setOnlyMine: vi.fn(),
  clearAll: vi.fn(),
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
    </MemoryRouter>,
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
};

beforeEach(() => {
  gapAlerts = [];
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

  it('renders the backend title rather than one hardcoded headline', () => {
    gapAlerts = [
      { ...tacoGap, id: 9003, title: 'Mail may be missing — a totally new cause we added later', cause: 'brand_new_cause', minutesAhead: null },
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
