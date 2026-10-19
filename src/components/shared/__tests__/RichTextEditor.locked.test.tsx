import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RichTextEditor from '../RichTextEditor';

// jsdom has no layout; a TipTap command focuses the editor and ProseMirror scrolls through these
// (an unhandled TypeError here fails CI with every test green).
const layoutStubs = {
  getClientRects: (): DOMRectList =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList,
  getBoundingClientRect: (): DOMRect => new DOMRect(),
};
for (const [name, value] of Object.entries(layoutStubs)) {
  if (!(name in Range.prototype)) {
    Object.defineProperty(Range.prototype, name, { value, configurable: true });
  }
}

/**
 * The real editor (TipTap in jsdom). `locked` (an AI draft or a send in flight) blocks typing via
 * setEditable(false) — which does NOT stop TipTap commands, so the formatting row still changed
 * the text (review of #641: Bullet List turned "hello" into a list while locked).
 */
describe('RichTextEditor — locked', () => {
  it('🔴 every formatting button is disabled, and pressing one changes nothing', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor content="<p>hello</p>" onChange={onChange} initiallyHidden={false} locked />
    );
    await waitFor(() => expect(container.querySelector('.ProseMirror')).not.toBeNull());
    for (const name of ['Bold', 'Italic', 'Bullet List', 'Numbered List', 'Quote', 'Add Link']) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
    const callsBefore = onChange.mock.calls.length;
    // userEvent, like a person: a button in a disabled fieldset gets no click.
    await userEvent.click(screen.getByLabelText('Bullet List')).catch(() => undefined);
    expect(onChange.mock.calls.length).toBe(callsBefore);
    expect(container.querySelector('.ProseMirror ul')).toBeNull();
  });

  it('CONTROL: unlocked, the same button formats the text', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor content="<p>hello</p>" onChange={onChange} initiallyHidden={false} />
    );
    await waitFor(() => expect(container.querySelector('.ProseMirror')).not.toBeNull());
    expect(screen.getByLabelText('Bullet List')).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Bullet List'));
    await waitFor(() => expect(container.querySelector('.ProseMirror ul')).not.toBeNull());
  });
});
