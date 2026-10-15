/**
 * Engine Activity with routing proposals (T24): proposal rows render as RoutingProposalCard (wired
 * to remove on decision and quietly reload on a stale 409), promote rows show the engine's summary,
 * the empty state says when proposals appear, and `?focus=<id>` (the bell's deep link) opens and
 * scrolls to that suggestion. All data invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as LearningServiceModule from '@/services/learning.service';

const rows = vi.hoisted(() => ({ list: [] as unknown[], loads: 0, canAct: true }));
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
  useSuggestionDomainAccess: () => ({ canActOnSuggestion: () => rows.canAct, canActOnAnyDomain: true }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ selectedOrganizationId: 1 }),
}));
vi.mock('../KbMergeInboxParts', () => ({
  KbMergeInboxReview: () => null,
  KbMergeOutcomeBanner: () => null,
  KbQualityInboxReview: () => null,
  summarizeKbMerge: () => '',
  summarizeKbQuality: () => '',
  useKbMergeOutcome: () => ({ outcome: null, onDecided: () => {} }),
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
const conflict = (id: number) =>
  row(id, 'resolve_conflict', { ruleAId: 41, ruleBId: 42, conflictType: 'some_other_conflict', evidence: {} });
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
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(cleanup);

describe('Engine Activity with routing proposals', () => {
  it('empty state says when proposals appear', async () => {
    renderAt();
    expect(
      await screen.findByText('No proposals yet — they appear after your team routes similar mail a few times.')
    ).toBeTruthy();
    expect(screen.queryByText('No pending suggestions.')).toBeNull();
  });

  it('each routing proposal type renders as its card; other routing rows do not', async () => {
    rows.list = [
      row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 }),
      row(6, 'resolve_routing_disagreement', { options: [] }),
      row(7, 'confirm_learned_rule', { ruleId: 2, value: 'loading dock', ruleType: 'body_contains', departmentId: 1 }),
      conflict(9),
    ];
    renderAt();
    expect(await screen.findByTestId('card-5')).toBeTruthy();
    expect(screen.getByTestId('card-6')).toBeTruthy();
    expect(screen.getByTestId('card-7')).toBeTruthy();
    expect(screen.queryByTestId('card-9')).toBeNull();
    // The card is passed canAct; it sits in a row that carries its id (the focus target).
    expect(screen.getByTestId('card-5').getAttribute('data-can-act')).toBe('true');
    expect(screen.getByTestId('card-5').closest('[data-suggestion-id="5"]')).toBeTruthy();
  });

  it('without the permission the card gets canAct=false and the reason is shown', async () => {
    rows.canAct = false;
    rows.list = [row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 })];
    renderAt();
    expect((await screen.findByTestId('card-5')).getAttribute('data-can-act')).toBe('false');
    expect(screen.getByText('You do not have permission to change this kind of rule. Ask an admin.')).toBeTruthy();
  });

  it('a decided card leaves the list; a stale card reloads the list without the spinner; errors show', async () => {
    rows.list = [
      row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 }),
      row(7, 'confirm_learned_rule', { ruleId: 2, value: 'loading dock', ruleType: 'body_contains', departmentId: 1 }),
    ];
    renderAt();
    await screen.findByTestId('card-5');
    fireEvent.click(screen.getByText('DONE 5'));
    expect(screen.queryByTestId('card-5')).toBeNull();
    expect(screen.getByTestId('card-7')).toBeTruthy();

    expect(rows.loads).toBe(1);
    rows.list = [];
    await act(async () => {
      fireEvent.click(screen.getByText('STALE 7'));
      await Promise.resolve();
    });
    expect(rows.loads).toBe(2);
    expect(screen.queryByText('Loading suggestions…')).toBeNull();
    expect(
      await screen.findByText('No proposals yet — they appear after your team routes similar mail a few times.')
    ).toBeTruthy();
  });

  it('a card error is shown above the list', async () => {
    rows.list = [row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 })];
    renderAt();
    fireEvent.click(await screen.findByText('FAIL 5'));
    expect(screen.getByText('This suggestion was already decided.')).toBeTruthy();
  });

  it('promote shows the engine summary, not "Promote provisional rule"', async () => {
    rows.list = [
      { ...row(6, 'promote', { ruleId: 3, ruleTable: 'routing_rules', summary: 'subject_contains="invoice" → dept 2' }), domain: 'kb_quality' },
    ];
    renderAt();
    expect(await screen.findByText('Promote: subject_contains="invoice" → dept 2')).toBeTruthy();
    expect(screen.queryByText('Promote provisional rule')).toBeNull();
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

  it('?focus=<id> scrolls to a proposal card row', async () => {
    rows.list = [conflict(9), row(5, 'propose_rule', { ruleId: 1, value: 'pallet label', ruleType: 'body_contains', departmentId: 1 })];
    renderAt('/settings?focus=5');
    await screen.findByTestId('card-5');
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
      fireEvent.click(screen.getByText('STALE 7'));
      await Promise.resolve();
    });
    expect(rows.loads).toBe(2);
    expect(screen.queryByTestId('card-7')).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
