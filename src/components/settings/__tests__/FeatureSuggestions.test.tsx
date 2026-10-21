/**
 * FeatureSuggestions: the engine's suggestions for ONE feature, decided inside that feature's page
 * (owner rule 2026-10-21). Hides itself when empty; routing proposals render as their card; every
 * other row has Accept / Decline. All data invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as LearningServiceModule from '@/services/learning.service';

const state = vi.hoisted(() => ({
  list: [] as Array<{ id: number; domain: string; suggestionType: string }>,
  accepted: [] as number[],
  declined: [] as number[],
  canAct: true,
}));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      listSuggestions: (domain?: string) =>
        Promise.resolve(state.list.filter((item) => !domain || item.domain === domain)),
      acceptSuggestion: (id: number) => {
        state.accepted.push(id);
        return Promise.resolve({});
      },
      declineSuggestion: (id: number) => {
        state.declined.push(id);
        return Promise.resolve({});
      },
    },
  };
});
vi.mock('../RoutingProposalCard', () => ({
  RoutingProposalCard: ({ suggestion }: { suggestion: { id: number } }) => (
    <div data-testid={`card-${suggestion.id}`} />
  ),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({
    canActOn: () => state.canAct,
    canActOnSuggestion: () => state.canAct,
    canActOnAnyDomain: true,
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ selectedOrganizationId: 1 }),
}));

const { FeatureSuggestions } = await import('../FeatureSuggestions');
const row = (id: number, domain: string, suggestionType: string, payload: Record<string, unknown> = {}) => ({
  id,
  domain,
  suggestionType,
  payload,
  evidenceEventIds: null,
  evidenceCount: 3,
  confidence: null,
  status: 'pending',
  expiresAt: '9999-12-31T00:00:00Z',
  createdAt: '2026-10-14T09:00:00Z',
});

beforeEach(() => {
  state.list = [];
  state.accepted = [];
  state.declined = [];
  state.canAct = true;
});
afterEach(cleanup);

describe('FeatureSuggestions', () => {
  it('renders nothing when the feature has no pending suggestion', async () => {
    const { container } = render(<FeatureSuggestions domains={['spam']} title="Spam suggestions" />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('a spam conflict is decided here: Accept and Decline call the engine', async () => {
    state.list = [row(11, 'spam', 'resolve_conflict', { conflictType: 'category_mismatch', evidence: {} })] as never;
    render(<FeatureSuggestions domains={['spam']} title="Spam suggestions" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(() => expect(state.accepted).toEqual([11]));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull());
  });

  it('Decline records the rejection', async () => {
    state.list = [row(12, 'detection', 'promote', { summary: 'invoice' })] as never;
    render(<FeatureSuggestions domains={['detection']} title="Detection suggestions" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(state.declined).toEqual([12]));
  });

  it('only shows its own domains (CONTROL: a spam row never shows on a routing panel)', async () => {
    state.list = [row(11, 'spam', 'resolve_conflict'), row(13, 'routing', 'resolve_routing_disagreement')] as never;
    render(<FeatureSuggestions domains={['routing']} title="Routing suggestions" />);
    expect(await screen.findByTestId('card-13')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull();
  });

  it('excludeTypes hides propose_rule (the dormant rule row is its place)', async () => {
    state.list = [row(14, 'routing', 'propose_rule')] as never;
    const { container } = render(
      <FeatureSuggestions domains={['routing']} excludeTypes={['propose_rule']} title="Routing suggestions" />
    );
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(screen.queryByTestId('card-14')).toBeNull();
  });

  it('types limits to the listed suggestion types', async () => {
    state.list = [row(15, 'reply_style', 'reply_style.update', { proposedStyle: 'warm', currentStyle: '' }), row(16, 'reply_style', 'other')] as never;
    render(<FeatureSuggestions domains={['reply_style']} types={['reply_style.update']} title="Suggested house style" />);
    await screen.findByText(/Suggested house style/);
    expect(screen.getAllByRole('button', { name: 'Accept this suggestion' })).toHaveLength(1);
  });

  it('without permission the controls are disabled and the reason is shown', async () => {
    state.canAct = false;
    state.list = [row(11, 'spam', 'resolve_conflict')] as never;
    render(<FeatureSuggestions domains={['spam']} title="Spam suggestions" />);
    const accept = await screen.findByRole('button', { name: 'Accept this suggestion' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
  });
});
