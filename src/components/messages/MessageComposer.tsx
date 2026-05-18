import type React from 'react';
import { Send, Paperclip, BookOpen, Reply, StickyNote, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import type { Message } from '@/types';
import { MONO } from './messageDetailConstants';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageComposerProps = {
  message: Message;
  composer: string;
  setComposer: React.Dispatch<React.SetStateAction<string>>;
  composerMode: 'reply' | 'note';
  setComposerMode: React.Dispatch<React.SetStateAction<'reply' | 'note'>>;
  submitting: boolean;
  onSend: () => void;
  richEditorRef: React.RefObject<RichTextEditorHandle>;
  noteEditorRef: React.RefObject<RichTextEditorHandle>;
  onOpenSimilarMessages: () => void;
  selectedFiles: File[];
  onFilesChange: (files: File[]) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageComposer({
  message,
  composer,
  setComposer,
  composerMode,
  setComposerMode,
  submitting,
  onSend,
  richEditorRef,
  noteEditorRef,
  onOpenSimilarMessages,
  selectedFiles,
  onFilesChange,
}: MessageComposerProps) {
  const user = useAuthStore((s) => s.user);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFilesChange(Array.from(e.target.files));
  };

  const handleRemoveFile = (index: number) => {
    onFilesChange(selectedFiles.filter((_, i) => i !== index));
  };

  void message;

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-3 border-t border-border">
      {/* Mode toggle */}
      <div className="flex items-center gap-0 mb-1.5">
        <button
          onClick={() => {
            setComposerMode('reply');
            setComposer('');
          }}
          className={`flex items-center gap-1 px-3 py-1 ${MONO} border-b-2 transition-colors ${composerMode === 'reply' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Reply className="w-2.5 h-2.5" /> REPLY
        </button>
        <button
          onClick={() => {
            setComposerMode('note');
            setComposer('');
          }}
          className={`flex items-center gap-1 px-3 py-1 ${MONO} border-b-2 transition-colors ${composerMode === 'note' ? 'border-amber-500 text-amber-700 dark:text-amber-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <StickyNote className="w-2.5 h-2.5" /> INTERNAL NOTE
        </button>
      </div>

      {/* Input frame */}
      <div
        className={`rounded border ${composerMode === 'note' ? 'border-l-2 border-l-amber-400 border-border dark:border-amber-700 dark:bg-amber-900/10' : 'border-border bg-card'}`}
      >
        {composerMode === 'reply' ? (
          <RichTextEditor
            ref={richEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            placeholder={`Reply as ${user?.firstName ?? 'you'}…`}
            minHeight="52px"
            maxHeight="180px"
            className="rounded-none border-0 shadow-none"
          />
        ) : (
          <RichTextEditor
            ref={noteEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            placeholder="Internal note — only visible to the team…"
            minHeight="52px"
            maxHeight="180px"
            className="rounded-none border-0 shadow-none"
          />
        )}

        {/* Toolbar */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 border-t ${composerMode === 'note' ? 'border-amber-200 dark:border-amber-800/50' : 'border-stone-100 dark:border-zinc-800'}`}
        >
          <label
            className="transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
            title="Attach files"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={submitting}
            />
          </label>
          {composerMode === 'reply' && (
            <button
              onClick={onOpenSimilarMessages}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white transition-colors"
              title="Search knowledge base"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="font-mono text-xs font-semibold">KB</span>
            </button>
          )}
          <span className="font-mono text-[9px] text-muted-foreground/70 ml-1 hidden sm:inline">
            ⌘↵ send
          </span>
          <button
            onClick={onSend}
            disabled={!composer || composer === '<p></p>' || submitting}
            className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded ${MONO} transition-colors disabled:opacity-50 ${
              composerMode === 'note'
                ? 'bg-amber-800 hover:bg-amber-700 text-primary-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            <Send className="w-2.5 h-2.5" />
            {composerMode === 'note' ? 'POST NOTE' : submitting ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {selectedFiles.map((file, i) => (
            <div
              key={file.name}
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
            >
              <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="flex-1 truncate">{file.name}</span>
              <button
                onClick={() => handleRemoveFile(i)}
                className="text-stone-400 hover:text-red-500"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
