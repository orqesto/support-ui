/**
 * Learning activity only SHOWS what the engine found: a suggestion that has a home in a feature
 * page links there ("Decide in <feature>") and has no Accept / Decline / Review; one with no home
 * stays decidable here under "Not yet in a feature page". All data invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type * as LearningServiceModule from '@/services/learning.service';

const rows = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return { ...actual, learningService: { listSuggestions: () => Promise.resolve(rows.list) } };
});
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({ canActOn: () => true, canActOnSuggestion: () => true, canActOnAnyDomain: true }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ selectedOrganizationId: 1 }),
}));
vi.mock('../KbMergeInboxParts', () => ({
  summarizeKbMerge: () => 'Merge two entries',
  summarizeKbQuality: () => 'Review one entry',
}));

const { LearningSuggestionsSettings } = await import('../LearningSuggestionsSettings');
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
const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search + loc.hash}</div>;
};
const renderIt = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <LearningSuggestionsSettings />
      <Where />
    </MemoryRouter>
  );

beforeEach(() => {
  rows.list = [];
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('Learning activity', () => {
  it('a routing row links to Routing Rules and carries no decide button', async () => {
    rows.list = [row(1, 'routing', 'resolve_routing_disagreement', { options: [] })];
    renderIt();
    const link = await screen.findByRole('button', { name: /Decide in Routing Rules/ });
    expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    fireEvent.click(link);
    expect(screen.getByTestId('where').textContent).toBe('/settings#rules/routing');
  });

  it('KB rows, spam, detection, reply style and auto-reply each link to their home', async () => {
    rows.list = [
      row(2, 'kb_review', 'kb_review.capture', { question: 'q' }),
      row(3, 'kb_quality', 'entry_review', {}),
      row(4, 'spam', 'resolve_conflict', {}),
      row(5, 'detection', 'promote', {}),
      row(6, 'reply_style', 'reply_style.update', {}),
      row(7, 'auto_reply', 'x', {}),
    ];
    renderIt();
    await screen.findAllByRole('button', { name: /Decide in/ });
    for (const name of ['Knowledge Base', 'Spam Rules', 'Detection Rules', 'AI Prompts', 'Auto-Reply']) {
      expect(screen.getAllByRole('button', { name: new RegExp(`Decide in ${name}`) }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('an unmapped row stays decidable under "Not yet in a feature page"', async () => {
    rows.list = [row(9, 'categorization', 'adjust_threshold', { from: 0.5, to: 0.7 })];
    renderIt();
    expect(await screen.findByText(/Not yet in a feature page/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept this suggestion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Decide in/ })).toBeNull();
  });
});
