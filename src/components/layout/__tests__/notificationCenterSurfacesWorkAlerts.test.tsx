import type { ComponentProps } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let workAlerts: Array<Record<string, unknown>> = [];
const dismiss = vi.fn();
const openAlert = vi.fn();
const workRefresh = vi.fn();
const workClearAll = vi.fn(() => Promise.resolve());
const workMarkAllRead = vi.fn();
const slaClearAll = vi.fn(() => Promise.resolve());
let workTotal: number | null = null;
vi.mock('@/hooks/useWorkAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useWorkAlerts');
  return {
    ...actual,
    useWorkAlerts: () => ({
      alerts: workAlerts,
      total: workTotal ?? workAlerts.length,
      unread: workAlerts.filter((alert) => !alert.isRead).length,
      dismiss,
      open: openAlert,
      refresh: workRefresh,
      clearAll: workClearAll,
      markAllRead: workMarkAllRead,
    }),
  };
});
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
// Everything else the bell pulls in — silenced so this test is about one thing.
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
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

// The daily-token-limit hook polls /api/notifications on mount; unmocked, jsdom would send a
// real request from every bell render here (audit F11).
vi.mock('@/hooks/useTokenLimitAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useTokenLimitAlerts');
  return {
    ...actual,
    useTokenLimitAlerts: () => ({ alerts: [], badged: 0, dismiss: () => {}, refresh: () => {} }),
  };
});

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
  clearAll: () => slaClearAll(),
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
  showLearning: false,
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
    </MemoryRouter>
  );
  // The panel is behind the bell button.
  const bell = screen.getAllByRole('button')[0];
  fireEvent.click(bell);
};

const assigned = {
  id: 1,
  kind: 'conversation_assigned',
  entityType: 'conversation',
  entityId: 50,
  subject: 'Refund',
  actorLabel: 'Anna Agent',
  departmentName: 'Support',
  isRead: false,
};
const unassigned = {
  id: 2,
  kind: 'new_unassigned_message',
  entityType: 'conversation',
  entityId: 51,
  subject: 'Order',
  actorLabel: 'New mail',
  departmentName: 'Support',
  isRead: true,
};

beforeEach(() => {
  workAlerts = [];
  workTotal = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('the bell renders work alerts (#957 §3.7)', () => {
  it('shows both texts verbatim', () => {
    workAlerts = [assigned, unassigned];
    open();
    expect(screen.getByText('Assigned to you by Anna Agent — Refund')).toBeTruthy();
    expect(screen.getByText('New unassigned message in Support — Order')).toBeTruthy();
  });

  it('clicking an entry opens the conversation and marks it read', () => {
    workAlerts = [assigned];
    open();
    fireEvent.click(screen.getByText('Assigned to you by Anna Agent — Refund'));
    expect(screen.getByTestId('loc').textContent).toBe('/messages/50');
    expect(openAlert).toHaveBeenCalledWith(assigned);
  });

  it('a ticket entry opens the ticket', () => {
    workAlerts = [{ ...assigned, entityType: 'ticket', entityId: 9 }];
    open();
    fireEvent.click(screen.getByText('Assigned to you by Anna Agent — Refund'));
    expect(screen.getByTestId('loc').textContent).toBe('/tickets/9');
  });

  it('dismiss calls the personal dismiss', () => {
    workAlerts = [assigned];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Assigned to you by Anna Agent — Refund' }));
    expect(dismiss).toHaveBeenCalledWith(1);
  });

  it('CONTROL: no alerts => no section', () => {
    open();
    expect(screen.queryByText(/Assigned to you by/)).toBeNull();
  });

  it('audit FE: "Clear all" shows for work alerts alone, clears them per user and re-reads them', async () => {
    workAlerts = [assigned];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(workClearAll).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(workRefresh).toHaveBeenCalled());
  });

  it('audit FE: opening the bell marks unread work alerts read (the SLA read-all no longer reaches them)', () => {
    workAlerts = [assigned];
    open();
    expect(workMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: opening the bell with only read work alerts marks nothing', () => {
    workAlerts = [unassigned];
    open();
    expect(workMarkAllRead).not.toHaveBeenCalled();
  });

  it('final review: work-only "Clear all" does NOT send the unfiltered dismiss-all (it would dismiss the whole team\'s workspace alerts)', () => {
    workAlerts = [assigned];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(slaClearAll).not.toHaveBeenCalled();
    expect(workClearAll).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: with SLA rows "Clear all" still sends the SLA dismiss-all', () => {
    workAlerts = [assigned];
    slaProp.notifications = [
      {
        id: 501,
        kind: 'sla_breach',
        title: 'SLA breach',
        message: 'First response overdue',
        severity: 'warning',
        isRead: false,
        createdAt: new Date().toISOString(),
        details: {},
      } as never,
    ];
    try {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
      expect(slaClearAll).toHaveBeenCalledTimes(1);
      expect(workClearAll).toHaveBeenCalledTimes(1);
    } finally {
      slaProp.notifications = [];
    }
  });

  it('final review: the row has one accessible name — its visible sentence', () => {
    workAlerts = [assigned];
    open();
    expect(
      screen.getByRole('button', { name: 'Assigned to you by Anna Agent — Refund' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assigned to you' })).toBeNull();
  });

  it('final review: "+N more" uses the server total, not the loaded rows', () => {
    workAlerts = [1, 2, 3, 4, 5, 6].map((id) => ({ ...assigned, id }));
    workTotal = 20;
    open();
    expect(screen.getByText('+15 more not listed here')).toBeTruthy();
  });
});
