/**
 * The send gate's hold reasons (2026-11-20): an automatic reply that was not sent flags the thread
 * with ONE named reason. Each has its own words on the list chip, the full badge, the tooltip and
 * the thread header; a reason this bundle has never heard of keeps the plain "Needs review" —
 * never the raw code, never a blank. Invented data.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { message, renderHeader } from './md4.header.utils';
import type { Message } from '@/types';
import type { components } from '@/types/generated/api';
import type { MessageThread } from '@/services/message.service';
import {
  NAMED_REVIEW_REASONS,
  NEEDS_REVIEW_REASON_DETAILS,
  NEEDS_REVIEW_REASON_LABELS,
  needsReviewReasonLabel,
  needsReviewTooltip,
} from '../aiFlagCopy';
import { getAiState } from '../inboxCardHelpers';
import { MessageSignalBadges } from '../MessageSignalBadges';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

/** The backend's NEEDS_REVIEW_REASONS entries the send gate added, with this app's words. */
const GATE_REASONS: [string, string][] = [
  ['restricted_topic', 'Restricted topic'],
  ['no_customer_request', 'Not a customer request'],
  ['needs_lookup_or_action', 'Needs a lookup or an action'],
  ['promises_follow_up', 'Reply promised a follow-up'],
  ['does_not_answer', 'Reply did not answer the question'],
  ['unsupported_by_sources', 'Reply went beyond the knowledge base'],
  ['not_from_knowledge', 'Reply not from the knowledge base'],
  ['spam_verdict', 'Spam check not cleared'],
];

const thread = { isLead: false } as unknown as MessageThread;
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    channel: 'email',
    sender: 'buyer@shop.example',
    status: 'open',
    needsHumanReview: true,
    createdAt: '2026-11-20T09:00:00Z',
    metadata: {},
    ...over,
  }) as unknown as Message;

describe('send gate hold reasons → words', () => {
  it.each(GATE_REASONS)('%s: label, a one-line explanation, the list chip', (code, label) => {
    expect(needsReviewReasonLabel(code)).toBe(label);
    const detail = NEEDS_REVIEW_REASON_DETAILS[code];
    expect(detail).toMatch(/sent/);
    expect(needsReviewTooltip(code)).toBe(`Needs review: ${detail}`);
    expect(NAMED_REVIEW_REASONS).toContain(code);
    expect(getAiState(row({ needsReviewReason: code }), thread)).toEqual({
      label,
      tooltip: `Needs review: ${detail}`,
    });
  });

  it('a held reply whose draft is stored: the chip names the reason AND the ready draft', () => {
    const state = getAiState(
      row({ needsReviewReason: 'does_not_answer', metadata: { suggestedAnswer: 'Hello' } }),
      thread
    );
    expect(state?.label).toBe('Reply did not answer the question · draft ready');
  });

  it.each(GATE_REASONS)('%s: the full badge carries the label', (code, label) => {
    render(<MessageSignalBadges message={row({ needsReviewReason: code })} />);
    expect(screen.getByText(`· ${label}`)).toBeInTheDocument();
  });

  it('the thread header names a restricted topic, with the explanation behind it', async () => {
    renderHeader({
      message: {
        ...message,
        needsHumanReview: true,
        needsReviewReason: 'restricted_topic',
      } as Message,
    });
    const badge = await screen.findByTestId('header-restricted-topic-review');
    expect(badge.textContent).toContain('Restricted topic');
  });
});

describe('a reply held because it only declined (blocked_gate)', () => {
  const held = row({ needsReviewReason: 'blocked_gate' });

  it('names itself on the list chip, with and without a stored draft', () => {
    expect(getAiState(held, thread)).toEqual({
      label: 'Held by a send rule',
      tooltip: 'Needs review: Held by a send rule',
    });
    expect(
      getAiState(
        row({ needsReviewReason: 'blocked_gate', metadata: { suggestedAnswer: 'Hello' } }),
        thread
      )?.label
    ).toBe('Held by a send rule · draft ready');
  });

  it('names itself in the thread header', async () => {
    renderHeader({
      message: { ...message, needsHumanReview: true, needsReviewReason: 'blocked_gate' } as Message,
    });
    const badge = await screen.findByTestId('header-blocked-gate-review');
    expect(badge.textContent).toContain('Held by a send rule');
  });

  it('CONTROL — a reason that is not named keeps the plain chip and no header pill', async () => {
    expect(getAiState(row({ needsReviewReason: 'low_confidence' }), thread)?.label).toBe(
      'Needs review'
    );
    renderHeader({
      message: {
        ...message,
        needsHumanReview: true,
        needsReviewReason: 'low_confidence',
      } as Message,
    });
    await screen.findAllByText(/./);
    expect(screen.queryByTestId('header-low-confidence-review')).toBeNull();
  });
});

describe("every review reason of the backend's contract has words", () => {
  type Code = Exclude<
    NonNullable<components['schemas']['MessageListItem']['needsReviewReason']>,
    'other'
  >;
  // Keyed by the generated type: a code added to the contract fails the type-check here until
  // it is listed, and the test below until it has a label.
  const CONTRACT_CODES: Record<Code, true> = {
    low_confidence: true,
    blocked_gate: true,
    plan_limit: true,
    escalation: true,
    ai_reply_limit: true,
    needs_info: true,
    ai_error: true,
    send_failed: true,
    reopened: true,
    suspicious_in_thread: true,
    lead_escalated: true,
    flood: true,
    partial_answer: true,
    follow_up_needed: true,
    reply_unchecked: true,
    restricted_topic: true,
    no_customer_request: true,
    needs_lookup_or_action: true,
    promises_follow_up: true,
    does_not_answer: true,
    unsupported_by_sources: true,
    not_from_knowledge: true,
    spam_verdict: true,
  };

  it.each(Object.keys(CONTRACT_CODES))('%s', (code) => {
    expect(needsReviewReasonLabel(code)).toEqual(expect.stringMatching(/\S/));
  });

  it('…and this app labels no code the contract does not have', () => {
    expect(Object.keys(NEEDS_REVIEW_REASON_LABELS).sort()).toEqual(
      Object.keys(CONTRACT_CODES).sort()
    );
  });
});

describe('a reason this bundle does not know (a newer backend)', () => {
  it.each([['ask_unchecked'], ['some_future_hold'], ['constructor']])(
    '%s: the plain "Needs review" everywhere, never the code',
    (code) => {
      expect(needsReviewReasonLabel(code)).toBeNull();
      expect(needsReviewTooltip(code)).toBe('Needs review');
      expect(getAiState(row({ needsReviewReason: code }), thread)).toEqual({
        label: 'Needs review',
        tooltip: 'Needs review',
      });
      const { container, unmount } = render(
        <MessageSignalBadges message={row({ needsReviewReason: code })} />
      );
      expect(container.textContent).toContain('Needs Review');
      expect(container.textContent).not.toContain(code);
      expect(container.textContent).not.toContain('·');
      unmount();
    }
  );

  it('CONTROL — a known reason does put its words on the badge', () => {
    const { container } = render(
      <MessageSignalBadges message={row({ needsReviewReason: 'spam_verdict' })} />
    );
    expect(container.textContent).toContain('· Spam check not cleared');
  });

  it('the thread header shows no reason chip for it', async () => {
    renderHeader({
      message: {
        ...message,
        needsHumanReview: true,
        needsReviewReason: 'some_future_hold',
      } as Message,
    });
    await screen.findAllByText(/./);
    expect(screen.queryByTestId('header-some-future-hold-review')).toBeNull();
    expect(screen.queryByText('some_future_hold')).toBeNull();
  });
});
