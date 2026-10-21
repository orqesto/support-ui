/**
 * KB merges and fixes are decided in the one Knowledge Base list (F2): Learning activity only shows
 * them and links there — no one-click Accept (the backend refuses a body-less accept), no Review.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type * as LearningServiceModule from '@/services/learning.service';

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

let orgId = 21;
const listSuggestions = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/learning.service', async (importOriginal) => ({
  ...(await importOriginal<typeof LearningServiceModule>()),
  learningService: {
    listSuggestions: () => listSuggestions(),
    acceptSuggestion: vi.fn(),
    declineSuggestion: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: orgId }),
}));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({
    canActOnSuggestion: () => true,
    canActOnAnyDomain: true,
  }),
}));
vi.mock('@/components/kb/KbConsolidationReview', () => ({
  KbConsolidationReview: ({
    suggestionId,
    onDecided,
  }: {
    suggestionId: number;
    onDecided?: (outcome: unknown) => void;
  }) => (
    <>
      <p>REVIEW OF {suggestionId}</p>
      <button type="button" onClick={() => onDecided?.({ kind: 'declined', type: 'consolidate' })}>
        FAKE DECIDE
      </button>
    </>
  ),
  KbConsolidationOutcomeNotice: ({ outcome }: { outcome: { kind: string } }) => (
    <p>OUTCOME {outcome.kind}</p>
  ),
  summarizeKbMerge: (payload: { memberIds: number[] }, type: string) =>
    `${type} of ${payload.memberIds.length}`,
}));

const { LearningSuggestionsSettings } = await import('../LearningSuggestionsSettings');

const rows = [
  suggestion(1, 'kb_quality', 'consolidate', { label: 'refund', memberIds: [4, 5, 6] }),
  suggestion(2, 'routing', 'add_rule', { value: 'invoice', ruleType: 'keyword' }),
];
beforeEach(() => {
  orgId = 21;
  listSuggestions.mockReset();
  listSuggestions.mockResolvedValue(rows);
});
afterEach(cleanup);

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
};

describe('learning inbox — KB merge rows', () => {
  it('links a merge, a fix and a capture to the Knowledge Base list', async () => {
    listSuggestions.mockResolvedValue([
      suggestion(1, 'kb_quality', 'consolidate', { label: 'refund', memberIds: [4, 5, 6] }),
      suggestion(3, 'kb_review', 'approve', {}),
    ]);
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LearningSuggestionsSettings />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('consolidate of 3');
    const links = screen.getAllByRole('button', { name: /Decide in Knowledge Base/ });
    expect(links).toHaveLength(2);
    fireEvent.click(links[0]);
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/knowledge-base?status=suggested_change'
    );
  });

  it('decides nothing here: no Review, no Accept for a merge; the routing row links to its page', async () => {
    render(
      <MemoryRouter>
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    expect(await screen.findByText('consolidate of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull();
    expect(screen.getByRole('button', { name: /Decide in Routing Rules/ })).toBeInTheDocument();
  });
});
