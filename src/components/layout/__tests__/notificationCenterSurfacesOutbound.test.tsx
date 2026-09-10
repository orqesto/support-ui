/**
 * The Notification Center must actually RENDER the unanswered-outbound alerts.
 *
 * ⛔ This test exists because of a real near-miss. The hook and the `NON_SLA_BELL_KINDS`
 * exclusion were added in one commit and the hook was wired to nothing — so the two kinds
 * were dropped from the SLA bell (correctly) and rendered by nobody (not correctly). Net
 * effect: the notifications existed in the database and in `/api/notifications` and reached
 * the user on ZERO surfaces. That is strictly worse than before the change, when the
 * fail-open filter at least showed them as ugly blank amber rows.
 *
 * The whole point of this feature is "a notification, not a page nobody opens". A hook with
 * no consumer is a page nobody opens, with extra steps. So: render the real component and
 * look for the row.
 */
import type { ComponentProps } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let outboundAlerts: Array<Record<string, unknown>> = [];

let outboundTruncated = false;

vi.mock('@/hooks/useUnansweredOutboundAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/hooks/useUnansweredOutboundAlerts',
  );
  return {
    ...actual,
    useUnansweredOutboundAlerts: () => ({
      alerts: outboundAlerts,
      truncated: outboundTruncated,
      dismiss: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

// Everything else the bell pulls in — silenced so this test is about one thing.
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

const { NotificationCenter } = await import('../NotificationCenter');

// `sla` and `learning` arrive as PROPS, not hooks — the parent owns them.
//
// ⛔ Typed WITHOUT a cast, deliberately. An earlier version of this file used
// `as unknown as CenterProps['sla']` while claiming in a comment that the fixtures were
// typed off the component's props — the cast made that claim false, and the fixture was in
// fact missing `setOnlyMine`, `clearAll` and `dismiss` while inventing two fields that do
// not exist. Renaming a field on the hook would have left this green. No casts: the
// type-checker covers `src`, so the fixtures now fail compilation if either shape changes.
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

/** Renders the current path so navigation can be asserted, not assumed. */
const LocationProbe = () => <span data-testid="loc">{useLocation().pathname}</span>;

const open = () => {
  render(
    <MemoryRouter>
      <NotificationCenter sla={slaProp} learning={learningProp} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  // The panel is behind the bell button.
  const bell = screen.getAllByRole('button')[0];
  fireEvent.click(bell);
};

const oneSided = (id: number) => ({
  id,
  kind: 'one_sided_outbound',
  entityId: 10000 + id,
  recovered: null,
});
const spam = (id: number) => ({
  id,
  kind: 'customer_reply_in_spam',
  entityId: 30 + id,
  recovered: 1,
});

beforeEach(() => {
  outboundAlerts = [];
  outboundTruncated = false;
});
afterEach(() => cleanup());

describe('NotificationCenter — unanswered outbound', () => {
  it('renders a one-sided outbound alert', () => {
    outboundAlerts = [
      { id: 1, kind: 'one_sided_outbound', entityId: 11822, recovered: null },
    ];
    open();
    expect(screen.getByText('No customer message in this thread')).toBeTruthy();
  });

  it('renders a spam-recovery alert with its count', () => {
    outboundAlerts = [
      { id: 2, kind: 'customer_reply_in_spam', entityId: 34, recovered: 3 },
    ];
    open();
    expect(screen.getByText('Customer replies were filed as spam')).toBeTruthy();
    expect(screen.getByText(/3 recovered/)).toBeTruthy();
  });

  it('opens the actual conversation, in the right id space', () => {
    // This repo has shipped a dead link from exactly this class of mistake before (the KB
    // `?id=` vs `?docId=` collision, still commented in the sibling section). `entityId` for
    // one_sided_outbound is a conversation id, and /messages/:id resolves it — assert it
    // rather than trusting the string.
    outboundAlerts = [
      { id: 1, kind: 'one_sided_outbound', entityId: 11822, recovered: null },
    ];
    open();
    fireEvent.click(screen.getByText('Open thread'));
    expect(screen.getByTestId('loc').textContent).toBe('/messages/11822');
  });

  it('counts the alerts in the bell badge, so it is not a panel nobody opens', () => {
    // The whole feature exists because a surface you must remember to look at does not get
    // looked at. A silent bell is that same failure one step further in.
    outboundAlerts = [
      { id: 1, kind: 'one_sided_outbound', entityId: 11822, recovered: null },
      { id: 2, kind: 'customer_reply_in_spam', entityId: 34, recovered: 3 },
    ];
    render(
      <MemoryRouter>
        <NotificationCenter sla={slaProp} learning={learningProp} />
      </MemoryRouter>,
    );
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('caps the section and says how many are not shown', () => {
    // The cap exists because this panel is one scroller and an uncapped section pushes the SLA
    // breaches out of sight. Neither the cap nor the overflow copy had any test.
    outboundAlerts = [1, 2, 3, 4, 5, 6, 7].map(oneSided);
    open();
    expect(screen.getAllByText('No customer message in this thread')).toHaveLength(5);
    expect(screen.getByText(/\+2 not shown/)).toBeTruthy();
  });

  it('hedges the count when the API says its own list was truncated', () => {
    // `/api/notifications` returns the newest 20 of ALL kinds. When it reports hasMore, the
    // alerts we hold are a subset and any count from them is a floor — stating a precise
    // number would be the same over-claim this section already had to correct once.
    outboundAlerts = [1, 2, 3, 4, 5, 6].map(oneSided);
    outboundTruncated = true;
    open();
    expect(screen.getByText(/\+1 or more not shown/)).toBeTruthy();
  });

  it('never says "+0" when nothing is hidden but the API capped its own list', () => {
    // Observed on the taco client box, 2026-09-10, v1.1.268: CoreSarms held 3 one-sided
    // alerts — all three visible — while `/api/notifications` reported hasMore, because that
    // endpoint caps at 20 rows across ALL kinds and the workspace had 20 (13 of them SLA
    // breaches). The panel rendered "+0 or more not shown".
    //
    // "+0" reads as a broken counter, and the sentence tells the operator to go looking for
    // rows that, as far as this section knows, do not exist. The cap is still worth saying —
    // the alerts held here really are a floor — but not as a count of zero.
    outboundAlerts = [1, 2, 3].map(oneSided);
    outboundTruncated = true;
    open();
    // Both halves matter: asserting only the new copy would pass while "+0" also rendered.
    expect(screen.queryByText(/\+0/)).toBeNull();
    expect(screen.getByText(/There may be more/)).toBeTruthy();
  });

  it('never lets spam alerts take every visible slot', () => {
    // Fault-first ordering, unchecked, is the mirror image of the starvation it fixed: with
    // five spam alerts every visible row is spam and every one-sided thread is hidden.
    outboundAlerts = [...[1, 2, 3, 4, 5, 6].map(spam), ...[7, 8].map(oneSided)];
    open();
    expect(screen.getAllByText('Customer replies were filed as spam')).toHaveLength(3);
    expect(screen.getAllByText('No customer message in this thread')).toHaveLength(2);
  });

  it('renders nothing for it when there are no alerts', () => {
    // Control: proves the rows above come from the alerts, not from static markup.
    open();
    expect(screen.queryByText('No customer message in this thread')).toBeNull();
    expect(screen.queryByText('Customer replies were filed as spam')).toBeNull();
  });
});
