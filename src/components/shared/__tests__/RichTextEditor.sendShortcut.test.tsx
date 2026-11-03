import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import RichTextEditor from '../RichTextEditor';

/**
 * The real editor (TipTap in jsdom). Send is Ctrl/⌘+Shift+Enter (owner, 2026-11-03): plain
 * Ctrl+Enter sent replies by accident, so it must no longer submit.
 */
async function renderEditor() {
  const onSubmit = vi.fn();
  const { container } = render(
    <RichTextEditor content="<p>hello</p>" onSubmit={onSubmit} initiallyHidden={false} />
  );
  await waitFor(() => expect(container.querySelector('.ProseMirror')).not.toBeNull());
  return { onSubmit, editor: container.querySelector('.ProseMirror') as HTMLElement };
}

describe('RichTextEditor — send shortcut', () => {
  it('🔴 plain Ctrl+Enter / ⌘+Enter does not submit', async () => {
    const { onSubmit, editor } = await renderEditor();
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+Enter submits', async () => {
    const { onSubmit, editor } = await renderEditor();
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('⌘+Shift+Enter submits', async () => {
    const { onSubmit, editor } = await renderEditor();
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true, shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
