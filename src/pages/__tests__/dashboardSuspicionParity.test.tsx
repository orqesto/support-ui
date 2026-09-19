/**
 * #756 made suspicion a MARK rather than a lane: the board stopped pinning
 * `excludeSuspicious` into Open / In Progress / Awaiting, so a suspicious thread now sits in
 * its work column wearing a badge. The dashboard was not changed with it and kept
 * `excludeSuspicious: 'true'` on the Client Replied and Awaiting Response counts.
 *
 * That is not a cosmetic drift, because both cards are CLICKABLE: each one navigates to the
 * message list for the same view. The card showed one number and the page it opened showed a
 * larger one, with nothing saying why — the two surfaces disagreeing about what they count.
 *
 * So the assertion is on the request the page makes, not on a rendered figure: no dashboard
 * count may narrow by suspicion, because no list it links to narrows by suspicion.
 *
 * ⚠️ This closes the SUSPICION axis only, and deliberately claims nothing wider. The cards
 * still send `excludeNotAnalysed` while `useMessagesData` sends the bare view, so card and
 * list continue to differ on the not-analysed axis. This PR neither introduces nor fixes
 * that; when it arrived was not established, and it is NOT verified against the backend's
 * own definition of these views — whether `view=client_replied` already drops unanalysed
 * rows server-side is unchecked.
 *
 * ⛔ The negative control matters more than the positive one here. `excludeNotAnalysed` must
 * SURVIVE on both cards — it is a different exclusion with a live column behind it, and a
 * blanket "strip the filters" edit would take it too and quietly inflate both numbers.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

type ThreadFilters = Record<string, unknown>;

const emptyPage = {
  success: true,
  data: [],
  pagination: { total: 0, page: 1, limit: 1, totalPages: 0 },
};
const getThreads = vi.fn((_filters: ThreadFilters) => Promise.resolve(emptyPage));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads } }));
vi.mock('@/services/sla.service', () => ({
  slaService: { getSummary: () => Promise.resolve(null) },
}));
vi.mock('@/services/ticket.service', () => ({
  ticketService: { getAll: () => Promise.resolve({ success: true, pagination: { total: 0 } }) },
}));
vi.mock('@/services/kb.service', () => ({
  kbService: { getAll: () => Promise.resolve({ success: true, pagination: { total: 0 } }) },
}));
vi.mock('@/services/documentation.service', () => ({
  documentationService: { getStats: () => Promise.resolve({ success: true, data: {} }) },
}));
vi.mock('@/services/ingestion.service', () => ({ ingestionService: {} }));
vi.mock('@/services/integrations.service', () => ({ integrationsService: {} }));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'ctx' }));
vi.mock('@/hooks/useEmailProcessing', () => ({ useEmailProcessing: () => ({}) }));
vi.mock('@/hooks/useSystemHealth', () => ({ useSystemHealth: () => ({}) }));
vi.mock('@/hooks/useTelegramProcessing', () => ({ useTelegramProcessing: () => ({}) }));
vi.mock('@/stores/messagesStore', () => ({ useMessagesStore: () => ({}) }));

const { DashboardPage } = await import('../DashboardPage');

const requestedFilters = (): ThreadFilters[] =>
  getThreads.mock.calls.map(([filters]) => filters ?? {});

const filtersFor = (view: string): ThreadFilters[] =>
  requestedFilters().filter((filters) => filters.view === view);

describe('dashboard counts do not narrow by suspicion', () => {
  beforeEach(async () => {
    cleanup();
    getThreads.mockClear();
    render(<DashboardPage />);
    await waitFor(() => expect(getThreads.mock.calls.length).toBeGreaterThan(0));
  });

  it('asks for no count with excludeSuspicious', () => {
    const offenders = requestedFilters().filter((filters) => 'excludeSuspicious' in filters);
    expect(offenders).toEqual([]);
  });

  it.each(['client_replied', 'awaiting_response'])('does not narrow %s by suspicion', (view) => {
    const matched = filtersFor(view);
    expect(matched).toHaveLength(1);
    expect(matched[0].excludeSuspicious).toBeUndefined();
  });

  it.each(['client_replied', 'awaiting_response'])('still excludes not-analysed on %s', (view) => {
    const matched = filtersFor(view);
    expect(matched).toHaveLength(1);
    expect(matched[0].excludeNotAnalysed).toBe('true');
  });

  it('still counts the Suspicious card itself', () => {
    // Suspicion stopped being a lane on the board; it is still a figure worth showing.
    expect(filtersFor('suspicious')).toHaveLength(1);
  });
});
