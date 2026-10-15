/**
 * Engine Activity routing proposal cards (spec 2026-10-14 §4.3): propose_rule, the disagreement
 * pick and the one-time "Keep this learned rule?" review. Fixtures are invented (Northwind-style
 * names, no real workspace data).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  LearningSuggestion,
  ProposalDepartmentEvidence,
  ReplaySummary,
  RoutingProposalEvidence,
} from '@/services/learning.service';
import { handleResponseError } from '@/lib/api-client';

const calls = vi.hoisted(() => ({
  accept: [] as unknown[][],
  decline: [] as unknown[][],
  update: [] as unknown[][],
}));
// Plain functions swapped per test (never a module-level vi.fn rejection — vitest 4 fails on it).
const impl = vi.hoisted(() => ({
  accept: async (): Promise<void> => {},
  update: async (): Promise<void> => {},
  evidence: null as unknown,
}));

vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    learningService: {
      getSuggestionEvidence: () =>
        Promise.resolve({ evidence: [], ruleA: null, ruleB: null, proposal: impl.evidence }),
      acceptSuggestion: async (...args: unknown[]) => {
        calls.accept.push(args);
        await impl.accept();
      },
      declineSuggestion: (...args: unknown[]) => {
        calls.decline.push(args);
        return Promise.resolve();
      },
    },
  };
});
vi.mock('@/services/routingRule.service', () => ({
  routingRuleService: {
    update: async (...args: unknown[]) => {
      calls.update.push(args);
      await impl.update();
      return { success: true };
    },
  },
}));

const { RoutingProposalCard, replayLine, supportLine } = await import('../RoutingProposalCard');

/** What a caller really catches: the api-client interceptor's rejection of an axios 409. */
const real409 = async (message: string): Promise<unknown> =>
  handleResponseError({
    isAxiosError: true,
    message: 'Request failed with status code 409',
    config: { method: 'post', url: '/api/learning/suggestions/77/accept', headers: {} },
    response: { status: 409, data: { success: false, error: message }, headers: {}, config: {} },
  }).catch((err: unknown) => err);

const names: Record<number, string> = { 1: 'Support', 2: 'Sales' };
const deptNameById = (id: number) => names[id];
const replay = (over: Partial<ReplaySummary> = {}): ReplaySummary => ({
  matches: 14,
  inDepartment: 13,
  ratio: 13 / 14,
  lookbackDays: 30,
  at: '2026-10-14T09:00:00Z',
  skipped: 0,
  truncated: false,
  recommendation: 'recommended',
  ...over,
});
const dept = (over: Partial<ProposalDepartmentEvidence> = {}): ProposalDepartmentEvidence => ({
  departmentId: 1,
  ruleId: 10,
  supportCount: 3,
  agents: 2,
  firstAt: '2026-10-05T09:00:00Z',
  lastAt: '2026-10-14T09:00:00Z',
  conversations: [
    {
      conversationId: 5,
      publicId: 'SUP-5',
      subject: 'Pallet label missing',
      departmentId: 1,
      routedBy: { id: 9, name: 'Anna Weber' },
      routedAt: '2026-10-14T09:00:00Z',
    },
  ],
  redactedCount: 1,
  contradictions: [{ departmentId: 2, count: 2 }],
  replay: replay(),
  warnOverlap: null,
  ...over,
});
const evidence = (over: Partial<RoutingProposalEvidence> = {}): RoutingProposalEvidence => ({
  kind: 'propose_rule',
  departments: [dept()],
  autoAccept: { mode: 'manual', eligibleInBalanced: true },
  ...over,
});
const suggestion = (suggestionType: string, payload: Record<string, unknown>): LearningSuggestion => ({
  id: 77,
  domain: 'routing',
  suggestionType,
  payload,
  evidenceEventIds: [1, 2, 3],
  evidenceCount: 3,
  confidence: null,
  status: 'pending',
  expiresAt: '9999-12-31T00:00:00Z',
  createdAt: '2026-10-14T09:00:00Z',
});
const PROPOSE = suggestion('propose_rule', {
  ruleId: 10,
  siblingRuleId: null,
  departmentId: 1,
  ruleType: 'body_contains',
  value: 'pallet label',
  groupId: 10,
  summary: 'Route mail mentioning "pallet label" in the message to Support',
});
const DISAGREE = suggestion('resolve_routing_disagreement', {
  groupId: 10,
  value: 'crate',
  ruleType: 'body_contains',
  options: [
    { departmentId: 1, ruleId: 10, siblingRuleId: null, supportCount: 2 },
    { departmentId: 2, ruleId: 11, siblingRuleId: null, supportCount: 1 },
  ],
});
const CONFIRM = suggestion('confirm_learned_rule', {
  ruleId: 10,
  departmentId: 1,
  ruleType: 'body_contains',
  value: 'loading dock',
});

const props = { deptNameById, canAct: true, onDone: vi.fn(), onError: vi.fn(), onStale: vi.fn() };
const renderCard = (card: LearningSuggestion, over: Partial<typeof props> = {}) =>
  render(
    <MemoryRouter>
      <RoutingProposalCard suggestion={card} {...props} {...over} />
    </MemoryRouter>
  );
const evidenceLoaded = () => screen.findByText(/^Routed there by your team/);

beforeEach(() => {
  calls.accept = [];
  calls.decline = [];
  calls.update = [];
  impl.accept = async () => {};
  impl.update = async () => {};
  impl.evidence = evidence();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('helpers', () => {
  it('replayLine: estimate with share, no share without a ratio, "at least" when capped, skipped rows named', () => {
    expect(replayLine(replay(), 'Support')).toBe(
      'Would have matched 14 conversations in the last 30 days; 13 went to Support (93 %)'
    );
    expect(replayLine(replay({ ratio: null, matches: 0, inDepartment: 0 }), 'Support')).toBe(
      'Would have matched no conversations in the last 30 days'
    );
    expect(replayLine(replay({ truncated: true, matches: 2000, inDepartment: 1900, ratio: 0.95 }), 'Support')).toBe(
      'Would have matched at least 2000 conversations in the last 30 days; 1900 went to Support (95 %)'
    );
    expect(replayLine(replay({ skipped: 2 }), 'Support')).toBe(
      'Would have matched 14 conversations in the last 30 days; 13 went to Support (93 %); 2 could not be checked'
    );
    expect(replayLine(replay({ ratio: null }), 'Support')).toBe(
      'Would have matched 14 conversations in the last 30 days; 13 went to Support'
    );
  });

  it('supportLine: span only when both ends are known; a weighted count is never shown as a fraction', () => {
    expect(supportLine(dept())).toBe('Routed there by your team 3 times — 2 agents over 9 days');
    expect(supportLine(dept({ firstAt: null }))).toBe('Routed there by your team 3 times — 2 agents');
    expect(supportLine(dept({ lastAt: null, agents: 0 }))).toBe('Routed there by your team 3 times');
    expect(supportLine(dept({ supportCount: 1, agents: 1, lastAt: '2026-10-05T10:00:00Z' }))).toBe(
      'Routed there by your team 1 time — 1 agent over 1 day'
    );
    expect(supportLine(dept({ supportCount: 2.25 }))).toBe(
      'Routed there by your team about 2 times — 2 agents over 9 days'
    );
  });
});

describe('propose_rule card', () => {
  it('says what, how often, by whom, the estimate and the badge', async () => {
    renderCard(PROPOSE);
    expect(screen.getByText('Route mail mentioning "pallet label" in the message to Support')).toBeTruthy();
    expect(await screen.findByText('Routed there by your team 3 times — 2 agents over 9 days')).toBeTruthy();
    expect(
      screen.getByText('Would have matched 14 conversations in the last 30 days; 13 went to Support (93 %)')
    ).toBeTruthy();
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByText('also routed to Sales ×2')).toBeTruthy();
    expect(screen.getByText('Would be accepted automatically in Balanced mode')).toBeTruthy();
    expect(screen.getByRole('link', { name: /SUP-5 · Pallet label missing/ }).getAttribute('href')).toBe('/messages/5');
    const day = new Date('2026-10-14T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    expect(screen.getByText(`— Anna Weber, ${day}`)).toBeTruthy();
    expect(screen.getByText('+1 in departments you can’t see')).toBeTruthy();
  });

  it('never renders a date it does not have (no "Invalid Date", no epoch)', async () => {
    impl.evidence = evidence({
      departments: [
        dept({
          firstAt: null,
          lastAt: null,
          conversations: [
            { conversationId: 6, publicId: null, subject: null, departmentId: 1, routedBy: null, routedAt: null },
            { conversationId: 7, publicId: 'SUP-7', subject: 'Crate dented', departmentId: 1, routedBy: { id: 9, name: 'Anna Weber' }, routedAt: null },
          ],
          replay: replay({ at: null }),
        }),
      ],
    });
    const { container } = renderCard(PROPOSE);
    expect(await screen.findByText('Routed there by your team 3 times — 2 agents')).toBeTruthy();
    expect(screen.getByRole('link', { name: '#6 · (no subject)' })).toBeTruthy();
    // A row with a name but no time names the person only.
    expect(screen.getByText('— Anna Weber')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Invalid Date|1970|NaN/);
  });

  it('no badge without a recommendation; "at least" when the replay was capped', async () => {
    impl.evidence = evidence({
      departments: [dept({ replay: replay({ truncated: true, recommendation: null }) })],
    });
    renderCard(PROPOSE);
    expect(
      await screen.findByText('Would have matched at least 14 conversations in the last 30 days; 13 went to Support (93 %)')
    ).toBeTruthy();
    expect(screen.queryByText('Recommended')).toBeNull();
    expect(screen.queryByText('Review')).toBeNull();
    expect(screen.queryByText('Not recommended')).toBeNull();
  });

  it('the badge names the replay’s own recommendation', async () => {
    impl.evidence = evidence({ departments: [dept({ replay: replay({ recommendation: 'review' }) })] });
    renderCard(PROPOSE);
    expect(await screen.findByText('Review')).toBeTruthy();
    expect(screen.queryByText('Recommended')).toBeNull();
    cleanup();
    impl.evidence = evidence({ departments: [dept({ replay: replay({ recommendation: 'not_recommended' }) })] });
    renderCard(PROPOSE);
    expect(await screen.findByText('Not recommended')).toBeTruthy();
  });

  it('shows the department warn-band overlap, labelled as of proposal time', async () => {
    impl.evidence = evidence({
      departments: [dept({ warnOverlap: { ruleId: 40, departmentId: 2, similarity: 0.83 } })],
    });
    renderCard(PROPOSE);
    expect(
      await screen.findByText(
        'At proposal time: similar to an active rule in Sales (83 % similar). Accept checks again.'
      )
    ).toBeTruthy();
  });

  it('auto-accept readiness only in Manual mode and only when the bars are met', async () => {
    impl.evidence = evidence({ autoAccept: { mode: 'manual', eligibleInBalanced: false } });
    renderCard(PROPOSE);
    await evidenceLoaded();
    expect(screen.queryByText('Would be accepted automatically in Balanced mode')).toBeNull();
    cleanup();
    impl.evidence = evidence({ autoAccept: { mode: 'balanced', eligibleInBalanced: true } });
    renderCard(PROPOSE);
    await evidenceLoaded();
    expect(screen.queryByText('Would be accepted automatically in Balanced mode')).toBeNull();
  });

  it('an older backend (no proposal evidence) still shows the card and its actions', async () => {
    impl.evidence = null;
    renderCard(PROPOSE);
    expect(screen.getByText('Route mail mentioning "pallet label" in the message to Support')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy());
    expect(screen.queryByText(/^Routed there by your team/)).toBeNull();
  });

  it('Accept accepts once (double click) and reports done', async () => {
    renderCard(PROPOSE);
    const button = screen.getByRole('button', { name: 'Accept' });
    // Both clicks in one batch: no re-render (so no disabled button) between them.
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith(77));
    expect(calls.accept).toEqual([[77]]);
  });

  it('a 409 shows the server message and asks the list to reload', async () => {
    const err = await real409('This suggestion was already decided.');
    // The interceptor's own shape: a fresh Error with status/data copied, `.response` gone.
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status: 409, data: { success: false, error: 'This suggestion was already decided.' } });
    expect((err as { response?: unknown }).response).toBeUndefined();
    impl.accept = () => Promise.reject(err as Error);
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith('This suggestion was already decided.'));
    expect(props.onStale).toHaveBeenCalled();
    expect(props.onDone).not.toHaveBeenCalled();
  });

  it('a non-409 failure reports the error but does not reload the list', async () => {
    impl.accept = () => Promise.reject(new Error('Network Error'));
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith('That did not work. Please try again.'));
    expect(props.onStale).not.toHaveBeenCalled();
    expect(props.onDone).not.toHaveBeenCalled();
    // The card can be tried again.
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveProperty('disabled', false);
  });

  it('Decline takes an optional reason', async () => {
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: '  too broad ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));
    await waitFor(() => expect(calls.decline).toEqual([[77, 'too broad']]));
    expect(props.onDone).toHaveBeenCalledWith(77);
  });

  it('Decline with no reason sends none', async () => {
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));
    await waitFor(() => expect(calls.decline).toEqual([[77, undefined]]));
  });

  it('Edit saves the rule (never moving its department) then accepts', async () => {
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: ' pallet labels ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() => expect(calls.accept).toEqual([[77]]));
    expect(calls.update).toEqual([[10, { value: 'pallet labels', type: 'body_contains' }]]);
  });

  it('Edit of a subject/body pair sends ONE PATCH (anchor only, no type)', async () => {
    renderCard(suggestion('propose_rule', { ...PROPOSE.payload, siblingRuleId: 12 }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Where to look')).toBeNull();
    fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: 'pallet labels' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() => expect(calls.accept).toEqual([[77]]));
    expect(calls.update).toEqual([[10, { value: 'pallet labels' }]]);
  });

  it('a 409 on a pair edit shows the message, goes stale and sends no second request', async () => {
    const err = await real409('Pair keywords changed');
    impl.update = () => Promise.reject(err as Error);
    renderCard(suggestion('propose_rule', { ...PROPOSE.payload, siblingRuleId: 12 }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith('Pair keywords changed'));
    expect(props.onStale).toHaveBeenCalled();
    expect(calls.update).toHaveLength(1);
    expect(calls.accept).toEqual([]);
  });

  it('a refused edit does not accept', async () => {
    const err = await real409('Editing this rule would duplicate another rule with the same type and value in this department');
    impl.update = () => Promise.reject(err as Error);
    renderCard(PROPOSE);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and accept' }));
    await waitFor(() =>
      expect(props.onError).toHaveBeenCalledWith(
        'Editing this rule would duplicate another rule with the same type and value in this department'
      )
    );
    expect(calls.accept).toEqual([]);
  });

  it('without permission every action is disabled', async () => {
    renderCard(PROPOSE, { canAct: false });
    await evidenceLoaded();
    for (const name of ['Accept', 'Edit', 'Decline']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
  });
});

describe('disagreement card', () => {
  it('lists each department with its evidence and picks one or Neither', async () => {
    impl.evidence = evidence({
      kind: 'resolve_routing_disagreement',
      departments: [dept(), dept({ departmentId: 2, ruleId: 11, supportCount: 1, agents: 1, conversations: [], contradictions: [], redactedCount: 0 })],
      autoAccept: { mode: 'manual', eligibleInBalanced: true },
    });
    renderCard(DISAGREE);
    expect(screen.getByText('Agents disagree where "crate" mail goes')).toBeTruthy();
    expect(screen.getByText('Support — 2 conversations')).toBeTruthy();
    expect(screen.getByText('Sales — 1 conversation')).toBeTruthy();
    expect(await screen.findByText('Routed there by your team 1 time — 1 agent over 9 days')).toBeTruthy();
    // A disagreement is never auto-accepted, whatever the evidence says.
    expect(screen.queryByText('Would be accepted automatically in Balanced mode')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    await waitFor(() => expect(calls.accept).toEqual([[77, { departmentId: 2 }]]));
    cleanup();
    renderCard(DISAGREE);
    fireEvent.click(screen.getByRole('button', { name: 'Neither' }));
    await waitFor(() => expect(calls.decline).toEqual([[77, undefined]]));
  });
});

describe('confirm_learned_rule card', () => {
  it('Keep accepts, Switch off declines, never an auto-accept line', async () => {
    impl.evidence = evidence({ kind: 'confirm_learned_rule' });
    renderCard(CONFIRM);
    expect(screen.getByText('Keep this learned rule?')).toBeTruthy();
    expect(
      screen.getByText('Mail mentioning "loading dock" in the message routes to Support. It keeps routing until you decide.')
    ).toBeTruthy();
    await evidenceLoaded();
    expect(screen.queryByText('Would be accepted automatically in Balanced mode')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(calls.accept).toEqual([[77]]));
    fireEvent.click(screen.getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(calls.decline).toEqual([[77, undefined]]));
  });
});
