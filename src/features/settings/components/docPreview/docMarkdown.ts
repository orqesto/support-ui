import DOMPurify, { type DOMPurify as DOMPurifyInstance } from 'dompurify';
import { liftLinks } from '@/lib/liftLinks';

/**
 * Stored documentation text → sanitized HTML for the preview.
 *
 * The stored text is what the backend extracted: Markdown for `.md` uploads, PDF tables as
 * Markdown pipe tables, plain lines for everything else (Confluence pages are flattened to
 * text at sync). So this is a small, line-based Markdown subset — headings, lists, pipe tables,
 * fenced code, block quotes, rules, bold/italic/code and links — not a full CommonMark parser.
 * A single line break stays a line break: extracted text uses it for addresses, list-like lines
 * and table rows.
 *
 * ⛔ Safety: the text is escaped before any rule adds markup, so any HTML in a document (a
 * `<script>`, an `onerror=`) is shown as text, never parsed. Links are lifted out first
 * (`liftLinks`, http/https only) and the result still goes through DOMPurify with a tag
 * allowlist, http/https/mailto URLs only, and every link forced to a new tab with
 * `rel="noopener noreferrer"`.
 */

const LINK_ATTRS = ' target="_blank" rel="noopener noreferrer"';
const CODE_TOKEN = /(\d+)/g;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline marks on one line (or table cell): code spans, links, bold, italic. */
const inline = (raw: string): string => {
  const codes: string[] = [];
  const withoutCode = raw
    .replace(//g, '')
    .replace(/`([^`\n]+)`/g, (_match, code: string) => {
      codes.push(`<code>${escapeHtml(code)}</code>`);
      return `${codes.length - 1}`;
    });
  const links = liftLinks(withoutCode, { markdown: true, attrs: LINK_ATTRS });
  const marked = escapeHtml(links.text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*\n]*?)\*/g, '<em>$1</em>')
    // `_x_` only as a word of its own, never inside snake_case names.
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
  return links.restore(marked).replace(CODE_TOKEN, (_match, index: string) => codes[Number(index)] ?? '');
};

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const FENCE = /^(`{3,}|~{3,})/;
const BULLET = /^[-*+•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

const isTableRow = (line: string): boolean => line.startsWith('|') && line.length > 1;

const tableCells = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Markdown-ish text → HTML (unsanitized; `renderDocumentHtml` sanitizes it). */
export const documentMarkdownToHtml = (raw: string): string => {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    }
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();

    const fence = trimmed.match(FENCE);
    if (fence) {
      flushAll();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        code.push(lines[index]);
        index++;
      }
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (trimmed === '') {
      flushAll();
      continue;
    }
    if (isTableRow(trimmed) && TABLE_SEPARATOR.test(lines[index + 1]?.trim() ?? '')) {
      flushAll();
      const head = tableCells(trimmed);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(tableCells(lines[index].trim()));
        index++;
      }
      index--;
      out.push(
        `<table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows
            .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`
      );
      continue;
    }
    const heading = trimmed.match(HEADING);
    if (heading) {
      flushAll();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (RULE.test(trimmed)) {
      flushAll();
      out.push('<hr>');
      continue;
    }
    const quoted = trimmed.match(QUOTE);
    if (quoted) {
      flushPara();
      flushList();
      quote.push(quoted[1]);
      continue;
    }
    const bullet = trimmed.match(BULLET);
    const numbered = bullet ? null : trimmed.match(NUMBERED);
    if (bullet || numbered) {
      flushPara();
      flushQuote();
      const tag = bullet ? 'ul' : 'ol';
      // `list` is written inside the flush closures, so it is read through a typed local here.
      let current = list as { tag: 'ul' | 'ol'; items: string[] } | null;
      if (current?.tag !== tag) {
        flushList();
        current = { tag, items: [] };
        list = current;
      }
      current.items.push((bullet ?? numbered)?.[1] ?? '');
      continue;
    }
    flushList();
    flushQuote();
    para.push(trimmed);
  }
  flushAll();
  return out.join('');
};

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/** A purifier of our own, so the link hook never reaches other `DOMPurify.sanitize` callers. */
let purifier: DOMPurifyInstance | null = null;
const getPurifier = (): DOMPurifyInstance => {
  if (purifier) return purifier;
  purifier = DOMPurify(window);
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return purifier;
};

/** The preview's HTML: rendered, then sanitized. */
export const renderDocumentHtml = (raw: string): string =>
  getPurifier().sanitize(documentMarkdownToHtml(raw), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });

/**
 * A long document in parts of about `size` characters, cut only at a blank line outside a code
 * fence, so no paragraph, list, table or code block is split. The preview renders the first part
 * and adds the rest on request: one ~1 MB document rendered at once is a long freeze (sanitizing
 * plus laying out tens of thousands of elements).
 */
export const splitIntoSections = (raw: string, size: number): string[] => {
  if (raw.length <= size) return [raw];
  const sections: string[] = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let current: string[] = [];
  let length = 0;
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line.trim())) inFence = !inFence;
    if (!inFence && line.trim() === '' && length >= size) {
      sections.push(current.join('\n'));
      current = [];
      length = 0;
      continue;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) sections.push(current.join('\n'));
  return sections;
};
