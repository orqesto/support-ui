import { beforeAll, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import RichTextEditor, { type RichTextEditorHandle } from '../RichTextEditor';

/**
 * The real editor (TipTap runs in jsdom): `focus('end')` — what "Use in reply" calls after it
 * appends a paragraph — puts the caret at the END of the text, so the agent keeps typing after
 * the sentence; a bare `focus()` keeps the caret where it was.
 */

// jsdom has no layout for a Range. TipTap's focus() scrolls the caret into view a frame later
// (ProseMirror coordsAtPos → Range.getClientRects); without these the throw landed after the test
// as an unhandled error and the suite exited 1 with every test green (loaded full runs).
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

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
    // Let the deferred scroll-into-view run inside the test, so a throw there fails THIS file.
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('CONTROL: a bare focus() keeps the caret where it was', async () => {
    const { ref, editor } = await renderEditor();
    act(() => ref.current!.focus());
    expect(editor.state.selection.from).toBe(1);
  });
});
