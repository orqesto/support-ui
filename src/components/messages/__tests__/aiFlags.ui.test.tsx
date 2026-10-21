import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';

/**
 * The AI-flag surfaces (2026-10-21): the needs-review reason on the badge, Dismiss on the Conflict
 * tab, and the "AI couldn't analyse" hint. Each with the CONTROL an older backend produces.
 */

const svc = vi.hoisted(() => ({ dismiss: vi.fn<(id: number) => Promise<unknown>>() }));
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: { dismissContradiction: (id: number) => svc.dismiss(id) },
}));
const toasts = vi.hoisted(() => ({ error: vi.fn<(text: string) => void>() }));
vi.mock('@/lib/toast', () => ({ toast: { error: toasts.error, success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { MessageSignalBadges } = await import('../MessageSignalBadges');
const { ConflictTabPanel } = await import('../ConflictTabPanel');
const { AnalysisDegradedHint } = await import('../AnalysisDegradedHint');
const { dismissContradictionWithFeedback, DISMISS_UNAVAILABLE_MESSAGE } = await import(
  '../dismissContradiction'
);

const flagged = (dismissedAt?: string): ContradictionCheckMetadata =>
  ({
    triggeredBy: 'auto_pattern',
    claimToVerify: 'I never ordered this',
    checkedAt: '2026-10-21T10:00:00Z',
    result: {
      hasContradiction: true,
      confidence: 'high',
      explanation: 'Earlier the customer confirmed the order.',
    },
    ...(dismissedAt ? { dismissedAt } : {}),
  }) as ContradictionCheckMetadata;

const msg = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    channel: 'email',
    sender: 'buyer@shop.example',
    status: 'open',
    needsHumanReview: false,
    createdAt: '2026-10-21T09:00:00Z',
    metadata: {},
    ...over,
  }) as unknown as Message;

beforeEach(() => {
  svc.dismiss.mockReset();
  toasts.error.mockReset();
});

describe('Needs Review badge — the reason', () => {
  it('shows the reason as a suffix on the full badge', () => {
    render(
      <MessageSignalBadges
        message={msg({ needsHumanReview: true, needsReviewReason: 'plan_limit' })}
      />
    );
    expect(screen.getByText('Needs Review').textContent).toContain('Plan limit reached');
  });

  it('CONTROL — no reason (older backend) or "other": the plain badge', () => {
    const { unmount } = render(<MessageSignalBadges message={msg({ needsHumanReview: true })} />);
    expect(screen.getByText('Needs Review').textContent).toBe('Needs Review');
    unmount();
    render(
      <MessageSignalBadges message={msg({ needsHumanReview: true, needsReviewReason: 'other' })} />
    );
    expect(screen.getByText('Needs Review').textContent).toBe('Needs Review');
  });
});

describe('Contradiction badge — dismissed hides it', () => {
  it('dismissed → no Contradiction badge', () => {
    render(
      <MessageSignalBadges
        message={msg({ metadata: { contradictionCheck: flagged('2026-10-21T11:00:00Z') } })}
      />
    );
    expect(screen.queryByText('Contradiction')).toBeNull();
  });

  it('CONTROL — undismissed still shows it', () => {
    render(<MessageSignalBadges message={msg({ metadata: { contradictionCheck: flagged() } })} />);
    expect(screen.getByText('Contradiction')).toBeInTheDocument();
  });
});

describe('Conflict tab — Dismiss', () => {
  it('calls the dismiss handler and the alert goes at once', async () => {
    const onDismiss = vi.fn(() => Promise.resolve(true));
    render(
      <ConflictTabPanel
        message={msg({ metadata: { contradictionCheck: flagged() } })}
        onCheckContradiction={() => Promise.resolve()}
        onDismissContradiction={onDismiss}
      />
    );
    expect(screen.getByText(/Earlier the customer confirmed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.getByTestId('contradiction-dismissed')).toBeInTheDocument());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Earlier the customer confirmed/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('a failed dismissal (handler false) keeps the alert', async () => {
    render(
      <ConflictTabPanel
        message={msg({ metadata: { contradictionCheck: flagged() } })}
        onDismissContradiction={() => Promise.resolve(false)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dismiss' })).not.toBeDisabled());
    expect(screen.getByText(/Earlier the customer confirmed/)).toBeInTheDocument();
  });

  it('already dismissed by the backend: no alert, a dismissed note, Re-check still offered', () => {
    render(
      <ConflictTabPanel
        message={msg({ metadata: { contradictionCheck: flagged('2026-10-21T11:00:00Z') } })}
        onCheckContradiction={() => Promise.resolve()}
        onDismissContradiction={() => Promise.resolve(true)}
      />
    );
    expect(screen.getByTestId('contradiction-dismissed')).toBeInTheDocument();
    expect(screen.queryByText(/Earlier the customer confirmed/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeInTheDocument();
  });

  it('CONTROL — no handler (no permission path): no Dismiss button', () => {
    render(<ConflictTabPanel message={msg({ metadata: { contradictionCheck: flagged() } })} />);
    expect(screen.getByText(/Earlier the customer confirmed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});

describe('dismissContradictionWithFeedback', () => {
  it('posts to the dismiss endpoint and reports success', async () => {
    svc.dismiss.mockResolvedValue({ success: true });
    await expect(dismissContradictionWithFeedback(7)).resolves.toBe(true);
    expect(svc.dismiss).toHaveBeenCalledWith(7);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('a 404 from an older backend: one short line, false, no crash', async () => {
    svc.dismiss.mockRejectedValue({ status: 404, data: { message: 'Not Found' } });
    await expect(dismissContradictionWithFeedback(7)).resolves.toBe(false);
    expect(toasts.error).toHaveBeenCalledWith(DISMISS_UNAVAILABLE_MESSAGE);
  });

  it('CONTROL — another error says what the server said, not the 404 line', async () => {
    svc.dismiss.mockRejectedValue({ status: 403, data: { message: 'Forbidden here' } });
    await expect(dismissContradictionWithFeedback(7)).resolves.toBe(false);
    expect(toasts.error).not.toHaveBeenCalledWith(DISMISS_UNAVAILABLE_MESSAGE);
  });
});

describe('"AI couldn\'t analyse" hint', () => {
  it('shown when the analysis is degraded', () => {
    render(<AnalysisDegradedHint degraded />);
    expect(screen.getByTestId('analysis-degraded')).toHaveTextContent(/couldn't analyse/);
  });

  it.each([[false], [undefined]])('CONTROL — %s: nothing', (degraded) => {
    render(<AnalysisDegradedHint degraded={degraded} />);
    expect(screen.queryByTestId('analysis-degraded')).toBeNull();
  });
});
