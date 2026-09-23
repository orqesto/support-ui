import type React from 'react';
import { useState } from 'react';
import { Send, Paperclip, BookOpen, FileText, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import RichTextEditor, { extractImageFiles } from '@/components/shared/RichTextEditor';
import { ComposerAiActions } from './ComposerAiActions';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { isBlankRichText } from '@/lib/stripHtml';
import { RecipientFields, replyToLabel, type RecipientDraft } from './RecipientFields';
import type { AiDraft } from '@/services/message.service';
import type { Message } from '@/types';
import { LABEL } from './messageDetailConstants';

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
  /** Single-key shortcuts that act in this view (detailShortcuts.ts); omitted, no hint shows. */
  shortcutHint?: string;
  /** The resolve decisions (ResolveDecisions), rendered last — under the reply. */
  decisions?: React.ReactNode;
  /**
   * Set when the channel forbids sending right now (WhatsApp's 24-hour window). Disables
   * send and is shown above the composer. Never set for internal notes — those are not
   * delivered to the customer, so no channel rule applies.
   */
  sendBlockedReason?: string | null;
  /** e.g. "2h 30m" — how long a WhatsApp reply window has left. */
  windowRemaining?: string | null;
  windowTone?: 'none' | 'info' | 'warning' | 'blocked';
  /**
   * Opens the approved-template picker. Offered ONLY from the blocked notice: a template
   * is what the agent needs precisely when free-form is refused, and putting it in the
   * toolbar would invite a billable send on conversations where a free reply was legal.
   * Absent when the channel has no templates to offer.
   */
  onUseTemplate?: (() => void) | null;
  /**
   * To/Cc/Bcc for this reply. Absent for channels with no addressing — the
   * fields are only meaningful on email, and a Cc box on a Telegram thread
   * would be a promise the transport can't keep.
   */
  recipientDraft?: RecipientDraft;
  onRecipientDraftChange?: (draft: RecipientDraft) => void;
  /**
   * Reports which AI mode produced the text now in the composer (null when the
   * agent undoes back to their own text), so the send can be stamped with its
   * true author. The second argument is that draft as applied, carried on the
   * send for reply_style capture (undefined on undo).
   */
  onAiSourceChange?: (source: string | null, draft?: AiDraft) => void;
  /** L2 P4: the shared note for the AI draft — the lookup panel adds records to this same text. */
  aiNote?: string;
  onAiNoteChange?: (next: string) => void;
  /** Bumped when a record was added, so the note box comes on screen to show it. */
  aiNoteReveal?: number;
};

// ─── Component ────────────────────────────────────────────────────────────────

// v3 ".ibtn": a quiet bordered tool button.
const IBTN =
  'inline-flex items-center gap-[5px] px-[9px] py-1 rounded-[7px] border border-border bg-card text-muted-foreground text-[11.5px] hover:border-border-strong hover:text-foreground transition-colors';

export function MessageComposer({
  message,
  composer,
  setComposer,
  composerMode,
  setComposerMode,
  recipientDraft,
  onRecipientDraftChange,
  submitting,
  onSend,
  richEditorRef,
  noteEditorRef,
  onOpenSimilarMessages,
  selectedFiles,
  onFilesChange,
  sendBlockedReason = null,
  windowRemaining = null,
  windowTone = 'none',
  onUseTemplate = null,
  onAiSourceChange,
  aiNote,
  onAiNoteChange,
  aiNoteReveal,
  shortcutHint,
  decisions,
}: MessageComposerProps) {
  const user = useAuthStore((store) => store.user);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onFilesChange([...selectedFiles, ...Array.from(event.target.files)]);
    // Reset so selecting the SAME file again still fires onChange.
    event.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    onFilesChange(selectedFiles.filter((_, idx) => idx !== index));
  };

  // Append image files pasted (Ctrl+V) or dropped into the composer.
  const addImageFiles = (files: File[]) => {
    if (files.length) onFilesChange([...selectedFiles, ...files]);
  };

  return (
    <div
      className="flex-shrink-0 px-3.5 pt-[9px] pb-[11px] border-t border-border bg-card"
      onDragOver={(event) => {
        if (submitting) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        // Ignore leaves into child elements; only clear when leaving the composer.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        setIsDragging(false);
        // Always prevent the browser from opening/navigating to a dropped file.
        event.preventDefault();
        if (submitting) return;
        // Drops that land on the editor are handled by the editor's own drop
        // handler — skip here so the image isn't attached twice (the native drop
        // event bubbles up to this container too).
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('[contenteditable="true"]')) return;
        const images = extractImageFiles(event.dataTransfer);
        if (images.length) addImageFiles(images);
      }}
    >
      {/* v3: the two things this box can do, as tabs — the mode used to be reachable only from
          the Notes tab or the N key, so nothing on screen said a note was an option here. The
          key hint sits on the right, built from the same context the shortcuts read. */}
      <div className="flex items-center gap-[15px] mb-2" role="group" aria-label="Composer mode">
        {(['reply', 'note'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={composerMode === mode}
            onClick={() => {
              setComposerMode(mode);
              setTimeout(
                () => (mode === 'note' ? noteEditorRef : richEditorRef).current?.focus(),
                0
              );
            }}
            className={`pb-[5px] border-b-2 ${LABEL} tracking-[0.1em] transition-colors ${
              composerMode === mode
                ? mode === 'note'
                  ? 'border-note text-note'
                  : 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode === 'reply' ? 'Reply' : 'Internal note'}
          </button>
        ))}
        {shortcutHint && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground hidden sm:inline">
            {shortcutHint}
          </span>
        )}
      </div>

      {/* WhatsApp 24-hour window. Shown ABOVE the input so the agent reads it before
          typing, not after pressing send. Only rendered when there is something to say —
          a permanent banner would train people to ignore this space. */}
      {(sendBlockedReason || windowRemaining) && windowTone !== 'info' && (
        <div
          role={windowTone === 'blocked' ? 'alert' : 'status'}
          className={`mb-2 px-2.5 py-[7px] text-[12.5px] rounded-[9px] border ${
            windowTone === 'blocked'
              ? 'border-destructive-line bg-destructive-muted text-destructive'
              : 'border-warning-line bg-warning-muted text-warning'
          }`}
        >
          {sendBlockedReason}
          {windowRemaining && !sendBlockedReason && (
            <span>
              {' '}
              Closes in <strong>{windowRemaining}</strong>.
            </span>
          )}
          {sendBlockedReason && onUseTemplate && (
            <Button
              variant="ghost"
              onClick={onUseTemplate}
              className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 h-auto rounded border border-current text-[11px] font-semibold"
            >
              <FileText className="w-3 h-3" />
              Use an approved template
            </Button>
          )}
        </div>
      )}

      {/* Input frame — `relative` anchors the AI panel, which opens upward. */}
      <div
        className={`relative rounded-[10px] border transition-[border-color,box-shadow] ${
          isDragging
            ? 'border-primary border-dashed ring-2 ring-primary/30'
            : composerMode === 'note'
              ? 'border-note-line border-l-[3px] border-l-note bg-note-muted'
              : 'border-border bg-raised focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary-muted'
        }`}
      >
        {/* Addressing, above the editor as in any mail client. Reply-only: an
            internal note is not delivered to anyone. */}
        {composerMode === 'reply' && recipientDraft && onRecipientDraftChange && (
          <RecipientFields
            draft={recipientDraft}
            onChange={onRecipientDraftChange}
            defaultTo={replyToLabel(message)}
            disabled={submitting}
          />
        )}
        {composerMode === 'reply' ? (
          <RichTextEditor
            // Keyed by mode: both branches are the same component in the same slot, so without
            // a key React REUSES the instance and TipTap keeps the first placeholder — a note
            // said "Reply as …", which is exactly the confusion the placeholder exists to stop.
            key="reply"
            ref={richEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            onImageFiles={addImageFiles}
            placeholder={`Reply as ${user?.firstName ?? 'you'}…`}
            minHeight="52px"
            maxHeight="180px"
            transparent
            className="rounded-none border-0 shadow-none"
          />
        ) : (
          <RichTextEditor
            key="note"
            ref={noteEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            onImageFiles={addImageFiles}
            placeholder="Internal note — only visible to the team…"
            minHeight="52px"
            maxHeight="180px"
            transparent
            className="rounded-none border-0 shadow-none"
          />
        )}

        {/* Toolbar */}
        <div
          className={`flex flex-wrap items-center gap-[7px] px-[9px] py-1.5 border-t ${composerMode === 'note' ? 'border-note-line' : 'border-hair'}`}
        >
          <label className={`${IBTN} cursor-pointer`} title="Attach files">
            <Paperclip className="w-3 h-3" />
            Attach
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={submitting}
            />
          </label>
          {composerMode === 'reply' && (
            <ComposerAiActions
              // Keyed so switching conversations REMOUNTS it: the undo buffer holds
              // the previous conversation's draft, and restoring that into a
              // different customer's reply would be a cross-thread text leak.
              key={message.id}
              messageId={message.id}
              composer={composer}
              setComposer={setComposer}
              disabled={submitting}
              onApplied={(source, draft) => {
                onAiSourceChange?.(source, draft);
                setTimeout(() => richEditorRef.current?.focus(), 0);
              }}
              /* L2 P4: the note is held by MessageDetail, because the lookup panel writes to it
                 too. Undefined here keeps this component's own state, so every other caller and
                 the panel's own tests are unaffected. */
              instructions={aiNote}
              onInstructionsChange={onAiNoteChange}
              revealNote={aiNoteReveal}
            />
          )}
          {composerMode === 'reply' && (
            <Button
              variant="ghost"
              onClick={onOpenSimilarMessages}
              className={`${IBTN} h-auto`}
              title="Search knowledge base"
            >
              <BookOpen className="w-3 h-3" />
              KB
            </Button>
          )}
          <span className="flex-1" />
          <span className="font-mono text-[10.5px] text-muted-foreground hidden sm:inline">
            ⌘↵ {composerMode === 'note' ? 'post' : 'send'}
          </span>
          <Button
            variant="ghost"
            onClick={onSend}
            // Require text even when files are attached — no attachment-only sends.
            disabled={isBlankRichText(composer) || submitting || Boolean(sendBlockedReason)}
            title={
              // The channel block outranks the blank-text hint: if the window is shut,
              // filling the box in changes nothing and saying so would mislead.
              sendBlockedReason ??
              (isBlankRichText(composer)
                ? 'Add a message — attachments alone can’t be sent'
                : undefined)
            }
            className={`flex items-center gap-1 px-[13px] py-[5px] h-auto rounded-[7px] font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] transition-colors disabled:opacity-50 ${
              composerMode === 'note'
                ? 'bg-note hover:bg-note/90 text-note-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            <Send className="w-2.5 h-2.5" />
            {composerMode === 'note' ? 'POST NOTE' : submitting ? 'SENDING…' : 'SEND'}
          </Button>
        </div>
      </div>

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className="inline-flex items-center gap-1.5 max-w-full text-[11.5px] text-muted-foreground border border-border bg-raised rounded-md px-2 py-[3px]"
            >
              <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove file"
                onClick={() => handleRemoveFile(idx)}
                className="p-0 w-auto h-auto text-faint-foreground hover:text-destructive"
              >
                <X className="w-2.5 h-2.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {decisions}
    </div>
  );
}
