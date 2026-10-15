import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Invented data only. Rules 6/7 are a learned subject/body pair (different keywords); rule 8 is the
// same pattern proposed in another department, which Accept declines (BE acceptRuleFromRulesPage).
const state = vi.hoisted(() => ({
  updates: [] as unknown[][],
  lists: 0,
  failNext: null as null | { status: number; message: string },
  toasts: [] as string[],
}));
const base = {
  exampleText: null,
  weight: 4,
  tier: 'specific',
  lastMatchedAt: null,
  matchCount: 0,
  createdAt: '2026-10-14T09:00:00Z',
};
const RULES = [
  {
    ...base,
    id: 1,
    departmentId: 1,
    type: 'body_contains',
    value: 'pallet label',
    enabled: false,
    provisional: true,
    lifecycle: 'proposed',
    metadata: { provenance: 'fast_path', proposal: { suggestionId: 55 } },
  },
  {
    ...base,
    id: 2,
    departmentId: 1,
    type: 'body_contains',
    value: 'crate',
    enabled: false,
    provisional: true,
    lifecycle: 'declined',
    metadata: { provenance: 'fast_path', declineReason: 'too broad' },
  },
  {
    ...base,
    id: 3,
    departmentId: 1,
    type: 'body_contains',
    value: 'loading dock',
    enabled: true,
    provisional: false,
    lifecycle: 'active',
    metadata: { provenance: 'admin_confirmed', adminConfirmedAt: '2026-10-14T09:00:00Z' },
  },
  {
    ...base,
    id: 4,
    departmentId: 1,
    type: 'subject_contains',
    value: 'invoice',
    enabled: true,
    provisional: false,
    metadata: { provenance: 'admin_added' },
  },
  {
    ...base,
    id: 5,
    departmentId: 1,
    type: 'body_contains',
    value: 'old idea',
    enabled: false,
    provisional: true,
    lifecycle: 'archived',
    metadata: { provenance: 'fast_path' },
  },
  {
    ...base,
    id: 6,
    departmentId: 2,
    type: 'body_contains',
    value: 'forklift',
    enabled: false,
    provisional: true,
    lifecycle: 'proposed',
    metadata: {
      provenance: 'fast_path',
      siblingRuleId: 7,
      proposal: { role: 'anchor', groupId: 6, suggestionId: 77 },
    },
  },
  {
    ...base,
    id: 7,
    departmentId: 2,
    type: 'subject_contains',
    value: 'warehouse',
    enabled: false,
    provisional: true,
    lifecycle: 'proposed',
    metadata: {
      provenance: 'fast_path',
      siblingRuleId: 6,
      proposal: { role: 'sibling', anchorRuleId: 6 },
    },
  },
  {
    ...base,
    id: 8,
    departmentId: 3,
    type: 'body_contains',
    value: 'forklift',
    enabled: false,
    provisional: true,
    lifecycle: 'proposed',
    metadata: { provenance: 'fast_path', proposal: { role: 'anchor', groupId: 6 } },
  },
];
vi.mock('@/services/routingRule.service', () => ({
  ROUTING_RULE_TYPES: [
    'subject_contains',
    'subject_regex',
    'sender_email',
    'sender_domain',
    'body_contains',
    'header_match',
  ],
  routingRuleService: {
    list: () => {
      state.lists += 1;
      return Promise.resolve({ success: true, data: RULES });
    },
    update: (...args: unknown[]) => {
      state.updates.push(args);
      const fail = state.failNext;
      if (fail) {
        state.failNext = null;
        // The api-client interceptor shape: an Error carrying status + the BE envelope.
        return Promise.reject(
          Object.assign(new Error(fail.message), {
            status: fail.status,
            data: { success: false, error: fail.message },
          })
        );
      }
      return Promise.resolve({
        success: true,
        data: { ...RULES[0], enabled: true, lifecycle: 'active' },
      });
    },
    create: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: () =>
      Promise.resolve([
        { id: 1, name: 'Support', active: true },
        { id: 2, name: 'Logistics', active: true },
        { id: 3, name: 'Billing', active: true },
      ]),
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/lib/toast', () => ({
  toast: {
    failure: (scope: string, err: unknown) => {
      state.toasts.push(`${scope}: ${err instanceof Error ? err.message : String(err)}`);
    },
    success: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warning: () => undefined,
  },
}));

const { RoutingRulesSettings } = await import('../RoutingRulesSettings');
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <RoutingRulesSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
afterEach(() => {
  cleanup();
  state.updates = [];
  state.lists = 0;
  state.failNext = null;
  state.toasts = [];
});

/** The desktop row (the table) that shows this pattern. */
const rowOf = (pattern: string) => {
  const cell = screen.getAllByText(pattern).find((node) => node.closest('tr'));
  const row = cell?.closest('tr');
  if (!row) throw new Error(`no row for ${pattern}`);
  return within(row as HTMLElement);
};

describe('Rules page lifecycle', () => {
  it('counts each state; All hides archived; a rule without lifecycle (older backend) is manual', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /All \(7\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Manual \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Learned \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Proposed \(4\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Declined \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Archived \(1\)/ })).toBeTruthy();
  });

  it('Archived lists only the archived rule; Manual lists the rule with no lifecycle', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Archived \(1\)/ }));
    expect(screen.getAllByText('old idea').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('invoice')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Manual \(1\)/ }));
    expect(screen.getAllByText('invoice').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('old idea')).toHaveLength(0);
  });

  it('badges: Proposed links to its card, Declined shows the reason, accepted is Learned · Approved', async () => {
    renderPage();
    await screen.findAllByText('pallet label');
    const proposed = rowOf('pallet label').getByRole('link', { name: 'Proposed' });
    expect(proposed.getAttribute('href')).toBe('/settings?focus=55#ai/learning');
    expect(rowOf('crate').getByText('Declined')).toBeTruthy();
    expect(screen.getAllByTitle('too broad').length).toBeGreaterThan(0);
    expect(rowOf('loading dock').getByText('Learned · Approved')).toBeTruthy();
    expect(rowOf('loading dock').queryByText('Learned')).toBeNull();
    expect(rowOf('invoice').queryByText(/Learned/)).toBeNull();
  });

  it('a sibling (no suggestionId of its own) links to its anchor’s card', async () => {
    renderPage();
    await screen.findAllByText('warehouse');
    const proposed = rowOf('warehouse').getByRole('link', { name: 'Proposed' });
    expect(proposed.getAttribute('href')).toBe('/settings?focus=77#ai/learning');
  });

  it('switching on a proposed rule asks first; confirming sends enabled:true', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Proposed \(4\)/ }));
    fireEvent.click(rowOf('pallet label').getByRole('button', { name: /Inactive/ }));
    expect(await screen.findByText(/This accepts the proposal/)).toBeTruthy();
    expect(screen.getByText('Accept this proposal?')).toBeTruthy();
    expect(screen.getByText(/Its card in Engine Activity is closed/)).toBeTruthy();
    expect(state.updates).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(state.updates).toEqual([[1, { enabled: true }]]));
  });

  it('cancelling the confirm sends nothing', async () => {
    renderPage();
    await screen.findAllByText('crate');
    fireEvent.click(rowOf('crate').getByRole('button', { name: /Inactive/ }));
    expect(await screen.findByText('Bring back this declined rule?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Bring back this declined rule?')).toBeNull());
    expect(state.updates).toHaveLength(0);
  });

  it('the confirm names the pair rule that turns on with it and the department whose proposal is declined', async () => {
    renderPage();
    await screen.findAllByText('warehouse');
    fireEvent.click(rowOf('warehouse').getByRole('button', { name: /Inactive/ }));
    const text = await screen.findByText(/This accepts the proposal/);
    expect(text.textContent).toContain(
      'Its pair rule, body contains “forklift”, is switched on with it.'
    );
    expect(text.textContent).toContain('The proposal for this pattern in Billing is declined.');
  });

  it('switching an active rule off does not ask', async () => {
    renderPage();
    await screen.findAllByText('invoice');
    fireEvent.click(rowOf('invoice').getByRole('button', { name: /Active/ }));
    await waitFor(() => expect(state.updates).toEqual([[4, { enabled: false }]]));
    expect(screen.queryByText(/This accepts the proposal/)).toBeNull();
  });

  it('a 409 from Accept is shown and the list is re-read', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Archived \(1\)/ }));
    fireEvent.click(rowOf('old idea').getByRole('button', { name: /Inactive/ }));
    expect(await screen.findByText('Bring back this archived rule?')).toBeTruthy();
    const listsBefore = state.lists;
    state.failNext = {
      status: 409,
      message: 'Another department already routes this pattern (rule #9). Resolve that rule first.',
    };
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(state.lists).toBeGreaterThan(listsBefore));
    expect(state.toasts).toEqual([
      'accept the proposed rule: Another department already routes this pattern (rule #9). Resolve that rule first.',
    ]);
  });

  it('a 409 after an edit that switched a proposed rule on re-reads the rule (the edit was saved)', async () => {
    renderPage();
    await screen.findAllByText('pallet label');
    fireEvent.click(rowOf('pallet label').getByRole('button', { name: 'Edit rule' }));
    fireEvent.click(await screen.findByLabelText('Enabled'));
    expect(screen.getByText(/Saving with Enabled on accepts the proposal/)).toBeTruthy();
    const listsBefore = state.lists;
    state.failNext = {
      status: 409,
      message:
        'Another department’s proposal for this pattern is waiting in Engine Activity. Decide that card first.',
    };
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(state.toasts).toHaveLength(1));
    expect(state.toasts[0]).toContain('Decide that card first.');
    await waitFor(() => expect(state.lists).toBeGreaterThan(listsBefore));
    expect(state.updates[0]?.[1]).toMatchObject({ enabled: true, value: 'pallet label' });
  });
});
