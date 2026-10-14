/**
 * ZET-SUP-1395: the KB tab's "Suggested reply" printed a past reply's source.
 *
 * A generated AI answer is plain text with markdown-ish syntax, so it read fine and the
 * defect stayed invisible; a PAST REPLY / KB answer is stored as the HTML it was sent as,
 * so the agent was shown literal `<p>Hello,</p><p>Here's the full ingredient list…`.
 *
 * The preview renders through `answerToEditorHtml` — the same converter the "Use" button
 * runs — so the last test is the one that matters: preview and insertion cannot drift, and
 * the sanitizer's allowlist applies to both.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AnswerPreview } from '@/components/messages/AnswerPreview';
import { answerToEditorHtml, renderMarkdown } from '@/components/messages/messageDetailConstants';

const PAST_REPLY = "<p>Hello,</p><p>Here's the full ingredient list for Zetatech:</p>";

afterEach(cleanup);

describe('AnswerPreview', () => {
  it('renders a stored HTML reply as text, never as tags', () => {
    const { container } = render(<AnswerPreview answer={PAST_REPLY} />);

    expect(container.textContent).not.toContain('<p>');
    expect(container.textContent).not.toContain('</p>');
    expect(screen.getByText('Hello,')).toBeInTheDocument();
    // The block structure survives as real elements, so paragraphs stay paragraphs.
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('renders a plain-text AI answer, converting its markdown-ish syntax', () => {
    const { container } = render(
      <AnswerPreview answer={'Hello,\n\n- **Myo-Inositol** 2,000 mg'} />
    );

    expect(container.textContent).toContain('Myo-Inositol');
    expect(container.textContent).not.toContain('**');
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('li')).not.toBeNull();
  });

  it('drops markup the composer would not accept either (no script, no onerror)', () => {
    const hostile = '<p>hi</p><script>window.__pwned = 1</script><img src=x onerror=alert(1)>';
    const { container } = render(<AnswerPreview answer={hostile} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('shows exactly what "Use" inserts into the composer', () => {
    const { container } = render(<AnswerPreview answer={PAST_REPLY} />);

    expect(container.firstElementChild?.innerHTML).toBe(answerToEditorHtml(PAST_REPLY));
  });
});

describe('answerToEditorHtml — links survive the markdown rules', () => {
  it('🔴 an underscore URL stays intact (it used to become "reset<em>password</em>guide")', () => {
    expect(
      answerToEditorHtml('Reset here: https://help.example/reset_password_guide now')
    ).toContain('href="https://help.example/reset_password_guide"');
  });

  it('🔴 a bare URL — what polish writes for a kept link — becomes a link; trailing punctuation stays out', () => {
    expect(answerToEditorHtml('See the guide (https://help.example/guide).')).toContain(
      '(<a href="https://help.example/guide">https://help.example/guide</a>).'
    );
  });

  it('CONTROL: markdown links and emphasis still work around it', () => {
    const html = answerToEditorHtml(
      '**Note:** see [the guide](https://help.example/a_b) and _this_.'
    );
    expect(html).toContain('<strong>Note:</strong>');
    expect(html).toContain('<a href="https://help.example/a_b">the guide</a>');
    expect(html).toContain('<em>this</em>');
  });
});

describe('renderMarkdown (plain-text mail in the thread) — links survive the emphasis rules', () => {
  it('🔴 a tracking URL with underscores keeps its target (it pointed at …/order)', () => {
    const html = renderMarkdown('Track it: https://track.example/order_id_123 thanks');
    expect(html).toContain('href="https://track.example/order_id_123"');
    expect(html).not.toContain('<em>');
  });

  it('CONTROL: emphasis, trailing punctuation and line breaks still work', () => {
    expect(renderMarkdown('**Hi** _there_,\nsee https://x.example/a.')).toBe(
      '<strong>Hi</strong> <em>there</em>,<br>see <a href="https://x.example/a" target="_blank" rel="noopener noreferrer">https://x.example/a</a>.'
    );
  });
});

describe('review of #594 — wrappers stay outside the href', () => {
  it.each([
    ['<https://x.example/a>', 'https://x.example/a'],
    ['**https://x.example/a**', 'https://x.example/a'],
    ['`https://x.example/a`', 'https://x.example/a'],
  ])('AI draft: %s links to exactly %s', (input, href) => {
    const html = answerToEditorHtml(`See ${input} now`);
    expect(html).toContain(`href="${href}"`);
    expect(html).not.toMatch(/href="[^"]*(?:&gt;|\*|`)"/);
  });

  it('🔴 a markdown link label keeps its emphasis', () => {
    expect(answerToEditorHtml('[**the guide**](https://x.example/g)')).toContain(
      '<a href="https://x.example/g"><strong>the guide</strong></a>'
    );
  });

  it('thread view: **url** is bold around an exact link', () => {
    expect(renderMarkdown('**https://track.example/1**')).toBe(
      '<strong><a href="https://track.example/1" target="_blank" rel="noopener noreferrer">https://track.example/1</a></strong>'
    );
  });
});
