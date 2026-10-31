import { describe, expect, it } from 'vitest';
import { suggestionHome, suggestionHomeName } from '../suggestionHome';

const home = (domain: string, suggestionType: string) => suggestionHome({ domain, suggestionType });

describe('suggestionHome', () => {
  it('routing rows are decided in Routing Rules', () => {
    expect(home('routing', 'resolve_routing_disagreement')?.href).toBe('/settings#rules/routing');
    expect(home('routing', 'propose_rule')?.href).toBe('/settings#rules/routing');
    expect(home('routing', 'confirm_learned_rule')?.href).toBe('/settings#rules/routing');
  });

  it('spam and detection rows (any type, including promote and conflicts) use their own page', () => {
    expect(home('spam', 'promote')?.href).toBe('/settings#rules/spam');
    expect(home('spam', 'resolve_conflict')?.href).toBe('/settings#rules/spam');
    expect(home('detection', 'resolve_conflict')?.href).toBe('/settings#rules/detection');
  });

  it('KB captures and KB quality reviews go to the one KB list', () => {
    expect(home('kb_review', 'kb_review.capture')?.href).toBe(
      '/knowledge-base?status=needs_decision'
    );
    for (const type of ['consolidate', 'attach', 'entry_review']) {
      expect(home('kb_quality', type)?.href).toBe('/knowledge-base?status=suggested_change');
    }
  });

  it('reply style and auto-reply', () => {
    expect(home('reply_style', 'reply_style.update')?.href).toBe('/settings#ai/prompts');
    expect(home('auto_reply', 'anything')?.href).toBe('/settings#ai/auto-reply');
  });

  it('anything else has no home (CONTROL: and a kb_quality type outside the KB list)', () => {
    expect(home('xyz', 'a')).toBeNull();
    expect(home('categorization', 'x')).toBeNull();
    expect(home('kb_quality', 'promote')).toBeNull();
  });

  it('names the feature for the "Decide in" link', () => {
    expect(suggestionHomeName(home('spam', 'promote')!)).toBe('Spam Rules');
    expect(suggestionHomeName(home('routing', 'propose_rule')!)).toBe('Routing Rules');
  });

  it('a capture or merge suggestion with an id opens its question card', () => {
    expect(
      suggestionHome({ domain: 'kb_review', suggestionType: 'kb_review.capture', id: 41 })?.href
    ).toBe('/knowledge-base?view=questions&question=41');
    expect(
      suggestionHome({ domain: 'kb_quality', suggestionType: 'consolidate', id: 42 })?.href
    ).toBe('/knowledge-base?view=questions&question=42');
  });

  it('an entry_review suggestion opens that entry in Live answers', () => {
    expect(
      suggestionHome({
        domain: 'kb_quality',
        suggestionType: 'entry_review',
        id: 43,
        payload: { entryId: 700 },
      })?.href
    ).toBe('/knowledge-base?view=live&entry=700');
    // CONTROL: no usable entry id falls back to its question.
    expect(
      suggestionHome({ domain: 'kb_quality', suggestionType: 'entry_review', id: 43, payload: {} })
        ?.href
    ).toBe('/knowledge-base?view=questions&question=43');
  });
});
