/**
 * Bell rows for a routing manager (spec 4.6): a proposal row shows the BE summary and opens
 * Engine Activity on THAT card (/settings?focus=<id>#ai/learning); an auto-accept row shows the BE
 * summary and opens the learning page where its Undo lives. A viewer without the permission
 * (showLearning false) sees no learning section even if rows were left in state.
 */
import type { ComponentProps } from 'react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
vi.mock('@/hooks/useTokenLimitAlerts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useTokenLimitAlerts');
  return {
    ...actual,
    useTokenLimitAlerts: () => ({ alerts: [], badged: 0, dismiss: () => {}, refresh: () => {} }),
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

const learningProp = (overrides: Partial<CenterProps['learning']>): CenterProps['learning'] => ({
  notifications: [],
  suggestions: [],
  unreadCount: 0,
  fetchError: false,
  isOrgAdmin: false,
  showLearning: true,
  markAllRead: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
});

const proposal: CenterProps['learning']['suggestions'][number] = {
  id: 77,
  domain: 'routing',
  suggestionType: 'propose_rule',
  status: 'pending',
  payload: { summary: 'Route "invoice overdue" in the subject to Billing' },
  evidenceCount: 4,
  confidence: null,
  createdAt: '2026-10-14T09:00:00Z',
  expiresAt: '9999-12-31T00:00:00Z',
  evidenceEventIds: [1, 2, 3, 4],
};

const autoAccept: CenterProps['learning']['notifications'][number] = {
  id: 5,
  organizationId: 1,
  domain: 'routing',
  actionType: 'auto_accept',
  ruleTable: 'routing_rules',
  ruleId: 41,
  summary: 'Switched on: "invoice overdue" in the subject routes to Billing',
  evidence: {},
  undoAvailableUntil: '2026-10-24T09:00:00Z',
  createdAt: '2026-10-14T09:00:00Z',
};

const LocationProbe = () => {
  const loc = useLocation();
  return <span data-testid="loc">{`${loc.pathname}${loc.search}${loc.hash}`}</span>;
};

const open = (learning: CenterProps['learning']) => {
  render(
    <MemoryRouter>
      <NotificationCenter sla={slaProp} learning={learning} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getAllByRole('button')[0]);
};

afterEach(() => cleanup());

describe('NotificationCenter for routing managers', () => {
  it('a proposal row shows the BE summary and opens that card in Engine Activity', () => {
    open(learningProp({ suggestions: [proposal], unreadCount: 1 }));
    fireEvent.click(screen.getByText('Route "invoice overdue" in the subject to Billing'));
    expect(screen.getByTestId('loc').textContent).toBe('/settings?focus=77#ai/learning');
  });

  it('an auto-accept row shows the BE summary and opens the learning page', () => {
    open(learningProp({ notifications: [autoAccept], unreadCount: 1 }));
    fireEvent.click(
      screen.getByText('Switched on: "invoice overdue" in the subject routes to Billing')
    );
    expect(screen.getByTestId('loc').textContent).toBe('/settings#ai/learning');
  });

  it('shows no learning section when showLearning is false, even with rows in state', () => {
    open(
      learningProp({ showLearning: false, suggestions: [proposal], notifications: [autoAccept] })
    );
    expect(screen.queryByText(/Pending suggestions/)).toBeNull();
    expect(screen.queryByText(/Auto-actions/)).toBeNull();
  });
});
