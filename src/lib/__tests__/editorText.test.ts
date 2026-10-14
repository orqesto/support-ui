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
  it('a web or mailto: link becomes [[aN]]its words[[/aN]] and its target is collected', () => {
    const targets: string[] = [];
    expect(
      editorHtmlToText(
        '<p>See <a href="https://x.example/a">the guide</a> and <a href="mailto:a@b.example">mail us</a>.</p>',
        { linkTargets: targets }
      )
    ).toBe('See [[a0]]the guide[[/a0]] and [[a1]]mail us[[/a1]].');
    expect(targets).toEqual(['https://x.example/a', 'mailto:a@b.example']);
  });

  it('🔴 a scheme-less autolink (help.example) keeps its link through Translate', () => {
    const targets: string[] = [];
    const text = editorHtmlToText('<p><a href="http://help.example">help.example</a></p>', {
      linkTargets: targets,
    });
    expect(text).toBe('[[a0]]help.example[[/a0]]');
    expect(translatedTextToHtml(text, targets)).toBe(
      '<p><a href="http://help.example">help.example</a></p>'
    );
  });

  it('🔴 words that are a DIFFERENT URL than the href come back as two links, never nested', () => {
    const targets: string[] = [];
    const text = editorHtmlToText('<p><a href="https://b.example/x">https://a.example/y</a></p>', {
      linkTargets: targets,
    });
    expect(text).toBe('https://a.example/y (https://b.example/x)');
    const html = translatedTextToHtml(text, targets);
    expect(html).toBe(
      '<p><a href="https://a.example/y">https://a.example/y</a> (<a href="https://b.example/x">https://b.example/x</a>)</p>'
    );
  });

  it('🔴 table cells stay apart ("Order#123")', () => {
    expect(editorHtmlToText('<table><tr><td>Order</td><td>#123</td></tr></table>')).toBe(
      'Order\n\n#123'
    );
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
    expect(translatedTextToHtml('Intro\n\n- A\n\n- B\n\n2. C\n\n3. D\n\nEnd', [], [2, 3])).toBe(
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

describe('review of #594 — Translate round trip', () => {
  it('🔴 an autolink (text IS the URL) goes out as a bare URL, not in markers', () => {
    const targets: string[] = [];
    expect(
      editorHtmlToText('<p>Track at <a href="https://t.example/x">https://t.example/x</a></p>', {
        linkTargets: targets,
      })
    ).toBe('Track at https://t.example/x');
    expect(targets).toEqual([]);
  });

  it('🔴 a URL right before a marker is not linked across it (no nested anchors)', () => {
    expect(
      translatedTextToHtml('Siehe https://y.example/a [[a0]]hier[[/a0]].', ['https://z.example/b'])
    ).toBe(
      '<p>Siehe <a href="https://y.example/a">https://y.example/a</a> <a href="https://z.example/b">hier</a>.</p>'
    );
    expect(
      translatedTextToHtml('Siehe https://y.example/a[[a0]]hier[[/a0]]', ['https://z.example/b'])
    ).toBe(
      '<p>Siehe <a href="https://y.example/a">https://y.example/a</a><a href="https://z.example/b">hier</a></p>'
    );
  });

  it('🔴 a lone "15. Oktober …" is a date, not a one-item list', () => {
    expect(translatedTextToHtml('15. Oktober liefern wir.')).toBe(
      '<p>15. Oktober liefern wir.</p>'
    );
  });

  it('🔴 a marker number the translator invented keeps its words, never an empty link', () => {
    expect(translatedTextToHtml('[[a1]]hier[[/a1]]', ['https://z.example/b'])).toBe(
      '<p>hier</p><p><a href="https://z.example/b">https://z.example/b</a></p>'
    );
  });
});

describe('review of #597 — list structure is carried through Translate, not guessed', () => {
  /** editorHtmlToText → (translator returns the text unchanged) → translatedTextToHtml. */
  const roundTrip = (html: string, translate = (text: string) => text): string => {
    const linkTargets: string[] = [];
    const listNumbers: number[] = [];
    const text = editorHtmlToText(html, { linkTargets, listNumbers });
    return translatedTextToHtml(translate(text), linkTargets, listNumbers);
  };

  it('🔴 a one-item numbered list stays a list', () => {
    expect(roundTrip('<ol><li><p>only</p></li></ol>')).toBe('<ol><li><p>only</p></li></ol>');
    expect(roundTrip('<ol start="4"><li><p>only</p></li></ol>')).toBe(
      '<ol start="4"><li><p>only</p></li></ol>'
    );
  });

  it('a one-item bulleted list stays a list', () => {
    expect(roundTrip('<ul><li><p>only</p></li></ul>')).toBe('<ul><li><p>only</p></li></ul>');
  });

  it('multi-item lists keep their items and first number, the text around them stays text', () => {
    expect(
      roundTrip(
        '<p>Intro</p><ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol><ul><li><p>A</p></li><li><p>B</p></li></ul><p>End</p>'
      )
    ).toBe(
      '<p>Intro</p><ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol><ul><li><p>A</p></li><li><p>B</p></li></ul><p>End</p>'
    );
  });

  it('a nested list comes back flat, every item still a list item', () => {
    const html =
      '<ol><li><p>Outer</p><ol><li><p>Inner</p></li><li><p>Inner two</p></li></ol></li><li><p>Outer two</p></li></ol>';
    const listNumbers: number[] = [];
    expect(editorHtmlToText(html, { linkTargets: [], listNumbers })).toBe(
      '1. Outer\n\n1. Inner\n\n2. Inner two\n\n2. Outer two'
    );
    expect(listNumbers).toEqual([1, 1, 2, 2]);
    expect(roundTrip(html)).toBe(
      '<ol><li><p>Outer</p></li></ol><ol><li><p>Inner</p></li><li><p>Inner two</p></li></ol><ol start="2"><li><p>Outer two</p></li></ol>'
    );
  });

  it('🔴 "15. Oktober …" stays a paragraph — typed as text, or produced by the translator', () => {
    expect(roundTrip('<p>15. Oktober liefern wir.</p>')).toBe('<p>15. Oktober liefern wir.</p>');
    expect(roundTrip('<p>15. Oktober liefern wir.</p><p>16. Oktober holen wir ab.</p>')).toBe(
      '<p>15. Oktober liefern wir.</p><p>16. Oktober holen wir ab.</p>'
    );
    // English source, German translation: the date only exists on the way back.
    expect(
      roundTrip(
        '<p>We deliver on October 15.</p><ol><li><p>Pack</p></li></ol>',
        () => '15. Oktober liefern wir.\n\n1. Packen'
      )
    ).toBe('<p>15. Oktober liefern wir.</p><ol><li><p>Packen</p></li></ol>');
  });

  it('a list item the translator dropped does not stop the rest from being list items', () => {
    expect(
      roundTrip(
        '<ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol>',
        () => '1. Eins\n\n3. Drei'
      )
    ).toBe('<ol><li><p>Eins</p></li></ol><ol start="3"><li><p>Drei</p></li></ol>');
  });

  it('CONTROL: without the source list numbers, no "n. " paragraph becomes a list', () => {
    expect(translatedTextToHtml('1. One\n\n2. Two')).toBe('<p>1. One</p><p>2. Two</p>');
  });
});
