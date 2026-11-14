/**
 * A flood hold names itself where agents look (owner 2026-11-13, chip text "Too many messages at
 * once"): the list's AI-state chip and the thread header (the full-size signal badge already carries it as a suffix). Any other
 * reason, and an older backend that never sends `flood`, read exactly as before.
 */
import { describe, expect, it, vi } from 'vitest';
import { message, renderHeader } from './md4.header.utils';
import { render, screen } from '@testing-library/react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { getAiState } from '../inboxCardHelpers';
import { MessageSignalBadges } from '../MessageSignalBadges';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

const FLOOD = 'Too many messages at once';
const FLOOD_DETAIL = 'Too many messages at once – saved for you, bot did not answer';

const thread = { isLead: false } as unknown as MessageThread;
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    channel: 'telegram',
    sender: 'chat-user@shop.example',
    status: 'open',
    needsHumanReview: false,
    createdAt: '2026-11-13T09:00:00Z',
    metadata: {},
    ...over,
  }) as unknown as Message;

describe('list AI-state chip', () => {
  it('flood: the chip names it, the tooltip keeps the long explanation', () => {
    expect(getAiState(row({ needsHumanReview: true, needsReviewReason: 'flood' }), thread)).toEqual(
      { label: FLOOD, tooltip: `Needs review: ${FLOOD_DETAIL}` }
    );
  });

  it('flood with an AI draft stored: names the flood AND the ready draft', () => {
    const state = getAiState(
      row({
        needsHumanReview: true,
        needsReviewReason: 'flood',
        metadata: { suggestedAnswer: 'Hello' },
      }),
      thread
    );
    expect(state?.label).toBe(`${FLOOD} · draft ready`);
    expect(state?.tooltip).toContain('AI prepared a draft reply');
  });

  it.each([['plan_limit'], ['escalation'], ['other'], [null], [undefined]])(
    'CONTROL — reason %s: the plain "Needs review"',
    (reason) => {
      expect(
        getAiState(row({ needsHumanReview: true, needsReviewReason: reason }), thread)?.label
      ).toBe('Needs review');
    }
  );

  it('CONTROL — a stale flood reason without needsHumanReview shows no chip', () => {
    expect(getAiState(row({ needsReviewReason: 'flood' }), thread)).toBeNull();
  });
});

describe('full-size signal badge', () => {
  it('CONTROL — the full-size badge is unchanged: "Needs Review · reason"', () => {
    render(
      <MessageSignalBadges message={row({ needsHumanReview: true, needsReviewReason: 'flood' })} />
    );
    expect(screen.getByText('Needs Review').textContent).toContain(FLOOD);
  });
});

describe('thread header', () => {
  it('flood: a warning badge names it', async () => {
    renderHeader({
      message: { ...message, needsHumanReview: true, needsReviewReason: 'flood' } as Message,
    });
    const badge = await screen.findByTestId('header-flood-review');
    expect(badge.textContent).toContain(FLOOD);
  });

  it.each([
    ['another reason', { needsHumanReview: true, needsReviewReason: 'plan_limit' }],
    ['an older backend (no reason)', { needsHumanReview: true }],
    ['no review at all', { needsHumanReview: false, needsReviewReason: 'flood' }],
  ])('CONTROL — %s: no flood badge', async (_label, over) => {
    renderHeader({ message: { ...message, ...over } as Message });
    await screen.findByText('In progress');
    expect(screen.queryByTestId('header-flood-review')).toBeNull();
    expect(screen.queryByText(FLOOD)).toBeNull();
  });
});
