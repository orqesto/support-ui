import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Code,
  Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type RichTextEditorProps = {
  content?: string;
  onChange?: (html: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
};

export type RichTextEditorHandle = {
  focus: () => void;
};

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      content = '',
      onChange,
      onSubmit,
      placeholder = 'Start typing...',
      editable = true,
      className,
      minHeight = '150px',
      maxHeight,
    },
    ref
  ) => {
    const onSubmitRef = useRef(onSubmit);
    useEffect(() => {
      onSubmitRef.current = onSubmit;
    }, [onSubmit]);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
          link: false,
        }),
        Placeholder.configure({
          placeholder,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 underline hover:text-blue-800',
          },
        }),
      ],
      content,
      editable,
      onUpdate: ({ editor }) => {
        onChange?.(editor.getHTML());
      },
      editorProps: {
        attributes: {
          class:
            'prose prose-sm max-w-none focus:outline-none p-4 bg-background text-foreground dark:prose-invert',
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            onSubmitRef.current?.();
            return true;
          }
          return false;
        },
      },
    });

    // Update editor content when content prop changes
    useEffect(() => {
      if (editor && content !== editor.getHTML()) {
        editor.commands.setContent(content);
      }
    }, [editor, content]);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus();
      },
    }));

    if (!editor) {
      return null;
    }

    const addLink = () => {
      const previousUrl = editor.getAttributes('link').href as string | undefined;
      // eslint-disable-next-line no-alert
      const url = prompt('Enter URL:', previousUrl ?? '');

      if (url === null) {
        return;
      }

      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }

      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    return (
      <div
        className={cn('border rounded-lg overflow-hidden bg-background border-border', className)}
      >
        {editable && (
          <div className="border-b bg-muted/50 p-2 flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('bold') && 'bg-accent')}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('italic') && 'bg-accent')}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('code') && 'bg-accent')}
              title="Code"
            >
              <Code className="h-4 w-4" />
            </Button>

            <div className="w-px h-8 bg-border mx-1" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('bulletList') && 'bg-accent')}
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('orderedList') && 'bg-accent')}
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={cn('h-8 w-8 p-0', editor.isActive('blockquote') && 'bg-accent')}
              title="Quote"
            >
              <Quote className="h-4 w-4" />
            </Button>

            <div className="w-px h-8 bg-border mx-1" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addLink}
              className={cn('h-8 w-8 p-0', editor.isActive('link') && 'bg-accent')}
              title="Add Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>

            <div className="w-px h-8 bg-border mx-1" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="h-8 w-8 p-0"
              title="Undo"
            >
              <Undo className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="h-8 w-8 p-0"
              title="Redo"
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
          <EditorContent editor={editor} className="rich-text-editor" style={{ minHeight }} />
        </div>
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
