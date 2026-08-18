import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ReplyStyleSuggestionDetail } from '@/components/settings/ReplyStyleSuggestionDetail';
import type { LearningSuggestion } from '@/services/learning.service';

const suggestion = (payload: Record<string, unknown>): LearningSuggestion => ({
  id: 7,
  domain: 'reply_style',
  suggestionType: 'reply_style.update',
  payload,
  evidenceEventIds: [1, 2, 3],
  evidenceCount: 12,
  confidence: '0.740',
  status: 'pending',
  expiresAt: '2026-09-01T00:00:00Z',
  createdAt: '2026-08-18T00:00:00Z',
});

const fullPayload = {
  currentStyle: 'Be warm but brief.',
  proposedStyle: 'Be warm but concise.',
  rationale: 'Agents consistently shortened the closing.',
  signals: { avgLengthDeltaPct: -0.18, distinctConvs: 6, distinctAgents: 3 },
};

describe('ReplyStyleSuggestionDetail', () => {
  afterEach(cleanup);

  it('shows the rationale and the evidence signals behind the proposal', () => {
    render(<ReplyStyleSuggestionDetail suggestion={suggestion(fullPayload)} />);
    expect(screen.getByText('Agents consistently shortened the closing.')).toBeInTheDocument();
    expect(screen.getByText('Edited drafts: 12')).toBeInTheDocument();
    expect(screen.getByText('Conversations: 6')).toBeInTheDocument();
    expect(screen.getByText('Agents: 3')).toBeInTheDocument();
    expect(screen.getByText(/-18%/)).toBeInTheDocument();
  });

  it('highlights the changed words instead of only printing the new prose', () => {
    const { container } = render(<ReplyStyleSuggestionDetail suggestion={suggestion(fullPayload)} />);
    const removed = container.querySelector('.line-through');
    expect(removed?.textContent).toBe('brief.');
    expect(screen.getByText('concise.')).toBeInTheDocument();
  });

  it('reveals both versions in full on request', () => {
    render(<ReplyStyleSuggestionDetail suggestion={suggestion(fullPayload)} />);
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show both versions in full'));
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Proposed')).toBeInTheDocument();
  });

  it('labels a first-ever style rather than implying an existing one changed', () => {
    render(
      <ReplyStyleSuggestionDetail
        suggestion={suggestion({ ...fullPayload, currentStyle: '' })}
      />
    );
    expect(screen.getByText('Proposed house style (none set today)')).toBeInTheDocument();
  });

  it('tells the admin to decline a malformed proposal instead of rendering an empty accept', () => {
    render(<ReplyStyleSuggestionDetail suggestion={suggestion({ currentStyle: 'Be brief.' })} />);
    expect(
      screen.getByText('This suggestion carries no proposed style — decline it.')
    ).toBeInTheDocument();
  });
});
