/**
 * editorHtmlToText feeds AI draft's note and Translate. Review of #592: it read only <p>/<h1-3>/<pre>,
 * so text beside them vanished from the note, a no-<p> body fused its blocks, and formatting
 * whitespace and autolinks leaked into the prompt.
 */
import { describe, it, expect } from 'vitest';
import { editorHtmlToText, translatedTextToHtml } from '../editorText';

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

describe('editorHtmlToText — links as markers (Translate)', () => {
  it('a link becomes [[aN]]its words[[/aN]] and its URL is collected', () => {
    const targets: string[] = [];
    expect(
      editorHtmlToText(
        '<p>See <a href="https://x.example/a">the guide</a> and <a href="mailto:a@b.example">mail</a>.</p>',
        {
          linkTargets: targets,
        }
      )
    ).toBe('See [[a0]]the guide[[/a0]] and mail.');
    expect(targets).toEqual(['https://x.example/a']);
  });
});

describe('translatedTextToHtml', () => {
  const URL = 'https://x.example/a?b=1&c=2';

  it('rebuilds the link around the translated words, URL attribute-escaped', () => {
    expect(translatedTextToHtml('Siehe [[a0]]die Anleitung[[/a0]].', [URL])).toBe(
      '<p>Siehe <a href="https://x.example/a?b=1&amp;c=2">die Anleitung</a>.</p>'
    );
  });

  it('⛔ a translator that broke the markers never loses the URL', () => {
    // Opening marker gone: the URL is kept beside the words.
    expect(translatedTextToHtml('Siehe die Anleitung[[/a0]].', [URL])).toBe(
      '<p>Siehe die Anleitung (<a href="https://x.example/a?b=1&amp;c=2">https://x.example/a?b=1&amp;c=2</a>).</p>'
    );
    // Closing marker gone: the stray opening marker is dropped, the link added after.
    expect(translatedTextToHtml('Siehe [[a0]]die Anleitung.', [URL])).toBe(
      '<p>Siehe die Anleitung.</p><p><a href="https://x.example/a?b=1&amp;c=2">https://x.example/a?b=1&amp;c=2</a></p>'
    );
    // Both gone.
    expect(translatedTextToHtml('Siehe die Anleitung.', [URL])).toBe(
      '<p>Siehe die Anleitung.</p><p><a href="https://x.example/a?b=1&amp;c=2">https://x.example/a?b=1&amp;c=2</a></p>'
    );
  });

  it('runs of "- " / "n. " paragraphs become real lists; an <ol> keeps its first number', () => {
    expect(translatedTextToHtml('Intro\n\n- A\n\n- B\n\n2. C\n\n3. D\n\nEnd')).toBe(
      '<p>Intro</p><ul><li><p>A</p></li><li><p>B</p></li></ul><ol start="2"><li><p>C</p></li><li><p>D</p></li></ol><p>End</p>'
    );
  });

  it('everything else is TEXT: markup-looking characters, underscores, bare URLs linked', () => {
    expect(
      translatedTextToHtml('Use <b>x</b> & {first_name|there} at https://y.example/a_b_c.')
    ).toBe(
      '<p>Use &lt;b&gt;x&lt;/b&gt; &amp; {first_name|there} at <a href="https://y.example/a_b_c">https://y.example/a_b_c</a>.</p>'
    );
  });
});
