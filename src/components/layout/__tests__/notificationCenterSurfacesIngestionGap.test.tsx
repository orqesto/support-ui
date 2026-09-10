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
    expect(screen.getByText(/Mail may be missing — Gmail-usetixly@gmail.com/)).toBeTruthy();
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
   * A cause that is not skew carries NO `minutesAhead`. The sentence must stay true rather
   * than rendering "null minutes in the future" — the same class of defect as "nullm over",
   * one field along.
   */
  it('stays truthful when the cause is not clock skew and no skew figure exists', () => {
    gapAlerts = [
      { ...tacoGap, id: 9001, cause: 'source_stopped_polling', minutesAhead: null, window: null },
    ];
    open();
    expect(screen.getByText(/sync position was wrong/)).toBeTruthy();
    expect(screen.queryByText(/null/)).toBeNull();
    expect(screen.queryByText(/in the future\./)).toBeNull();
  });

  /** Zero is a real value the hook deliberately preserves; the prose must still read. */
  it('does not say "0 minutes in the future" when the skew rounds to nothing', () => {
    gapAlerts = [{ ...tacoGap, id: 9002, minutesAhead: 0 }];
    open();
    expect(screen.queryByText(/0 minutes in the future/)).toBeNull();
    expect(screen.getByText(/sync position was wrong/)).toBeTruthy();
  });

  it('is absent from the panel when there is no gap', () => {
    gapAlerts = [];
    open();
    expect(screen.queryByText(/Mail may be missing/)).toBeNull();
  });
});
