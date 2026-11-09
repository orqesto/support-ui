import { editorHtmlToText } from './editorText';

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
 * WITH TEXT when the sanitiser stripped a leading `<h1>` ("Title<p>body</p>"); `'text'` = plain
 * text (a thread note, a hold note, a Jira or Zendesk comment, a lead escalation).
 */
export type NoteFormat = 'html' | 'text';

export type NoteBody = { content: string; contentFormat?: string | null };

/** A tag the note views render, or an escaped entity: legacy HTML that opens with text. */
const LEGACY_HTML =
  /<\/?(p|br|b|i|u|strong|em|ul|ol|li|code|pre|h[1-3])(\s[^>]*)?\/?>|&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i;

/**
 * Whether a note's or comment's text is HTML. The server's `contentFormat` decides when present.
 * Without it (an older backend), the old shape test, widened: text that opens with a block tag,
 * OR carries one of the tags the views render, OR an escaped entity, is HTML — so a ticket comment
 * stored as "Title<p>body</p>" or "Tom &amp; Jerry" renders as it did before notes became plain
 * text (review of #897), and only text with none of those reads as plain.
 */
export const noteIsHtml = (note: NoteBody): boolean => {
  if (note.contentFormat === 'html') return true;
  if (note.contentFormat === 'text') return false;
  return isEditorHtml(note.content) || LEGACY_HTML.test(note.content);
};

/**
 * A note as plain text, whatever it was stored as (the thread view prints text only). By
 * `contentFormat` when present; without it, `noteText`'s narrower test as before — this view
 * PRINTS the text, so the widened guess would eat a typed "<b>" rather than render it.
 */
export const noteBodyText = (note: NoteBody): string => {
  // A leading heading the server stripped leaves its words as bare text before the first block
  // ("Title<p>body</p>"); its own paragraph, or it runs into the body ("Titlebody").
  if (note.contentFormat === 'html')
    return editorHtmlToText(note.content.replace(/^([^<]*\S[^<]*)(?=<)/, '<p>$1</p>'));
  if (note.contentFormat === 'text') return note.content;
  return noteText(note.content);
};
