import { Editor } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';

/**
 * The rich-text editor's document schema — ONE list, used by RichTextEditor and by
 * normalizeEditorHtml, so HTML can be put in exactly the form the editor will hold it in.
 * (Placeholder is added by the editor itself; it renders nothing into the HTML.)
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-primary underline hover:text-primary/80',
    },
  }),
];

/**
 * HTML as the editor will serialise it: a link gains `target`, `rel` and `class`, a list item
 * gets its `<p>`. Put this, not the raw HTML, into the composer when anything compares against
 * it later — the AI draft's "as applied" record (reply_style diffs it against the sent body) and
 * its language badge never matched the editor's own HTML otherwise (review of #595).
 */
export const normalizeEditorHtml = (html: string): string => {
  // A short-lived headless editor, not generateHTML: the live editor's plugins also shape its HTML
  // (the trailing empty paragraph after a list), and only an editor runs them.
  // Content goes in through setContent — a transaction, as in the composer — so the plugins that
  // append to a transaction run; initial content is not one.
  const editor = new Editor({ extensions: editorExtensions });
  try {
    editor.commands.setContent(html);
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
};
