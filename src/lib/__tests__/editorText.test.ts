/**
 * editorHtmlToText feeds AI draft's note and Translate. Review of #592: it read only <p>/<h1-3>/<pre>,
 * so text beside them vanished from the note, a no-<p> body fused its blocks, and formatting
 * whitespace and autolinks leaked into the prompt.
 */
import { describe, it, expect } from 'vitest';
import { editorHtmlToText } from '../editorText';

describe('editorHtmlToText', () => {
  it('🔴 text outside the paragraphs is read too (a template body pasted after a <p>)', () => {
    expect(editorHtmlToText('<p>Hi Anna,</p>Your refund was issued today.')).toBe(
      'Hi Anna,\n\nYour refund was issued today.'
    );
  });

  it('🔴 <div> and bare <li> blocks stay apart (no "RefundReplacement")', () => {
    expect(editorHtmlToText('<div>Refund issued.</div><div>Expect it in 3 days.</div>')).toBe(
      'Refund issued.\n\nExpect it in 3 days.'
    );
    expect(editorHtmlToText('<ul><li>Refund</li><li>Replacement</li></ul>')).toBe(
      '- Refund\n\n- Replacement'
    );
  });

  it('🔴 source formatting and &nbsp; collapse to single spaces', () => {
    expect(editorHtmlToText('<p>\n    Your order\n    has&nbsp;&nbsp;shipped\n</p>')).toBe(
      'Your order\nhas shipped'
    );
  });

  it('🔴 an autolink or mailto is not doubled; a real link keeps its URL', () => {
    expect(
      editorHtmlToText('<p><a href="http://help.example/guide">help.example/guide</a></p>')
    ).toBe('help.example/guide');
    expect(editorHtmlToText('<p><a href="mailto:a@b.example">a@b.example</a></p>')).toBe(
      'a@b.example'
    );
    expect(editorHtmlToText('<p>See <a href="https://help.example/guide">the guide</a>.</p>')).toBe(
      'See the guide (https://help.example/guide).'
    );
  });

  it('🔴 an <ol start> keeps its numbering', () => {
    expect(
      editorHtmlToText('<ol start="3"><li><p>Restart</p></li><li><p>Retry</p></li></ol>')
    ).toBe('3. Restart\n\n4. Retry');
  });

  it('CONTROL: a line break inside a paragraph stays a single line break', () => {
    expect(editorHtmlToText('<p>Line one<br>Line two</p>')).toBe('Line one\nLine two');
  });

  it('empty and whitespace-only markup is empty', () => {
    expect(editorHtmlToText('<p></p><div> &nbsp; </div>')).toBe('');
  });
});
