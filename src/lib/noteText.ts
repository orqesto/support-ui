import { editorHtmlToText, escapeHtml } from './editorText';

/**
 * Internal notes are PLAIN TEXT: the Notes tab writes them from a textarea, and both views
 * (`ThreadNoteItem`, the Notes tab in `MessagePanelTabs`) print them as text.
 *
 * 🔴 The thread composer's "Internal note" mode is the rich-text editor, and it posted its HTML
 * as is — so a note written there showed as `<p>Customer moved to the new site…</p>` in the
 * thread (found recording a demo, 2026-10-14; every channel, since notes are channel-agnostic).
 * `noteFromEditor` turns the editor's HTML into the note's text before it is posted, and
 * `noteText` reads a note already stored as editor HTML as text, so those older notes read right
 * too. A plain note is returned untouched — "a < b" or a pasted "<b>" stays exactly as typed.
 */
const EDITOR_HTML = /^\s*<(p|div|ul|ol|blockquote|pre|h[1-6])[\s>]/i;

export const noteFromEditor = (html: string): string => editorHtmlToText(html);

/**
 * Whether stored text is the rich editor's HTML (it always opens with a block tag). Everything
 * else that writes a comment — the thread's note box, the Jira sync, the Zendesk import, the
 * backend's own notes — writes plain text, so this is how a view tells the two apart.
 */
export const isEditorHtml = (content: string): boolean => EDITOR_HTML.test(content);

export const noteText = (content: string): string =>
  isEditorHtml(content) ? editorHtmlToText(content) : content;

/**
 * How the server stored a comment's text (`contentFormat`, on every comment from
 * GET /api/tickets/:id/comments and GET /api/messages/:id/notes): `'html'` = the rich editor's
 * HTML, through the server's sanitiser — entities escaped ("Tom &amp; Jerry"), and it may OPEN
 * WITH TEXT when the sanitiser stripped a leading tag ("Title<p>body</p>"); `'text'` = plain
 * text (a thread note, a hold note, a Jira or Zendesk comment, a lead escalation).
 */
export type NoteFormat = 'html' | 'text';

export type NoteBody = {
  content: string;
  contentFormat?: string | null;
  /** The thread a comment belongs to; set ⇒ a thread note (plain text). Absent on older backends. */
  messageId?: number | null;
};

/**
 * Where the note was read from: `'thread'` = GET /api/messages/:id/notes (the Notes tab, the
 * thread itself), `'ticket'` = GET /api/tickets/:id/comments (the ticket page).
 */
export type NoteOrigin = 'thread' | 'ticket';

/** How a view shows a note: sanitised HTML, or text printed as is. */
export type NoteDisplay = { kind: 'html'; html: string } | { kind: 'text'; text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&#…;` `&#x…;` as the characters, in ONE pass (so
 * "&amp;lt;" reads "&lt;", never "<"). Anything else is left exactly as typed.
 */
export const decodeEntities = (text: string): string =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const code =
      name[1] === 'x' || name[1] === 'X'
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

/**
 * THE decision, for every view of a note (NoteContent: the Notes tab and the ticket page;
 * noteBodyText: the thread itself), so two views of one note never disagree:
 *
 * - `contentFormat` present: obeyed, strictly.
 * - Absent (an older backend), a THREAD note — read from a thread, or a comment with `messageId`:
 *   always plain text. A thread note is typed as text, so "waiting for <supplier> quote, call
 *   <b>asap</b>" or "R&amp;D" is printed exactly as typed (review of #902: the widened guess
 *   dropped `<supplier>`, bolded `<b>`, decoded the entity and collapsed the line breaks). Only
 *   a note that OPENS with a block tag — the rich editor's output, an old composer note or an
 *   origin ticket's comment — is read as its text (`noteText`), never rendered as markup.
 * - Absent, a ticket comment: the narrow shape test — HTML only when it opens with a block tag
 *   (`isEditorHtml`); anything else is text with the server's escaped entities decoded
 *   ("Tom &amp; Jerry" reads "Tom & Jerry"). A typed inline tag is never HTML.
 */
export const noteDisplay = (note: NoteBody, origin: NoteOrigin): NoteDisplay => {
  if (note.contentFormat === 'html') return { kind: 'html', html: note.content };
  if (note.contentFormat === 'text') return { kind: 'text', text: note.content };
  if (origin === 'thread' || typeof note.messageId === 'number')
    return { kind: 'text', text: noteText(note.content) };
  if (isEditorHtml(note.content)) return { kind: 'html', html: note.content };
  return { kind: 'text', text: decodeEntities(note.content) };
};

/**
 * A note as plain text, whatever it was stored as (the thread view prints text only), by the
 * same decision as NoteContent (`noteDisplay`).
 */
export const noteBodyText = (note: NoteBody, origin: NoteOrigin): string => {
  const display = noteDisplay(note, origin);
  if (display.kind === 'text') return display.text;
  // A leading tag the server stripped leaves its words as bare text before the first block
  // ("Title<p>body</p>"); its own paragraph, or it runs into the body ("Titlebody").
  return editorHtmlToText(display.html.replace(/^([^<]*\S[^<]*)(?=<)/, '<p>$1</p>'));
};

/**
 * A thread note put into the rich editor to be edited (the Notes tab): its text, escaped, each
 * line break a `<br>` — so "waiting for <supplier>" and its line breaks reach the editor as typed.
 * A note shown as HTML goes in as its HTML. Saved back through `noteFromEditor` (plain text).
 */
export const noteToEditor = (note: NoteBody, origin: NoteOrigin): string => {
  const display = noteDisplay(note, origin);
  if (display.kind === 'html') return display.html;
  // One paragraph, its lines joined by <br>: `noteFromEditor` reads that back as the same lines
  // (paragraphs would come back with a blank line between each).
  return `<p>${display.text.split('\n').map(escapeHtml).join('<br>')}</p>`;
};
