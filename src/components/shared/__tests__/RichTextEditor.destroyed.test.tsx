import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import RichTextEditor, { type RichTextEditorHandle } from '../RichTextEditor';

/**
 * A ticket page crashed into "Something went wrong" on a phone (2026-11): the reply box read its
 * TipTap editor after TipTap had destroyed it. `destroy()` nulls the editor's schema and command
 * manager, so `getHTML()` threw "null is not an object (evaluating 'e.cached')" and `.commands`
 * threw "... 'this.commandManager.commands'". A destroyed editor must be skipped, not used.
 */

const renderEditor = async (content = '<p>Hello world</p>') => {
  const ref = createRef<RichTextEditorHandle>();
  const view = render(<RichTextEditor ref={ref} content={content} initiallyHidden={false} />);
  const editorOf = () =>
    view.container.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')?.editor;
  await waitFor(() => expect(editorOf()?.getText()).toBe('Hello world'));
  return { ref, view, editor: editorOf()! };
};

describe('RichTextEditor — a destroyed editor does not crash the page', () => {
  it('a new content prop after destroy does not throw', async () => {
    const { ref, view, editor } = await renderEditor();
    act(() => editor.destroy());
    expect(() =>
      view.rerender(
        <RichTextEditor ref={ref} content="<p>Changed</p>" initiallyHidden={false} />
      )
    ).not.toThrow();
  });

  it('the imperative handle is a no-op after destroy', async () => {
    const { ref, editor } = await renderEditor();
    act(() => editor.destroy());
    expect(() => {
      ref.current!.setContent('<p>x</p>');
      ref.current!.focus();
      ref.current!.focus('end');
      ref.current!.insertText('x');
      ref.current!.getTranslationText();
      ref.current!.applyTranslation('x');
    }).not.toThrow();
  });

  it('CONTROL: a live editor still takes a new content prop and the handle', async () => {
    const { ref, view, editor } = await renderEditor();
    view.rerender(<RichTextEditor ref={ref} content="<p>Changed</p>" initiallyHidden={false} />);
    await waitFor(() => expect(editor.getText()).toBe('Changed'));
    act(() => ref.current!.setContent('<p>From handle</p>'));
    expect(editor.getText()).toBe('From handle');
  });
});
