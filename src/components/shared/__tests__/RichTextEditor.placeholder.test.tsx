import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import RichTextEditor from '../RichTextEditor';

/**
 * The real editor (TipTap runs in jsdom): useEditor reads its options once, so a placeholder that
 * changes after mount — the reply hint, once the AI settings load — must still reach the empty
 * editor rather than keep the first text.
 */

const shownPlaceholder = (container: HTMLElement) =>
  container.querySelector('.ProseMirror p.is-editor-empty')?.getAttribute('data-placeholder');

describe('RichTextEditor — placeholder', () => {
  it('shows a placeholder that changed after mount', async () => {
    const { container, rerender } = render(
      <RichTextEditor placeholder="First text" initiallyHidden={false} />
    );
    await waitFor(() => expect(shownPlaceholder(container)).toBe('First text'));
    rerender(<RichTextEditor placeholder="Second text" initiallyHidden={false} />);
    await waitFor(() => expect(shownPlaceholder(container)).toBe('Second text'));
  });
});
