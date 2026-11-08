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

export type GhostOption = {
  answer: string;
  label: string;
  type: 'lead' | 'documentation' | 'similar';
  /** 0..1, only when the writer stored one (auto-reply and lead paths; agent saves do not). */
  confidence?: number;
  /** The KB document the answer came from, only when the writer stored its title. */
  sourceTitle?: string;
};

export type SuggestedAnswerMeta = {
  answer: string;
  confidence?: number;
  source?: string;
  foundAt?: string;
  /** Lead-qualification answers carry their KB documents' titles here. */
  kbSources?: { type?: string; title?: string }[];
};

export function toGhostOption(sa: SuggestedAnswerMeta | undefined | null): GhostOption | null {
  if (!sa?.answer) return null;
  const src = sa.source ?? '';
  const isLead = src === 'lead_qualification' || src === 'lead_qualification_kb';
  const isDocs = src === 'documentation';
  // ⛔ Absent stays absent: a missing confidence must not read as "0%", and a title is shown only
  // when the writer stored one — nothing is looked up or guessed here.
  const confidence =
    typeof sa.confidence === 'number' &&
    Number.isFinite(sa.confidence) &&
    sa.confidence >= 0 &&
    sa.confidence <= 1
      ? sa.confidence
      : undefined;
  const sourceTitle = sa.kbSources
    ?.find((ref) => ref.type === 'documentation' && ref.title?.trim())
    ?.title?.trim();
  return {
    answer: sa.answer,
    label: isLead ? 'LEAD' : isDocs ? 'DOCS' : 'AI',
    type: isLead ? 'lead' : isDocs ? 'documentation' : 'similar',
    ...(confidence !== undefined ? { confidence } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
  };
}

/** The ghost's caption: "AI suggestion · 87% · Returns policy" (v3), each part only when known. */
export const ghostCaption = (option: Pick<GhostOption, 'confidence' | 'sourceTitle'>): string =>
  [
    'AI suggestion',
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
