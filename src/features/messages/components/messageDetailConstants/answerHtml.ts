import DOMPurify from 'dompurify';
import { liftLinks } from '@/lib/liftLinks';

export function renderMarkdown(raw: string): string {
  /*
    Autolink bare URLs. A plain-text mail is the ONLY place a tracking link can appear without
    markup, and until now the text branch allowed no anchors at all — so the link a customer was
    told to click was, in the console, unclickable text.

    ⛔ Links are lifted out BEFORE escaping and the emphasis rules (liftLinks): linked last, a
    tracking link `…/order_id_123` lost "_id_" to <em> and pointed at `…/order` (2026-10-14).
  */
  const links = liftLinks(raw, { attrs: ' target="_blank" rel="noopener noreferrer"' });
  return links.restore(
    links.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>')
  );
}

// Converts a suggested/AI answer (generated as plain text with markdown-ish
// syntax — blank-line paragraphs, `- ` bullets, `1.` lists, **bold**) into real
// HTML, so inserting it into the reply editor yields editable rich text that is
// sent to the customer as formatted HTML — not literal "**bold**" / "- " runs.
// If the answer already contains HTML tags it is returned untouched (TipTap +
// the outbound sanitizer handle it). Block structure (<p>/<ul>/<ol>) is built
// line-by-line; inline marks are applied to already-escaped text.
export function suggestedAnswerToHtml(raw: string): string {
  if (!raw) return '';
  // Already real HTML (a closing tag or a known inline/block tag)? Leave it for
  // the editor + outbound sanitizer. A stricter test than /<[a-z].*>/ so a bare
  // <https://…> / <name@host> token in plain text still gets converted, not
  // passed through (where the sanitizer would drop it as an unknown tag).
  if (
    /<\/[a-z][a-z0-9]*\s*>|<(?:br|p|div|ul|ol|li|strong|em|b|i|a|blockquote|pre|code)[\s/>]/i.test(
      raw
    )
  )
    return raw;

  /*
    Links are lifted out of the RAW line first and put back last (liftLinks): run through the
    emphasis rules, a URL lost its underscores ("reset<em>password</em>guide", a dead link), and a
    bare URL — what polish writes for a kept link — stayed plain text.
  */
  const inline = (text: string): string => {
    const links = liftLinks(text, { markdown: true });
    return links.restore(
      links.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    );
  };

  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list)
      out.push(
        `<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`
      );
    list = null;
  };

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPara();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      out.push(`<p><strong>${inline(heading[1])}</strong></p>`);
    } else if (bullet) {
      flushPara();
      if (list?.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (list?.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(numbered[1]);
    } else {
      flushList();
      para.push(trimmed);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}

// ─── Ghost answer types ───────────────────────────────────────────────────────

/** The source an inserted suggestion reports (usage statistics). */
export type GhostInsertSource =
  | 'lead_qualification'
  | 'documentation'
  | 'knowledge_base'
  | 'message';

/**
 * The source an insert reports — the stored one when the option carries it (a KB-written draft),
 * else the type's. ONE rule for the thread's ghost and the KB tab's "Use in reply".
 */
export const insertSourceOf = (option: {
  type: 'lead' | 'documentation' | 'similar';
  insertSource?: GhostInsertSource;
}): GhostInsertSource =>
  option.insertSource ??
  (option.type === 'lead'
    ? 'lead_qualification'
    : option.type === 'similar'
      ? 'message'
      : 'documentation');

export type GhostOption = {
  answer: string;
  label: string;
  type: 'lead' | 'documentation' | 'similar';
  /** 0..1, only when the writer stored one (auto-reply and lead paths; agent saves do not). */
  confidence?: number;
  /** The KB document the answer came from, only when the writer stored its title. */
  sourceTitle?: string;
  /**
   * A keyword rule's kept reply: the rule's name (empty when the record has none). The text is
   * the team's own, so the caption names the rule and never says "AI".
   */
  ruleName?: string;
  /**
   * The source an insert reports (usage statistics) — from the stored source, never read off the
   * label. Absent on options built elsewhere: then the type's default.
   */
  insertSource?: GhostInsertSource;
  /**
   * What became of this draft as an AUTOMATIC reply (2026-11-24), when the backend recorded it:
   * check-only kept it instead of sending it (`wouldSend`), or a check held it (`heldReason`, the
   * review reason; `heldThreshold` the confidence bar it was held under). Absent on any other
   * draft, and on an older backend that does not record it.
   */
  autoStatus?: GhostAutoStatus;
};

/**
 * `question`: the draft is the automatic email asking the customer for missing details (BE
 * followUpEmailHelper, `kind: 'missing_info_question'`), not an answer — the badge says so, and a
 * hold reads in that email's words (`checkReason`: what the check of its questions found).
 */
export type GhostAutoStatus =
  | { kind: 'would_send'; question?: true }
  | { kind: 'held'; reason: string; threshold?: number; question?: true; checkReason?: string };

/** The `kind` the backend stores on a kept missing-info question (followUpEmailHelper). */
export const MISSING_INFO_QUESTION_KIND = 'missing_info_question';

/** The stored draft's automatic-reply outcome, or undefined (tolerant of any shape). */
export const autoStatusOf = (sa: {
  wouldSend?: unknown;
  heldReason?: unknown;
  heldThreshold?: unknown;
  kind?: unknown;
  checkReason?: unknown;
}): GhostAutoStatus | undefined => {
  const question = sa.kind === MISSING_INFO_QUESTION_KIND ? { question: true as const } : {};
  if (sa.wouldSend === true) return { kind: 'would_send', ...question };
  if (typeof sa.heldReason !== 'string' || sa.heldReason === '') return undefined;
  const threshold =
    typeof sa.heldThreshold === 'number' && Number.isFinite(sa.heldThreshold)
      ? sa.heldThreshold
      : undefined;
  const checkReason =
    typeof sa.checkReason === 'string' && sa.checkReason !== '' ? sa.checkReason : undefined;
  return {
    kind: 'held',
    reason: sa.heldReason,
    ...(threshold !== undefined ? { threshold } : {}),
    ...question,
    ...(question.question && checkReason !== undefined ? { checkReason } : {}),
  };
};

export type SuggestedAnswerMeta = {
  answer: string;
  confidence?: number;
  source?: string;
  foundAt?: string;
  /** Lead-qualification answers carry their KB documents' titles here. */
  kbSources?: { type?: string; title?: string }[];
  /** The keyword rule that kept this reply (BE keywordAutoReply storeWithheldDraft). */
  keywordRule?: { id?: number; name?: string } | null;
  /** Check-only: the reply passed every check and was kept instead of sent. */
  wouldSend?: boolean;
  /** A held automatic reply: the review reason it was held with, and the confidence bar. */
  heldReason?: string;
  heldThreshold?: number;
  /** `missing_info_question`: the kept email asking the customer for missing details. */
  kind?: string;
  /** A held question: what the check of its questions found (BE askOnlyModelCheck reasons). */
  checkReason?: string;
};

/**
 * A keyword rule's own reply, kept as the draft (`source: 'keyword_rule'`): the team's text, not a
 * model's. A rule that adds a knowledge base answer stores that answer's source instead.
 */
export const isKeywordRuleDraft = (sa: { source?: unknown } | undefined | null): boolean =>
  sa?.source === 'keyword_rule';

export function toGhostOption(sa: SuggestedAnswerMeta | undefined | null): GhostOption | null {
  if (!sa?.answer) return null;
  const src = sa.source ?? '';
  const isLead = src === 'lead_qualification' || src === 'lead_qualification_kb';
  const isDocs = src === 'documentation';
  // Written from knowledge-base entries, no documentation section (the backend's agent draft,
  // 2026-11-16): still inserted as a documentation answer, but the chip says KB, not DOCS.
  const isKb = src === 'knowledge_base';
  // ⛔ Absent stays absent: a missing confidence must not read as "0%", and a title is shown only
  // when the writer stored one — nothing is looked up or guessed here.
  const confidence =
    typeof sa.confidence === 'number' &&
    Number.isFinite(sa.confidence) &&
    sa.confidence >= 0 &&
    sa.confidence <= 1
      ? sa.confidence
      : undefined;
  const autoStatus = autoStatusOf(sa);
  if (isKeywordRuleDraft(sa)) {
    const name = typeof sa.keywordRule?.name === 'string' ? sa.keywordRule.name.trim() : '';
    return {
      answer: sa.answer,
      label: 'RULE',
      type: 'similar',
      ruleName: name,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(autoStatus ? { autoStatus } : {}),
    };
  }
  const sourceTitle = sa.kbSources
    ?.find((ref) => ref.type === 'documentation' && ref.title?.trim())
    ?.title?.trim();
  return {
    answer: sa.answer,
    label: isLead ? 'LEAD' : isDocs ? 'DOCS' : isKb ? 'KB' : 'AI',
    type: isLead ? 'lead' : isDocs || isKb ? 'documentation' : 'similar',
    // Only where it is not the type's default (insertSourceOf): a KB-written draft.
    ...(isKb ? { insertSource: 'knowledge_base' as const } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(autoStatus ? { autoStatus } : {}),
  };
}

/**
 * The ghost's caption: "AI suggestion · 87% · Returns policy" (v3), each part only when known. A
 * keyword rule's kept reply reads `Keyword rule "Returns"`: nobody's model wrote it.
 */
export const ghostCaption = (
  option: Pick<GhostOption, 'confidence' | 'sourceTitle' | 'ruleName' | 'autoStatus'>
): string =>
  [
    option.ruleName !== undefined
      ? option.ruleName
        ? `Keyword rule "${option.ruleName}"`
        : 'Keyword rule'
      : option.autoStatus?.question
        ? 'AI question for missing details'
        : 'AI suggestion',
    option.confidence !== undefined ? `${Math.round(option.confidence * 100)}%` : null,
    option.sourceTitle ?? null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

// Convert an AI/suggested answer into sanitized HTML ready to drop into the reply
// editor. Single source of truth for BOTH insertion paths — the ghost-bubble /
// KB-dialog "use this answer" flow and the composer's AI actions — so the tag
// allowlist can never drift between them.
export function answerToEditorHtml(raw: string): string {
  return DOMPurify.sanitize(suggestedAnswerToHtml(raw), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'b',
      'i',
      'u',
      'strong',
      'em',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}
