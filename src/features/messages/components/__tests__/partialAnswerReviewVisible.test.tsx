/**
 * Partial answers (2026-11-16): when the AI auto-reply could answer only some of a customer's
 * questions, the thread is flagged `partial_answer` (nothing sent) or `follow_up_needed` (sent,
 * a colleague must follow up). Like a flood hold, each names itself on the list chip and in the
 * thread header, so the agent sees the follow-up without opening a tooltip. Invented data.
 */
import { describe, expect, it, vi } from 'vitest';
import { message, renderHeader } from './md4.header.utils';
import { screen } from '@testing-library/react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { getAiState } from '../inboxCardHelpers';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

const thread = { isLead: false } as unknown as MessageThread;
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 7,
    channel: 'email',
    sender: 'buyer@shop.example',
    status: 'open',
    needsHumanReview: true,
    createdAt: '2026-11-16T09:00:00Z',
    metadata: {},
    ...over,
  }) as unknown as Message;

describe('list AI-state chip', () => {
  it.each([
    ['follow_up_needed', 'Follow-up needed'],
    ['partial_answer', "AI couldn't answer every question"],
  ])('%s: the chip names it', (reason, label) => {
    expect(getAiState(row({ needsReviewReason: reason }), thread)?.label).toBe(label);
  });

  it('partial_answer with the AI draft stored: names the reason AND the ready draft', () => {
    const state = getAiState(
      row({ needsReviewReason: 'partial_answer', metadata: { suggestedAnswer: 'Hello' } }),
      thread
    );
    expect(state?.label).toBe("AI couldn't answer every question · draft ready");
  });

  it('CONTROL — another reason keeps the plain "Needs review"', () => {
    expect(getAiState(row({ needsReviewReason: 'plan_limit' }), thread)?.label).toBe(
      'Needs review'
    );
  });
});

describe('thread header', () => {
  it('follow_up_needed: a warning badge names it', async () => {
    renderHeader({
      message: {
        ...message,
        needsHumanReview: true,
        needsReviewReason: 'follow_up_needed',
      } as Message,
    });
    const badge = await screen.findByTestId('header-follow-up-needed-review');
    expect(badge.textContent).toContain('Follow-up needed');
  });

  it('CONTROL — the flood badge keeps its test id', async () => {
    renderHeader({
      message: { ...message, needsHumanReview: true, needsReviewReason: 'flood' } as Message,
    });
    expect(await screen.findByTestId('header-flood-review')).toBeTruthy();
  });
});
