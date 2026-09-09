/**
 * ORB-SUP-1395: the KB tab's "Suggested reply" printed a past reply's source.
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
import { answerToEditorHtml } from '@/components/messages/messageDetailConstants';

const PAST_REPLY = "<p>Hello,</p><p>Here's the full ingredient list for Orbelli:</p>";

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
    const { container } = render(<AnswerPreview answer={'Hello,\n\n- **Myo-Inositol** 2,000 mg'} />);

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
