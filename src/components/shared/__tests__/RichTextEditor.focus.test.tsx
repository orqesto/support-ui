import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import RichTextEditor, { type RichTextEditorHandle } from '../RichTextEditor';

/**
 * The real editor (TipTap runs in jsdom): `focus('end')` — what "Use in reply" calls after it
 * appends a paragraph — puts the caret at the END of the text, so the agent keeps typing after
 * the sentence; a bare `focus()` keeps the caret where it was.
 */

const renderEditor = async () => {
  const ref = createRef<RichTextEditorHandle>();
  const { container } = render(
    <RichTextEditor ref={ref} content="<p>Hello world</p>" initiallyHidden={false} />
  );
  // TipTap hangs its editor on the ProseMirror element.
  const editorOf = () =>
    container.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')?.editor;
  await waitFor(() => expect(editorOf()?.getText()).toBe('Hello world'));
  const editor = editorOf()!;
  // The caret at the start of the text.
  act(() => {
    editor.commands.setTextSelection(1);
  });
  return { ref, editor };
};

describe('RichTextEditor — focus(position)', () => {
  it("focus('end') puts the caret at the end of the text", async () => {
    const { ref, editor } = await renderEditor();
    expect(editor.state.selection.from).toBe(1);
    act(() => ref.current!.focus('end'));
    const end = editor.state.doc.content.size - 1; // inside the paragraph, after "world"
    expect(editor.state.selection.from).toBe(end);
    expect(editor.state.selection.to).toBe(end);
  });

  it('CONTROL: a bare focus() keeps the caret where it was', async () => {
    const { ref, editor } = await renderEditor();
    act(() => ref.current!.focus());
    expect(editor.state.selection.from).toBe(1);
  });
});
