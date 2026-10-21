import { describe, expect, it } from 'vitest';
import {
  autoRoutedReasonLabel,
  hasActiveContradiction,
  needsReviewReasonLabel,
  needsReviewTooltip,
} from '../aiFlagCopy';
import { getAiState, getRiskSignals } from '../inboxCardHelpers';
import { analysisInfoValue } from '../AnalysisDegradedHint';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '../filters/filterSchema';
import { normalizeAiState, VALID_AI_STATES } from '@/hooks/useMessagesUrlSync';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata } from '@/types/ai';
import type { MessageThread } from '@/services/message.service';

/**
 * The AI flags explained (old-AI-features audit, 2026-10-21). Every new field is optional: an
 * older backend sends none of them and each surface must read exactly as before.
 */

describe('needs-review reason → words', () => {
  it.each([
    ['low_confidence', 'Low confidence draft'],
    ['blocked_gate', 'Held by a send rule'],
    ['plan_limit', 'Plan limit reached'],
    ['escalation', 'Escalation phrase'],
    ['ai_reply_limit', 'Customer replied after the AI'],
    ['needs_info', 'Needs more information'],
    ['ai_error', 'AI error'],
    ['send_failed', 'Send failed'],
    ['reopened', 'Reopened'],
    ['suspicious_in_thread', 'Suspicious reply'],
    ['lead_escalated', 'Qualified lead'],
  ])('%s → "%s"', (code, words) => {
    expect(needsReviewReasonLabel(code)).toBe(words);
    expect(needsReviewTooltip(code)).toBe(`Needs review: ${words}`);
  });

  it.each([['other'], [null], [undefined], [''], ['brand_new_code'], ['toString']])(
    '%s → no reason, the plain "Needs review"',
    (code) => {
      expect(needsReviewReasonLabel(code)).toBeNull();
      expect(needsReviewTooltip(code)).toBe('Needs review');
    }
  );
});

describe('auto-assign reason → words', () => {
  it.each([
    ['contact_manager', "Assigned automatically: contact's manager"],
    ['client_history', 'Assigned automatically: handled this customer before'],
    ['skill_match', 'Assigned automatically: skills match'],
    ['load_balance', 'Assigned automatically: least busy'],
  ])('%s → "%s"', (code, words) => {
    expect(autoRoutedReasonLabel(code)).toBe(words);
  });

  it.each([[null], [undefined], ['manual'], ['hasOwnProperty']])('%s → nothing', (code) => {
    expect(autoRoutedReasonLabel(code)).toBeNull();
  });
});

const thread = { isLead: false } as unknown as MessageThread;
const msg = (over: Partial<Message> & { metadata?: Record<string, unknown> }) =>
  ({ id: 1, needsHumanReview: false, metadata: {}, ...over }) as unknown as Message;

describe('card AI-state chip carries the reason in its tooltip', () => {
  it('a reason: label stays short, tooltip names it', () => {
    const state = getAiState(
      msg({ needsHumanReview: true, needsReviewReason: 'send_failed' }),
      thread
    );
    expect(state).toEqual({ label: 'Needs review', tooltip: 'Needs review: Send failed' });
  });

  it('CONTROL — an older backend (no reason): the plain "Needs review"', () => {
    expect(getAiState(msg({ needsHumanReview: true }), thread)?.tooltip).toBe('Needs review');
  });

  it('a lead reads "Lead", not "Qualified lead" — with its stage when there is one', () => {
    const lead = { isLead: true } as unknown as MessageThread;
    expect(getAiState(msg({}), lead)).toEqual({ label: 'Lead', tooltip: 'Lead' });
    expect(getAiState(msg({ metadata: { leadState: { stage: 'needs_budget' } } }), lead)).toEqual({
      label: 'Lead · needs budget',
      tooltip: 'Lead · stage: needs budget',
    });
  });
});

const flagged = (dismissedAt?: string): ContradictionCheckMetadata =>
  ({
    triggeredBy: 'auto_pattern',
    claimToVerify: 'x',
    checkedAt: '2026-10-21T10:00:00Z',
    result: { hasContradiction: true, confidence: 'high' },
    ...(dismissedAt ? { dismissedAt } : {}),
  }) as ContradictionCheckMetadata;

describe('a dismissed contradiction is no contradiction', () => {
  it('dismissed → not active, and no card risk signal', () => {
    const check = flagged('2026-10-21T11:00:00Z');
    expect(hasActiveContradiction(check)).toBe(false);
    const keys = getRiskSignals(msg({ metadata: { contradictionCheck: check } })).map(
      (signal) => signal.key
    );
    expect(keys).not.toContain('contradiction');
  });

  it('CONTROL — undismissed (older backend, no dismissedAt) still flags', () => {
    expect(hasActiveContradiction(flagged())).toBe(true);
    const keys = getRiskSignals(msg({ metadata: { contradictionCheck: flagged() } })).map(
      (signal) => signal.key
    );
    expect(keys).toContain('contradiction');
  });
});

describe('the Info facet when the AI could not judge', () => {
  it('degraded → "Not judged", never "Complete"', () => {
    expect(analysisInfoValue({ needsMoreInfo: false, analysisDegraded: true })).toBe('Not judged');
  });

  it('CONTROL — not degraded / absent: as before', () => {
    expect(analysisInfoValue({ needsMoreInfo: false })).toBe('Complete');
    expect(analysisInfoValue({ needsMoreInfo: true, analysisDegraded: false })).toBe('Needs more');
    expect(analysisInfoValue({})).toBeNull();
    expect(analysisInfoValue(undefined)).toBeNull();
  });
});

describe('AI-state filter: "AI suggested" retired, old links still land', () => {
  const aiOptions = (leadsHidden?: boolean) =>
    buildFilterDefs({ ...EMPTY_DYNAMIC_OPTIONS, leadsHidden })
      .find((def) => def.key === 'aiState')
      ?.options?.map((option) => option.value);

  it('is no longer offered, and Bot handled stays', () => {
    expect(aiOptions()).not.toContain('ai_suggested');
    expect(aiOptions()).toContain('bot_handled');
    expect(VALID_AI_STATES).not.toContain('ai_suggested');
    expect(VALID_AI_STATES).not.toContain('in_human_work');
  });

  it('an old ?aiState=ai_suggested opens Needs review; in_human_work and junk drop', () => {
    expect(normalizeAiState('ai_suggested')).toBe('needs_review');
    expect(normalizeAiState('in_human_work')).toBeUndefined();
    expect(normalizeAiState('nonsense')).toBeUndefined();
    expect(normalizeAiState(null)).toBeUndefined();
  });

  it('CONTROL — current values pass through unchanged', () => {
    for (const value of VALID_AI_STATES) expect(normalizeAiState(value)).toBe(value);
  });

  it('"Lead" is offered unless lead qualification is not configured', () => {
    expect(aiOptions(true)).not.toContain('lead');
    expect(aiOptions(false)).toContain('lead');
    expect(aiOptions(undefined)).toContain('lead');
  });
});
