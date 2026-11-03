import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RichTextEditor from '../RichTextEditor';

// jsdom has no layout; expanding the editor focuses it and ProseMirror scrolls through these
// (an unhandled TypeError here fails CI with every test green). Same stubs as the locked test.
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
 * The real editor (TipTap runs in jsdom). Collapsed, it is one line: the HINT while it is empty,
 * but the DRAFT's own first words once there is text — showing the hint over a draft made the draft
 * look gone while Send would still send it (owner, 2026-11-03). Its toolbar Collapse is handed to
 * the host when one is given (the reply box folds itself away), else it only collapses the editor.
 */
describe('RichTextEditor — collapsed with a draft', () => {
  it('shows the draft, not the hint, on its collapsed line', async () => {
    render(<RichTextEditor placeholder="Reply as Ada…" content="<p>Half-written answer</p>" />);
    const line = await screen.findByTestId('rich-text-collapsed-line');
    expect(line).toHaveTextContent('Half-written answer');
    expect(line).not.toHaveTextContent('Reply as Ada…');
  });

  it('CONTROL: an empty editor shows the hint', async () => {
    render(<RichTextEditor placeholder="Reply as Ada…" content="<p></p>" />);
    expect(await screen.findByTestId('rich-text-collapsed-line')).toHaveTextContent(
      'Reply as Ada…'
    );
  });

  it('Collapse goes to the host when it gives one', async () => {
    const onCollapse = vi.fn();
    render(<RichTextEditor placeholder="Reply" content="<p>Text</p>" onCollapse={onCollapse} />);
    fireEvent.click(await screen.findByTestId('rich-text-collapsed-line'));
    fireEvent.click(await screen.findByRole('button', { name: /Collapse/ }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: without a host handler Collapse collapses the editor itself, draft still shown', async () => {
    render(<RichTextEditor placeholder="Reply" content="<p>Text kept</p>" />);
    fireEvent.click(await screen.findByTestId('rich-text-collapsed-line'));
    fireEvent.click(await screen.findByRole('button', { name: /Collapse/ }));
    await waitFor(() =>
      expect(screen.getByTestId('rich-text-collapsed-line')).toHaveTextContent('Text kept')
    );
  });
});
