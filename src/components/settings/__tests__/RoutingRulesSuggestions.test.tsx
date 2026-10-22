/**
 * Routing Rules decides the engine's routing suggestions in place — except a propose_rule, which
 * is decided by switching its dormant rule row on (unchanged). Invented data.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import type * as LearningServiceModule from '@/services/learning.service';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/routingRule.service', () => ({
  ROUTING_RULE_TYPES: ['subject_contains', 'subject_regex', 'sender_email', 'sender_domain', 'body_contains', 'header_match'],
  routingRuleService: { list: () => Promise.resolve({ success: true, data: [] }) },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: (_inactive?: boolean, onTeamsMode?: (on: boolean) => void) => {
      onTeamsMode?.(true);
      return Promise.resolve([{ id: 1, name: 'Support', active: true }]);
    },
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('../RoutingProposalCard', () => ({
  RoutingProposalCard: ({ suggestion: pick }: { suggestion: { id: number } }) => (
    <div>
      <div data-testid={`card-${pick.id}`} />
      <button type="button">Accept</button>
      <button type="button">Decline</button>
    </div>
  ),
}));

const pending = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      listSuggestions: (domain?: string) =>
        Promise.resolve((pending.list as Array<{ domain: string }>).filter((item) => !domain || item.domain === domain)),
    },
  };
});
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({ canActOn: () => true, canActOnSuggestion: () => true, canActOnAnyDomain: true }),
}));
const suggestion = (id: number, domain: string, suggestionType: string, payload: Record<string, unknown> = {}) => ({
  id, domain, suggestionType, payload, evidenceEventIds: null, evidenceCount: 3, confidence: null,
  status: 'pending', expiresAt: '9999-12-31T00:00:00Z', createdAt: '2026-10-14T09:00:00Z',
});

import { RoutingRulesSettings } from '../RoutingRulesSettings';

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <RoutingRulesSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
beforeEach(() => { pending.list = []; });
afterEach(cleanup);

describe('Routing Rules › Suggestions', () => {
  it('a pending resolve_routing_disagreement shows a card with Accept / Decline', async () => {
    pending.list = [suggestion(71, 'routing', 'resolve_routing_disagreement', { options: [] })];
    renderPage();
    expect(await screen.findByTestId('card-71')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  });
  it('a pending propose_rule gets NO card here — the dormant rule row is the place', async () => {
    pending.list = [suggestion(72, 'routing', 'propose_rule', { ruleId: 1 })];
    renderPage();
    await screen.findByText('Default team');
    expect(screen.queryByTestId('card-72')).toBeNull();
  });
});
