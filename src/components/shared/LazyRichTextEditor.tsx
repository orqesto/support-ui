import { forwardRef, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import type { RichTextEditorHandle, RichTextEditorProps } from './RichTextEditor';

/**
 * The rich-text editor, loaded when one is first shown. TipTap is ~390 kB of the bundle; imported
 * statically it loaded with the inbox for every agent who only reads. Its chunk now loads the
 * first time a composer (or any other editor) renders, and is cached from then on.
 *
 * Same props and ref handle as RichTextEditor. While the chunk loads, a box of the editor's own
 * frame and height stands in, so the layout does not jump when it arrives.
 */
const Editor = lazy(() => import('./RichTextEditor'));

const EditorPlaceholder = ({
  className,
  minHeight = '150px',
  transparent,
  initiallyHidden,
  editable = true,
}: RichTextEditorProps) => (
  <div
    aria-busy="true"
    className={cn(
      'border rounded-lg border-border',
      transparent ? 'bg-transparent' : 'bg-background',
      className
    )}
  >
    {/* The toolbar row (h-7 buttons + p-2) and the text area, as the editor draws them. */}
    {editable && !initiallyHidden && <div className="h-[45px] border-b bg-muted/50" />}
    <div style={{ minHeight: initiallyHidden ? undefined : minHeight }} />
  </div>
);

const LazyRichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>((props, ref) => (
  <Suspense fallback={<EditorPlaceholder {...props} />}>
    <Editor ref={ref} {...props} />
  </Suspense>
));

LazyRichTextEditor.displayName = 'LazyRichTextEditor';

export default LazyRichTextEditor;
export type { RichTextEditorHandle, RichTextEditorProps };
