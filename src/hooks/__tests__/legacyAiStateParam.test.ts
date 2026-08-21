/**
 * The skew fallback. This is the one filter whose wire format CHANGED rather than grew —
 * every other new param is additive, so an older API ignoring it only widens the result.
 * Dropping the booleans outright would have broken AI State for as long as the frontend
 * was live ahead of the backend.
 */
import { describe, it, expect } from 'vitest';
import { legacyAiStateParam } from '../legacyAiStateParam';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '@/components/messages/filters/filterSchema';

const aiStates =
  buildFilterDefs(EMPTY_DYNAMIC_OPTIONS)
    .find((def) => def.key === 'aiState')
    ?.options?.map((option) => option.value) ?? [];

describe('legacyAiStateParam', () => {
  it('has a boolean for every state the picker offers', () => {
    // Asserted over the SCHEMA, not a hand-written list: a new AI state added to the
    // picker with no fallback here would silently stop working during a skew.
    expect(aiStates.length).toBeGreaterThan(0);
    for (const state of aiStates) {
      expect(Object.keys(legacyAiStateParam(state))).toHaveLength(1);
    }
  });

  it('maps each state to the param that API actually reads', () => {
    expect(legacyAiStateParam('needs_review')).toEqual({ needsHumanReview: 'true' });
    expect(legacyAiStateParam('needs_info')).toEqual({ showNeedsInfo: 'true' });
    expect(legacyAiStateParam('ai_suggested')).toEqual({ aiSuggested: 'true' });
    expect(legacyAiStateParam('bot_handled')).toEqual({ botHandled: 'true' });
    expect(legacyAiStateParam('lead')).toEqual({ isLead: 'true' });
    expect(legacyAiStateParam('contradiction')).toEqual({ hasContradiction: 'true' });
  });

  it('sends nothing for a state it has no boolean for', () => {
    expect(legacyAiStateParam('all')).toEqual({});
    expect(legacyAiStateParam('in_human_work')).toEqual({});
  });
});
