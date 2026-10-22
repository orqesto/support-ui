/**
 * Learning activity (was Engine Activity; routing cards now live in Routing Rules, see
 * FeatureSuggestions.test): promote rows show the engine's summary,
 * the empty state says when proposals appear, and `?focus=<id>` (the bell's deep link) opens and
 * scrolls to that suggestion. All data invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type * as LearningServiceModule from '@/services/learning.service';

const rows = vi.hoisted(() => ({ list: [] as unknown[], loads: 0, canAct: true, canRoute: true }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      listSuggestions: () => {
        rows.loads += 1;
        return Promise.resolve(rows.list);
      },
    },
  };
});
vi.mock('../RoutingProposalCard', () => ({
  RoutingProposalCard: ({
    suggestion,
    canAct,
    onDone,
    onStale,
    onError,
  }: {
    suggestion: { id: number };
    canAct: boolean;
    onDone: (id: number) => void;
    onStale: () => void;
    onError: (message: string) => void;
  }) => (
    <div data-testid={`card-${suggestion.id}`} data-can-act={String(canAct)}>
      <button type="button" onClick={() => onDone(suggestion.id)}>DONE {suggestion.id}</button>
      <button type="button" onClick={() => onStale()}>STALE {suggestion.id}</button>
      <button type="button" onClick={() => onError('This suggestion was already decided.')}>FAIL {suggestion.id}</button>
    </div>
  ),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({
    canActOn: (domain: string) => domain === 'routing' && rows.canRoute,
    canActOnSuggestion: () => rows.canAct,
    canActOnAnyDomain: true,
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ selectedOrganizationId: 1 }),
}));
vi.mock('../KbMergeInboxParts', () => ({
  summarizeKbMerge: () => '',
  summarizeKbQuality: () => '',
}));

const { LearningSuggestionsSettings } = await import('../LearningSuggestionsSettings');
const row = (id: number, suggestionType: string, payload: Record<string, unknown>) => ({
  id,
  domain: 'routing',
  suggestionType,
  payload,
  evidenceEventIds: null,
  evidenceCount: 3,
  confidence: null,
  status: 'pending',
  expiresAt: '9999-12-31T00:00:00Z',
  createdAt: '2026-10-14T09:00:00Z',
});
// A domain with no feature page yet (so it is decided in Learning activity).
const conflict = (id: number) =>
  ({ ...row(id, 'resolve_conflict', { ruleAId: 41, ruleBId: 42, conflictType: 'some_other_conflict', evidence: {} }), domain: 'categorization' });
const renderAt = (url = '/settings') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <LearningSuggestionsSettings />
    </MemoryRouter>
  );

const scrollIntoView = vi.fn();
beforeEach(() => {
  rows.list = [];
  rows.loads = 0;
  rows.canAct = true;
  rows.canRoute = true;
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(cleanup);

describe('Learning activity', () => {
  it('empty state says when proposals appear', async () => {
    renderAt();
    expect(
      await screen.findByText('No proposals yet — they appear after people in your workspace route similar mail a few times.')
    ).toBeTruthy();
    expect(screen.queryByText('No pending suggestions.')).toBeNull();
  });

  it('without Manage Routing Rules the empty state does not mention routing', async () => {
    rows.canRoute = false;
    renderAt();
    expect(await screen.findByText('No suggestions yet — they appear as people in your workspace work through mail.')).toBeTruthy();
    expect(screen.queryByText(/routes similar mail/)).toBeNull();
  });

  it('promote shows the engine summary, not "Promote provisional rule"', async () => {
    rows.list = [
      { ...row(6, 'promote', { ruleId: 3, ruleTable: 'routing_rules', summary: 'subject_contains="invoice" → team 2' }), domain: 'kb_quality' },
    ];
    renderAt();
    expect(await screen.findByText('Promote: subject_contains="invoice" → team 2')).toBeTruthy();
    expect(screen.queryByText('Promote provisional rule')).toBeNull();
  });

  it('the Accept tooltip on a promote row says the rule becomes permanent; other types keep theirs', async () => {
    rows.list = [
      { ...row(6, 'promote', { ruleId: 3, ruleTable: 'routing_rules', summary: 's' }), domain: 'kb_quality' },
      conflict(9),
    ];
    renderAt();
    await screen.findByText('Promote: s');
    const titles = screen.getAllByRole('button', { name: 'Accept this suggestion' }).map((btn) => btn.getAttribute('title'));
    expect(titles).toContain('Accept — makes this rule permanent');
    expect(titles).toContain('Accept');
  });

  it('a routing-domain promote row is shown with a link to Routing Rules, not a proposal card', async () => {
    rows.list = [row(6, 'promote', { ruleId: 3, ruleTable: 'routing_rules', summary: 's' })];
    renderAt();
    expect(await screen.findByText('Promote: s')).toBeTruthy();
    expect(screen.queryByTestId('card-6')).toBeNull();
    expect(screen.getByRole('button', { name: /Decide in Routing Rules/ })).toBeTruthy();
  });

  it('promote without a summary keeps the old fallback', async () => {
    rows.list = [{ ...row(6, 'promote', { ruleId: 3, ruleTable: 'routing_rules' }), domain: 'kb_quality' }];
    renderAt();
    expect(await screen.findByText('Promote provisional rule')).toBeTruthy();
  });

  it('?focus=<id> opens that suggestion and scrolls its row into view', async () => {
    rows.list = [conflict(8), conflict(9)];
    renderAt('/settings?focus=8');
    const focused = await screen.findByText('Rule A ID');
    // Opened: the detail panel is inside row 8, and row 9 stays closed (one Rule A ID on screen).
    const row8 = document.querySelector('[data-suggestion-id="8"]') as HTMLElement;
    expect(row8.contains(focused)).toBe(true);
    expect(within(row8).getByText('41')).toBeTruthy();
    expect(screen.getAllByText('Rule A ID')).toHaveLength(1);
    // Scrolled: scrollIntoView ran on row 8 itself.
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(row8);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('a new ?focus=<id> while mounted (8 to 9) opens and scrolls row 9', async () => {
    rows.list = [conflict(8), conflict(9)];
    let go: (to: string) => void = () => {};
    const Nav = () => {
      go = useNavigate();
      return null;
    };
    render(
      <MemoryRouter initialEntries={['/settings?focus=8']}>
        <Nav />
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    await screen.findByText('Rule A ID');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    act(() => go('/settings?focus=9'));
    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    expect(scrollIntoView.mock.contexts[1]).toBe(document.querySelector('[data-suggestion-id="9"]'));
    const row9 = document.querySelector('[data-suggestion-id="9"]') as HTMLElement;
    expect(within(row9).getByText('Rule A ID')).toBeTruthy();
  });

  it('?focus=<id> scrolls to a row that is decided elsewhere too', async () => {
    rows.list = [conflict(9), row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 })];
    renderAt('/settings?focus=5');
    await screen.findByRole('button', { name: /Decide in Routing Rules/ });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.querySelector('[data-suggestion-id="5"]'));
  });

  it('control: no focus (or an unknown id) opens nothing and scrolls nowhere', async () => {
    rows.list = [conflict(8)];
    renderAt('/settings?focus=99');
    await screen.findByText(/Resolve conflict/);
    expect(screen.queryByText('Rule A ID')).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('a reload after the focus does not scroll back to it', async () => {
    rows.list = [conflict(8), row(7, 'confirm_learned_rule', { ruleId: 2, value: 'loading dock', ruleType: 'body_contains', departmentId: 1 })];
    renderAt('/settings?focus=8');
    await screen.findByText('Rule A ID');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    rows.list = [conflict(8)];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
      await Promise.resolve();
    });
    expect(rows.loads).toBe(2);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
