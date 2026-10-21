/**
 * The AI-paused banner: it shows for the reasons the API sends, says the API's words, and offers
 * the way out that fits — a message pack + Upgrade, or (not in plan) Upgrade + an own key.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiPausedBanner } from '../AiPausedBanner';
import type { AiPauseReason, AiStatus } from '../aiStatus';

const ai = (over: Partial<AiStatus> = {}): AiStatus => ({
  currency: 'USD',
  active: true,
  usedMicros: 5_000_000,
  budgetMicros: 5_000_000,
  paused: true,
  bulkPaused: true,
  reason: 'budget_used',
  message: "This period's AI allowance is used up: AI pauses until it resets on 5 Nov.",
  resetsAt: '2026-11-05T00:00:00.000Z',
  ...over,
});

const pack = <a href="/subscription">Buy 1,000 messages</a>;
const show = (status: AiStatus | undefined, extra: { isAdmin?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <AiPausedBanner ai={status} packAction={pack} {...extra} />
    </MemoryRouter>
  );
afterEach(cleanup);

describe('AiPausedBanner', () => {
  it('budget_used: fixed customer sentence, Buy 1,000 messages and Upgrade', () => {
    show(ai());
    expect(screen.getByTestId('ai-paused-banner')).toHaveAttribute('data-reason', 'budget_used');
    expect(screen.getByText('Buy 1,000 messages')).toBeInTheDocument();
    expect(screen.getByText('Upgrade')).toHaveAttribute('href', '/pricing');
  });

  it.each<AiPauseReason>(['server_ceiling', 'bulk_share_used', 'workspace_bulk_limit'])(
    'reason %s: text only, no pack and no Upgrade (neither lifts it)',
    (reason) => {
      show(ai({ reason, message: `text for ${reason}` }));
      expect(screen.getByTestId('ai-paused-banner')).toBeInTheDocument();
      expect(screen.queryByText('Buy 1,000 messages')).not.toBeInTheDocument();
      expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
    }
  );

  it('an unknown reason gets the generic sentence for customers', () => {
    show(ai({ reason: 'something_new' as AiPauseReason, message: 'x $1.00' }));
    expect(screen.getByTestId('ai-paused-banner')).toHaveTextContent('AI is paused for now.');
  });

  it('not_in_plan: Upgrade and connect your own key, no pack', () => {
    show(
      ai({
        reason: 'not_in_plan',
        message: 'AI is not included in your plan. Upgrade, or connect your own AI key.',
        usedMicros: null,
        budgetMicros: null,
      })
    );
    expect(screen.getByText(/AI is not included in your plan/)).toBeInTheDocument();
    expect(screen.getByText('Upgrade')).toBeInTheDocument();
    expect(screen.getByText('Connect your own AI key')).toHaveAttribute(
      'href',
      '/settings#integrations/ai-providers'
    );
    expect(screen.queryByText('Buy 1,000 messages')).not.toBeInTheDocument();
  });

  it('renders nothing when not paused (also when the backend sends no ai block)', () => {
    show(ai({ paused: false, reason: null, message: null }));
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
    cleanup();
    show(undefined);
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('a history-import-only pause (bulkPaused, not paused) shows no banner', () => {
    show(ai({ paused: false, bulkPaused: true, reason: 'bulk_share_used' }));
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('customers never see dollars; admins see the API sentence once', () => {
    const message = 'Allowance used up ($4.20 of $5.00): pauses until it resets.';
    show(ai({ message }));
    expect(screen.getByTestId('ai-paused-banner').textContent).not.toMatch(/\$/);
    cleanup();
    show(ai({ message }), { isAdmin: true });
    const text = screen.getByTestId('ai-paused-banner').textContent ?? '';
    expect(text.match(/\$4\.20 of \$5\.00/g)).toHaveLength(1);
  });
});
