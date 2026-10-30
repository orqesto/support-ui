/**
 * The lazy editor stands in for RichTextEditor everywhere: same props, same ref handle. While its
 * chunk loads a placeholder of the editor's height holds the layout; then the editor itself.
 */
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { RichTextEditorHandle } from '../RichTextEditor';

vi.unmock('@/components/shared/LazyRichTextEditor');
vi.mock('../RichTextEditor', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  const Editor = forwardRef<Partial<RichTextEditorHandle>, { content?: string }>(
    ({ content }, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => undefined }));
      return <div data-testid="editor">{content}</div>;
    }
  );
  Editor.displayName = 'EditorStub';
  return { default: Editor };
});

const { default: LazyRichTextEditor } = await import('../LazyRichTextEditor');

describe('LazyRichTextEditor', () => {
  it('shows a placeholder of the editor height first, then the editor with its ref', async () => {
    const ref = createRef<RichTextEditorHandle>();
    const { container } = render(
      <LazyRichTextEditor ref={ref} content="Hello" minHeight="120px" />
    );
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.innerHTML).toContain('min-height: 120px');
    await waitFor(() => expect(screen.getByTestId('editor').textContent).toBe('Hello'));
    expect(typeof ref.current?.focus).toBe('function');
  });
});
