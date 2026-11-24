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

// `"` too: escaped text must be safe in an attribute as well (review of #1023: code spliced into
// an href carried its quotes there).
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

// ⛔ Every rule here runs in linear time: a `.md` mail attachment is outside input. The heading
// rule `^(#{1,6})\s+(.*?)\s*#*\s*$` backtracked cubically on a long run of spaces (a tab
// frozen for minutes); the closing `#`s are now dropped by a loop in `parseHeading`.
const HEADING = /^(#{1,6})\s+([\s\S]*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const FENCE = /^(`{3,}|~{3,})/;
const LIST_ITEM = /^([-*+•]|\d+[.)])\s+([\s\S]*)$/;
const TASK = /^\[([ xX])\]\s+/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/** `# Title ##` → level 1, "Title"; null when the line is no heading. Linear. */
const parseHeading = (line: string): { level: number; text: string } | null => {
  const match = HEADING.exec(line);
  if (!match) return null;
  const text = match[2].trimEnd();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  // Closing `#`s count only as a run of their own (`C#` keeps its `#`).
  const closed = end === 0 || /\s/.test(text[end - 1]);
  return { level: match[1].length, text: closed ? text.slice(0, end).trimEnd() : text };
};

/** The marker a line opens a code fence with (```` ``` ```` or `~~~`), or null. */
const fenceMarker = (trimmed: string): string | null => FENCE.exec(trimmed)?.[1] ?? null;
/**
 * Whether a line closes a fence opened with `marker` — ONE rule for the renderer and the
 * splitter (review of #1022: the splitter closed on any fence line, so a `~~~` inside a
 * ```` ``` ```` block cut the block in two).
 */
const closesFence = (trimmed: string, marker: string): boolean => trimmed.startsWith(marker);

/** Leading indentation of a raw line; a tab counts as four spaces. */
const indentOf = (line: string): number => {
  let width = 0;
  for (const char of line) {
    if (char === ' ' || char === '\u00A0') width++;
    else if (char === '\t') width += 4;
    else break;
  }
  return width;
};

const isTableRow = (line: string): boolean => line.startsWith('|') && line.length > 1;

/**
 * The cells of a pipe-table row. A cell may hold a literal pipe written `\|` (the Confluence
 * converter escapes them): the row splits on UNESCAPED pipes only, then `\|` reads as `|`.
 */
const tableCells = (line: string): string[] => {
  // A scan, not a lookbehind regex: lookbehind is not in every browser this app supports.
  const cells: string[] = [];
  let cell = '';
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (char === '\\' && line[at + 1] === '|') {
      cell += '|';
      at++;
    } else if (char === '|') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  // The row's leading and trailing pipes open and close it; they hold no cell.
  if (line.startsWith('|')) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '' && /(^|[^\\])\|$/.test(line)) cells.pop();
  return cells.map((text) => text.trim());
};

type ListFrame = {
  indent: number;
  tag: 'ul' | 'ol';
  start: number;
  items: Array<{ text: string; nested: string }>;
};

/** One list item's own text: a heading stays a heading, a task item shows its box. */
const listItemHtml = (text: string): string => {
  const heading = parseHeading(text);
  if (heading) return `<h${heading.level}>${inline(heading.text)}</h${heading.level}>`;
  const task = TASK.exec(text);
  if (task) return `${task[1] === ' ' ? '☐' : '☑'} ${inline(text.slice(task[0].length))}`;
  return inline(text);
};

/** Markdown-ish text → HTML (unsanitized; `renderDocumentHtml` sanitizes it). */
export const documentMarkdownToHtml = (raw: string): string => {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  // Open lists, outermost first. An item more indented than the list above it opens a list
  // inside that list's last item (the Confluence converter writes nested lists by indentation).
  let lists: ListFrame[] = [];
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    const frame = lists.pop();
    if (!frame) return;
    const start = frame.tag === 'ol' && frame.start !== 1 ? ` start="${frame.start}"` : '';
    const html = `<${frame.tag}${start}>${frame.items
      .map((item) => `<li>${listItemHtml(item.text)}${item.nested}</li>`)
      .join('')}</${frame.tag}>`;
    const parent = lists[lists.length - 1];
    if (parent) parent.items[parent.items.length - 1].nested += html;
    else out.push(html);
  };
  const flushList = () => {
    while (lists.length) closeList();
  };
  const addListItem = (indent: number, tag: 'ul' | 'ol', start: number, text: string) => {
    while (lists.length && lists[lists.length - 1].indent > indent) closeList();
    let top = lists[lists.length - 1] as ListFrame | undefined;
    if (top && top.indent === indent && top.tag !== tag) {
      closeList();
      top = lists[lists.length - 1];
    }
    if (!top || top.indent < indent || top.tag !== tag) {
      top = { indent, tag, start, items: [] };
      lists = [...lists, top];
    }
    top.items.push({ text, nested: '' });
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

    const fence = fenceMarker(trimmed);
    if (fence) {
      flushAll();
      const code: string[] = [];
      index++;
      while (index < lines.length && !closesFence(lines[index].trim(), fence)) {
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
    const heading = parseHeading(trimmed);
    if (heading) {
      flushAll();
      out.push(`<h${heading.level}>${inline(heading.text)}</h${heading.level}>`);
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
    const item = LIST_ITEM.exec(trimmed);
    if (item) {
      flushPara();
      flushQuote();
      const ordered = /\d/.test(item[1][0]);
      addListItem(indentOf(lines[index]), ordered ? 'ol' : 'ul', ordered ? Number.parseInt(item[1], 10) : 1, item[2]);
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
    ALLOWED_ATTR: ['href', 'target', 'rel', 'start'],
    // Not a URL: without this DOMPurify holds `start="3"` to ALLOWED_URI_REGEXP and drops it.
    ADD_URI_SAFE_ATTR: ['start'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });

/**
 * A long document in parts of about `size` characters, so the preview renders the first part and
 * adds the rest on request: one ~1 MB document rendered at once is a long freeze (sanitizing plus
 * laying out tens of thousands of elements). A part ends at a blank line outside a code fence
 * once it holds `size` characters, so no paragraph, list, table or code block is split. Text with
 * no blank line for `2 × size` characters (a long PDF table, an extracted page) is cut anyway: a
 * table between two rows, its header and separator repeated at the top of the next part; anything
 * else at a line break. A code block is never cut. Fences end by the renderer's own rule.
 */
export const splitIntoSections = (raw: string, size: number): string[] => {
  if (raw.length <= size) return [raw];
  const sections: string[] = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let current: string[] = [];
  let length = 0;
  let fence: string | null = null;
  let tableHead: string[] | null = null;
  const push = (line: string) => {
    current.push(line);
    length += line.length + 1;
  };
  const cut = (carry: string[] = []) => {
    if (current.length) sections.push(current.join('\n'));
    current = [];
    length = 0;
    carry.forEach(push);
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (fence) {
      if (closesFence(trimmed, fence)) fence = null;
      push(line);
      continue;
    }
    if (trimmed === '') {
      tableHead = null;
      if (length >= size) cut();
      else push(line);
      continue;
    }
    const overdue = length >= 2 * size;
    if (isTableRow(trimmed) && TABLE_SEPARATOR.test(lines[index + 1]?.trim() ?? '')) {
      if (overdue) cut();
      tableHead = [line, lines[index + 1]];
      push(line);
      push(lines[index + 1]);
      index++;
      continue;
    }
    if (tableHead && isTableRow(trimmed)) {
      if (overdue) cut(tableHead);
      push(line);
      continue;
    }
    tableHead = null;
    if (overdue) cut();
    fence = fenceMarker(trimmed);
    push(line);
  }
  if (current.length) sections.push(current.join('\n'));
  return sections;
};
