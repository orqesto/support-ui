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
