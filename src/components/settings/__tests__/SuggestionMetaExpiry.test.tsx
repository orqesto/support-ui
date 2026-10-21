import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SuggestionMeta } from '../KbReviewSuggestionDetail';
import type { LearningSuggestion } from '@/services/learning.service';

const suggestion = (over: Partial<LearningSuggestion>): LearningSuggestion => ({
  id: 1,
  domain: 'kb_quality',
  suggestionType: 'entry_review',
  payload: {},
  evidenceEventIds: null,
  evidenceCount: 2,
  confidence: '0.9',
  status: 'pending',
  expiresAt: '2026-11-04T09:00:00.000Z',
  createdAt: '2026-10-21T09:00:00.000Z',
  ...over,
});

describe('the expiry on a suggestion row', () => {
  it('shows the date for a suggestion that lapses (control)', () => {
    render(<SuggestionMeta suggestion={suggestion({})} confidence={90} />);
    expect(screen.getByText(/Expires:/)).toBeInTheDocument();
  });

  it('a never-expiring row (year 9999) shows no date', () => {
    render(
      <SuggestionMeta
        suggestion={suggestion({ expiresAt: '9999-12-31T00:00:00.000Z' })}
        confidence={90}
      />
    );
    expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/9999/)).not.toBeInTheDocument();
    expect(screen.getByText("Doesn't expire")).toBeInTheDocument();
  });

  it('a scored removal skipped by expiry (Shadow / Automatic) shows no date, whatever its stored date', () => {
    render(
      <SuggestionMeta suggestion={suggestion({ expiryApplies: false })} confidence={90} />
    );
    expect(screen.queryByText(/Expires:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });
});
