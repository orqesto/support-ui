/**
 * Where a learning suggestion is decided. Owner rule: every suggestion is decided only in the
 * feature it belongs to; Settings › AI › Learning activity only SHOWS what the engine found.
 *
 * `promote` and `resolve_conflict` rows carry the RULE's own domain (routing / spam / detection),
 * so a domain-based mapping is right for them. null = no feature page yet: such a row stays
 * decidable in Learning activity, under "Not yet in a feature page".
 */
export type SuggestionHome = { label: string; href: string };

type SuggestionRef = {
  domain: string;
  suggestionType: string;
  /** The learning suggestion's own id: what the Questions queue starts at. */
  id?: number;
  /** `entry_review` carries the reviewed entry's row id as `entryId`. */
  payload?: Record<string, unknown> | null;
};

const KB_QUALITY_TYPES: ReadonlySet<string> = new Set(['consolidate', 'attach', 'entry_review']);

const idOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/**
 * Where a KB suggestion is decided, naming the item: a capture or merge question opens the
 * Questions view on its card (`?question=<suggestion id>`); a quality review of one entry opens
 * Live answers with that entry's drawer (`?entry=<entry id>`). Without an id (an old caller) the
 * link opens the list of its kind, as it always did.
 */
const kbHref = (row: SuggestionRef, fallbackStatus: string): string => {
  const entryId = row.suggestionType === 'entry_review' ? idOf(row.payload?.entryId) : null;
  if (entryId) return `/knowledge-base?view=live&entry=${entryId}`;
  const suggestionId = idOf(row.id);
  return suggestionId
    ? `/knowledge-base?view=questions&question=${suggestionId}`
    : `/knowledge-base?status=${fallbackStatus}`;
};

export const suggestionHome = (row: SuggestionRef): SuggestionHome | null => {
  switch (row.domain) {
    case 'kb_review':
      return { label: 'Knowledge Base', href: kbHref(row, 'needs_decision') };
    case 'kb_quality':
      return KB_QUALITY_TYPES.has(row.suggestionType)
        ? { label: 'Knowledge Base', href: kbHref(row, 'suggested_change') }
        : null;
    case 'routing':
      return {
        label:
          row.suggestionType === 'propose_rule' ? 'Routing Rules' : 'Routing Rules › Suggestions',
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
