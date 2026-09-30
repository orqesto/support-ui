/**
 * F1 (KB consolidation #873): the learning inbox must not offer its generic one-click Accept for
 * a KB merge — the backend refuses a body-less accept (400), and a merge must be READ first. It
 * offers "Review", which opens the side-by-side review in the row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

let orgId = 21;
const listSuggestions = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/learning.service', () => ({
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

  it('reloads the list after a decision and keeps saying what happened (L4)', async () => {
    render(
      <MemoryRouter>
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    await screen.findByText('consolidate of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    listSuggestions.mockResolvedValue([rows[1]]);
    fireEvent.click(screen.getByRole('button', { name: 'FAKE DECIDE' }));
    await waitFor(() => expect(listSuggestions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('consolidate of 3')).not.toBeInTheDocument());
    // The decided row left the list; what came of it did not vanish with it.
    expect(screen.getByText('OUTCOME declined')).toBeInTheDocument();
  });

  it("a workspace switch drops the last merge's outcome — it belongs to the other workspace", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    await screen.findByText('consolidate of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'FAKE DECIDE' }));
    expect(await screen.findByText('OUTCOME declined')).toBeInTheDocument();
    orgId = 22;
    rerender(
      <MemoryRouter>
        <LearningSuggestionsSettings />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByText('OUTCOME declined')).not.toBeInTheDocument());
  });
});
