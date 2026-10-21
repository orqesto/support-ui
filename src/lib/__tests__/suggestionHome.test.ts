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
    expect(home('kb_review', 'kb_review.capture')?.href).toBe('/knowledge-base?status=needs_decision');
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
});
