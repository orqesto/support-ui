/**
 * isEditorHtml must know every block the editor can open a document with (review of #999: a reply
 * opening with a horizontal rule was read as plain text and escaped on resend). Pinned against the
 * schema itself: a new block extension fails here until the detector and the samples know it.
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions, normalizeEditorHtml } from '../editorSchema';
import { isEditorHtml, isWholeEditorHtml } from '../noteText';

const SAMPLES: Record<string, string> = {
  paragraph: '<p>text</p>',
  heading: '<h2>title</h2>',
  blockquote: '<blockquote><p>quoted</p></blockquote>',
  bulletList: '<ul><li><p>one</p></li></ul>',
  orderedList: '<ol><li><p>one</p></li></ol>',
  codeBlock: '<pre><code>x = 1</code></pre>',
  horizontalRule: '<hr><p>after a rule</p>',
};

describe('isEditorHtml knows every block the editor schema has', () => {
  const editor = new Editor({ extensions: editorExtensions });
  const blocks = Object.entries(editor.schema.nodes)
    .filter(([, type]) => type.isBlock && type.name !== 'doc' && type.name !== 'listItem')
    .map(([name]) => name)
    .sort();
  editor.destroy();

  it('the schema has exactly the blocks sampled here', () => {
    expect(blocks).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(Object.entries(SAMPLES))('%s, as the editor writes it, is editor HTML', (_name, html) => {
    expect(isEditorHtml(normalizeEditorHtml(html))).toBe(true);
  });

  it.each(Object.entries(SAMPLES))(
    '%s, as the editor writes it, is whole editor HTML (Resend keeps it)',
    (_name, html) => {
      expect(isWholeEditorHtml(normalizeEditorHtml(html))).toBe(true);
    }
  );

  it('a multi-block reply is whole editor HTML', () => {
    expect(isWholeEditorHtml('<p>Hello</p><ul><li><p>one</p></li></ul><hr>')).toBe(true);
  });

  it.each([
    ['opens with a tag and goes on as text', '<p> see the list below'],
    ['a closed tag followed by text', '<p>Hi</p> and more'],
    ['text between blocks', '<p>one</p> loose <p>two</p>'],
    ['plain text', 'Hello, 3 < 5'],
  ])('plain text that %s is not whole editor HTML', (_name, text) => {
    expect(isWholeEditorHtml(text)).toBe(false);
  });

  it('CONTROL: plain text is not', () => {
    expect(isEditorHtml('Hello, 3 < 5 & <hr> later')).toBe(false);
  });
});
