/**
 * F1 (KB consolidation #873): the learning inbox must not offer its generic one-click Accept for
 * a KB merge — the backend refuses a body-less accept (400), and a merge must be READ first. It
 * offers "Review", which opens the side-by-side review in the row.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const suggestion = (id: number, domain: string, suggestionType: string, payload = {}) => ({
  id,
  domain,
  suggestionType,
  status: 'pending',
  payload,
  evidenceEventIds: null,
  evidenceCount: 1,
  confidence: null,
  createdAt: '2026-09-19T09:00:00.000Z',
  expiresAt: '2026-10-19T09:00:00.000Z',
});

vi.mock('@/services/learning.service', () => ({
  learningService: {
    listSuggestions: () =>
      Promise.resolve([
        suggestion(1, 'kb_quality', 'consolidate', { label: 'refund', memberIds: [4, 5, 6] }),
        suggestion(2, 'routing', 'add_rule', { value: 'invoice', ruleType: 'keyword' }),
      ]),
    acceptSuggestion: vi.fn(),
    declineSuggestion: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ selectedOrganizationId: 21 }),
}));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({
    canActOnSuggestion: () => true,
    canActOnAnyDomain: true,
  }),
}));
vi.mock('@/components/kb/KbConsolidationReview', () => ({
  KbConsolidationReview: ({ suggestionId }: { suggestionId: number }) => (
    <p>REVIEW OF {suggestionId}</p>
  ),
  summarizeKbMerge: (payload: { memberIds: number[] }, type: string) =>
    `${type} of ${payload.memberIds.length}`,
}));

const { LearningSuggestionsSettings } = await import('../LearningSuggestionsSettings');

afterEach(cleanup);

describe('learning inbox — KB merge rows', () => {
  it('offers Review, not Accept, for a merge; other rows keep Accept', async () => {
    render(
      <MemoryRouter>
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    expect(await screen.findByText('consolidate of 3')).toBeInTheDocument();
    // Exactly one Accept — the routing row's.
    expect(screen.getAllByRole('button', { name: 'Accept this suggestion' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('REVIEW OF 1')).toBeInTheDocument();
  });
});
