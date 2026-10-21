/**
 * Where a learning suggestion is decided. Owner rule: every suggestion is decided only in the
 * feature it belongs to; Settings › AI › Learning activity only SHOWS what the engine found.
 *
 * `promote` and `resolve_conflict` rows carry the RULE's own domain (routing / spam / detection),
 * so a domain-based mapping is right for them. null = no feature page yet: such a row stays
 * decidable in Learning activity, under "Not yet in a feature page".
 */
export type SuggestionHome = { label: string; href: string };

type SuggestionRef = { domain: string; suggestionType: string };

const KB_QUALITY_TYPES: ReadonlySet<string> = new Set(['consolidate', 'attach', 'entry_review']);

export const suggestionHome = (row: SuggestionRef): SuggestionHome | null => {
  switch (row.domain) {
    case 'kb_review':
      return { label: 'Knowledge Base', href: '/knowledge-base?status=needs_decision' };
    case 'kb_quality':
      return KB_QUALITY_TYPES.has(row.suggestionType)
        ? { label: 'Knowledge Base', href: '/knowledge-base?status=suggested_change' }
        : null;
    case 'routing':
      return {
        label: row.suggestionType === 'propose_rule' ? 'Routing Rules' : 'Routing Rules › Suggestions',
        href: '/settings#rules/routing',
      };
    case 'spam':
      return { label: 'Spam Rules › Suggestions', href: '/settings#rules/spam' };
    case 'detection':
      return { label: 'Detection Rules › Suggestions', href: '/settings#rules/detection' };
    case 'reply_style':
      return { label: 'AI Prompts › Suggested house style', href: '/settings#ai/prompts' };
    case 'auto_reply':
      return { label: 'Auto-Reply › Suggestions', href: '/settings#ai/auto-reply' };
    default:
      return null;
  }
};

/** Short name for "Decide in <name>" links: the feature, without the section after "›". */
export const suggestionHomeName = (home: SuggestionHome): string => home.label.split(' › ')[0];
