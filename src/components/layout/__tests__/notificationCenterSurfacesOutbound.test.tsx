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
import { MemoryRouter } from 'react-router-dom';

let outboundAlerts: Array<Record<string, unknown>> = [];

vi.mock('@/hooks/useUnansweredOutboundAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/hooks/useUnansweredOutboundAlerts',
  );
  return {
    ...actual,
    useUnansweredOutboundAlerts: () => ({
      alerts: outboundAlerts,
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

// `sla` and `learning` arrive as PROPS, not hooks — the parent owns them. Typed off the
// component's own prop types so a change to either shape fails here rather than silently.
type CenterProps = ComponentProps<typeof NotificationCenter>;

const slaProp: CenterProps['sla'] = {
  notifications: [],
  unreadCount: 0,
  total: 0,
  onlyAssignedToMe: false,
  setOnlyAssignedToMe: vi.fn(),
  fetchError: false,
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  refresh: vi.fn(),
} as unknown as CenterProps['sla'];

const learningProp: CenterProps['learning'] = {
  isOrgAdmin: false,
  notifications: [],
  suggestions: [],
  unreadCount: 0,
  refresh: vi.fn(),
} as unknown as CenterProps['learning'];

const open = () => {
  render(
    <MemoryRouter>
      <NotificationCenter sla={slaProp} learning={learningProp} />
    </MemoryRouter>,
  );
  // The panel is behind the bell button.
  const bell = screen.getAllByRole('button')[0];
  fireEvent.click(bell);
};

beforeEach(() => {
  outboundAlerts = [];
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

  it('renders nothing for it when there are no alerts', () => {
    // Control: proves the rows above come from the alerts, not from static markup.
    open();
    expect(screen.queryByText('No customer message in this thread')).toBeNull();
    expect(screen.queryByText('Customer replies were filed as spam')).toBeNull();
  });
});
