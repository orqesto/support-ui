import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, BookOpen, FileText, Search, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import RichTextEditor, { extractImageFiles } from '@/components/shared/RichTextEditor';
import { ComposerAiActions } from './ComposerAiActions';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { isBlankRichText } from '@/lib/stripHtml';
import { logger } from '@/lib/logger';
import { TemplatePicker } from '@/components/shared/TemplatePicker';
import { replyTemplatesService, type ReplyTemplate } from '@/services/replyTemplates.service';
import { RecipientFields, replyToLabel, type RecipientDraft } from './RecipientFields';
import type { AiDraft } from '@/services/message.service';
import type { Message } from '@/types';
import { LABEL } from './messageDetailConstants';
import { useIsPhone } from './useIsPhone';

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
  /** Everyone on the thread who is not us — offered as Reply all and one-click Cc. */
  participants?: string[];
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
  /**
   * v4 "Look up": takes the agent to the Connected systems block on the Lookups tab. The host
   * passes it ONLY when this workspace has a lookup the agent could run on a thread (the same
   * cached availability answer the lookup panel renders on) — absent, no button, because a
   * button that opens an empty tab is the dead control the availability check exists to remove.
   * Reply mode only: a lookup feeds the reply, an internal note has no use for it.
   */
  onLookUp?: (() => void) | null;
  /** Hidden but kept mounted (v4 mobile: a phone shows the composer under Thread / Notes only). */
  hidden?: boolean;
};

/*
  v4 mobile (M7). What may stay open on an outside press: a menu, list, dialog or sheet the
  composer opened (AI panel options, the similar-messages dialog, a select menu) is not "outside".
*/
const KEEPS_COMPOSER_OPEN = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';

/** Inputs that take typed text — where a focus means the agent is about to write. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);
const isTextEntry = (target: EventTarget): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return (
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

// v3 ".ibtn": a quiet bordered tool button. Phones: 36px tall, 12.5px (v4 mobile `.m-open .tools`).
const IBTN =
  'inline-flex items-center gap-[5px] px-[9px] py-1 rounded-[7px] border border-border bg-card text-muted-foreground text-[11.5px] hover:border-border-strong hover:text-foreground transition-colors max-sm:h-9 max-sm:text-[12.5px]';
// The open toolbar on a phone: tools wrap, 6px apart; the AI draft button is tool-sized too.
const PHONE_TOOLS = 'max-sm:gap-1.5 max-sm:[&_button]:min-h-9';
// At rest on a phone: only the AI draft button — the off note, undo and the panel wait for open.
const AI_AT_REST =
  '[&>span]:hidden [&>div]:hidden [&>button:not([aria-expanded])]:hidden [&>button]:!h-10 [&>button]:!rounded-full [&>button]:!px-3.5 [&>button]:!text-[13px]';

export function MessageComposer({
  message,
  composer,
  setComposer,
  composerMode,
  setComposerMode,
  recipientDraft,
  onRecipientDraftChange,
  participants,
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
  onLookUp = null,
  shortcutHint,
  decisions,
  hidden = false,
}: MessageComposerProps) {
  const user = useAuthStore((store) => store.user);
  const [isDragging, setIsDragging] = useState(false);

  /*
    v4 mobile (M7): at rest a phone's composer is one 24px-radius pill — a one-line input, AI draft
    and a round Send. Pressing into it, focusing it or typing opens the full editor; an outside
    press closes it again, but only while there is nothing in it (no text, file or address) — a
    draft is never folded away. Opened on CLICK rather than pointerdown: the open composer is
    taller, and growing between press and release moved the control out from under the finger, so
    the click landed on whatever slid beneath it.
  */
  const isPhone = useIsPhone();
  const rootRef = useRef<HTMLDivElement>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Bumped on each close so the editor remounts in its collapsed one-line form.
  const [restGeneration, setRestGeneration] = useState(0);
  const draftEmpty =
    isBlankRichText(composer) &&
    selectedFiles.length === 0 &&
    !recipientDraft?.to.trim() &&
    !recipientDraft?.cc.trim() &&
    !recipientDraft?.bcc.trim();
  const atRest = isPhone && !phoneOpen;
  const openOnPhone = () => {
    if (isPhone && !phoneOpen) setPhoneOpen(true);
  };
  // Text or an address arriving from elsewhere (a KB answer, "Reply to this message") opens it.
  useEffect(() => {
    if (isPhone && !draftEmpty) setPhoneOpen(true);
  }, [isPhone, draftEmpty]);
  const draftEmptyRef = useRef(draftEmpty);
  draftEmptyRef.current = draftEmpty;
  const phoneOpenRef = useRef(phoneOpen);
  phoneOpenRef.current = phoneOpen;
  // Set by the AI controls: a request in flight, a draft on screen, or a note in the open panel.
  const aiActiveRef = useRef(false);
  /*
    L2 P4 on a phone: a record added to the AI note ("Add to my note") opens the composer, so the
    panel it reveals is on screen — at rest the panel is CSS-hidden, so the fact the agent just
    added would sit where nobody can see it. Under another tab the composer is hidden but stays
    open, so it is there, panel showing, on the way back to Thread. Only an INCREASE is an add
    (the counter drops back on a thread switch) — the same rule ComposerAiActions applies.
  */
  const seenReveal = useRef(aiNoteReveal ?? 0);
  useEffect(() => {
    const next = aiNoteReveal ?? 0;
    const added = next > seenReveal.current;
    seenReveal.current = next;
    if (added && isPhone) setPhoneOpen(true);
  }, [aiNoteReveal, isPhone]);
  /*
    Open on a press inside, fold on a press outside — decided by where the press BEGAN.

    ⛔ Not by the click's target. React 18 re-renders in a microtask between its root listener and
    a document listener, so by the time a document click listener runs, a control that removed
    itself (Write reply → spinner, Close AI panel, Edit recipients, Remove file) is DETACHED:
    `root.contains(target)` is false and an inside tap read as outside, folding an empty composer
    mid-action. The pointerdown (capture phase, before anything re-renders) records where the
    press began; the click's capture phase takes that record (or, for a click with no pointer —
    the keyboard — judges the still-attached target), and the bubble phase acts on it after the
    page has handled the click. Taking it in the CAPTURE phase means a handler that stops the
    click's propagation cannot leave a stale record for the next one.
  */
  useEffect(() => {
    if (!isPhone) return;
    type Press = 'composer' | 'keep' | 'outside';
    let pointerPress: Press | null = null;
    let clickPress: Press | null = null;
    const judge = (target: EventTarget | null): Press | null => {
      if (!(target instanceof Node) || !target.isConnected) return null;
      if (rootRef.current?.contains(target)) return 'composer';
      const element = target instanceof Element ? target : target.parentElement;
      return element?.closest(KEEPS_COMPOSER_OPEN) ? 'keep' : 'outside';
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerPress = judge(event.target);
    };
    const onPointerCancel = () => {
      pointerPress = null;
    };
    const onClickCapture = (event: MouseEvent) => {
      clickPress = pointerPress ?? judge(event.target);
      pointerPress = null;
    };
    const onClick = () => {
      const press = clickPress;
      clickPress = null;
      if (press === 'composer') {
        if (!phoneOpenRef.current) setPhoneOpen(true);
        return;
      }
      if (press !== 'outside' || !phoneOpenRef.current) return;
      // A draft is never folded away — nor an AI request, draft or note the agent is working on.
      if (!draftEmptyRef.current || aiActiveRef.current) return;
      setPhoneOpen(false);
      setRestGeneration((gen) => gen + 1);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('click', onClick);
    };
  }, [isPhone]);
  /*
    Focus opens it only when it lands where text is typed. Chrome Android focuses a button on
    the PRESS, so opening on any focus grew the composer between press and release and the tap
    landed on whatever slid under the finger (the AI draft button missed its first tap). Buttons
    open it through the click path above instead.
  */
  const onComposerFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target)) openOnPhone();
  };
  // The editor's height on a phone: 96px (a note 134px) open, the desktop 52px otherwise.
  const editorMinHeight = isPhone ? (composerMode === 'note' ? '134px' : '96px') : '52px';
  // The collapsed editor as the pill's one-line input.
  const restEditorClass = atRest ? 'flex-1 min-w-0 h-10 py-0 px-3 text-base rounded-full' : '';

  /*
    Reply templates (2026-10-09): the body goes into the editor — in place of a blank draft, after
    the agent's own words otherwise — and the template's files are attached. Placeholders stay as
    tokens (filled at send); "Adapt with AI" is the AI panel's polish, which fills them first.
    ⛔ The files download after the text lands: if the agent has moved to another conversation by
    then, they are NOT attached — they would go to a different customer.
  */
  const [templateError, setTemplateError] = useState<string | null>(null);
  const filesRef = useRef(selectedFiles);
  filesRef.current = selectedFiles;
  const messageIdRef = useRef(message.id);
  messageIdRef.current = message.id;
  useEffect(() => setTemplateError(null), [message.id]);
  const insertTemplate = async (template: ReplyTemplate) => {
    setTemplateError(null);
    setComposer((prev) => (isBlankRichText(prev) ? template.body : `${prev}${template.body}`));
    setTimeout(() => richEditorRef.current?.focus(), 0);
    if (template.attachments.length === 0) return;
    const startedOn = message.id;
    const results = await Promise.allSettled(
      template.attachments.map((file) =>
        replyTemplatesService.downloadAttachment(template.id, file)
      )
    );
    if (messageIdRef.current !== startedOn) return;
    const files = results
      .filter((row): row is PromiseFulfilledResult<File> => row.status === 'fulfilled')
      .map((row) => row.value);
    if (files.length > 0) onFilesChange([...filesRef.current, ...files]);
    const failed = template.attachments.filter((_, idx) => results[idx].status === 'rejected');
    if (failed.length > 0) {
      logger.error('Failed to attach a reply template’s files', { templateId: template.id });
      setTemplateError(
        `Could not attach ${failed.map((file) => file.filename).join(', ')} from “${template.name}”.`
      );
    }
  };

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
      ref={rootRef}
      data-testid="message-composer"
      data-phone-state={isPhone ? (atRest ? 'rest' : 'open') : undefined}
      onFocus={onComposerFocus}
      onInput={openOnPhone}
      // v4 mobile: sticky to the bottom of the screen with a top shadow, clear of the home bar.
      className={`flex-shrink-0 px-3.5 pt-[9px] pb-[11px] border-t border-border bg-card max-sm:sticky max-sm:bottom-0 max-sm:z-[6] max-sm:px-2.5 max-sm:pt-2 max-sm:pb-[calc(10px+env(safe-area-inset-bottom))] max-sm:shadow-[0_-8px_20px_-14px_rgb(0_0_0/0.35)] ${hidden ? 'hidden' : ''}`}
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
      <div
        className={`flex items-center gap-[15px] mb-2 ${atRest ? 'hidden' : ''}`}
        role="group"
        aria-label="Composer mode"
      >
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
        data-testid="composer-field"
        className={`relative rounded-[10px] border transition-[border-color,box-shadow] ${
          atRest ? 'flex items-center gap-1 p-1 !rounded-[24px]' : ''
        } ${
          isDragging
            ? 'border-primary border-dashed ring-2 ring-primary/30'
            : composerMode === 'note'
              ? 'border-note-line border-l-[3px] border-l-note bg-note-muted'
              : 'border-border bg-raised focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary-muted'
        }`}
      >
        {/* Addressing, above the editor as in any mail client. Reply-only: an
            internal note is not delivered to anyone. */}
        {composerMode === 'reply' && recipientDraft && onRecipientDraftChange && !atRest && (
          <RecipientFields
            draft={recipientDraft}
            onChange={onRecipientDraftChange}
            defaultTo={replyToLabel(message)}
            participants={participants}
            disabled={submitting}
          />
        )}
        {composerMode === 'reply' ? (
          <RichTextEditor
            // Keyed by mode: both branches are the same component in the same slot, so without
            // a key React REUSES the instance and TipTap keeps the first placeholder — a note
            // said "Reply as …", which is exactly the confusion the placeholder exists to stop.
            key={`reply-${restGeneration}`}
            ref={richEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            onImageFiles={addImageFiles}
            placeholder={`Reply as ${user?.firstName ?? 'you'}…`}
            minHeight={editorMinHeight}
            maxHeight="180px"
            transparent
            className={`rounded-none border-0 shadow-none ${restEditorClass}`}
          />
        ) : (
          <RichTextEditor
            key={`note-${restGeneration}`}
            ref={noteEditorRef}
            content={composer}
            onChange={setComposer}
            onSubmit={onSend}
            onImageFiles={addImageFiles}
            placeholder="Internal note — only visible to the team…"
            minHeight={editorMinHeight}
            maxHeight="180px"
            transparent
            className={`rounded-none border-0 shadow-none ${restEditorClass}`}
          />
        )}

        {/* Toolbar */}
        <div
          data-testid="composer-tools"
          className={`flex flex-wrap items-center gap-[7px] px-[9px] py-1.5 border-t ${composerMode === 'note' ? 'border-note-line' : 'border-hair'} ${
            atRest ? '!flex-nowrap !gap-1 !p-0 !border-0 flex-none' : PHONE_TOOLS
          }`}
        >
          <label
            className={`${IBTN} cursor-pointer max-sm:w-9 max-sm:justify-center max-sm:px-0 ${atRest ? 'hidden' : ''}`}
            title="Attach files"
          >
            <Paperclip className="w-3 h-3 max-sm:w-4 max-sm:h-4" />
            {/* Icon only on a phone (v4 mobile); the name stays for screen readers. */}
            {isPhone ? <span className="sr-only">Attach</span> : 'Attach'}
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={submitting}
            />
          </label>
          {composerMode === 'reply' && (
            // `contents`: no box of its own, so the toolbar lays the AI controls out as before. At
            // rest on a phone only the AI draft button shows, pill-sized.
            <span className={`contents ${atRest ? AI_AT_REST : ''}`}>
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
                atRest={atRest}
                onActivityChange={(active) => {
                  aiActiveRef.current = active;
                }}
              />
            </span>
          )}
          {composerMode === 'reply' && !atRest && (
            <TemplatePicker
              use="thread"
              onPick={(template) => void insertTemplate(template)}
              disabled={submitting}
              triggerClassName={`${IBTN} h-auto`}
            />
          )}
          {composerMode === 'reply' && (
            <Button
              variant="ghost"
              onClick={onOpenSimilarMessages}
              className={`${IBTN} h-auto ${atRest ? 'hidden' : ''}`}
              title="Search knowledge base"
            >
              <BookOpen className="w-3 h-3" />
              KB
            </Button>
          )}
          {composerMode === 'reply' && onLookUp && (
            <Button
              variant="ghost"
              onClick={onLookUp}
              className={`${IBTN} h-auto ${atRest ? 'hidden' : ''}`}
              title="Look up this customer in connected systems"
            >
              <Search className="w-3 h-3" />
              Look up
            </Button>
          )}
          <span className={`flex-1 ${atRest ? 'hidden' : ''}`} />
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
            } ${atRest ? '!w-10 !h-10 !p-0 !rounded-full justify-center flex-none' : 'max-sm:h-9 max-sm:px-3.5'}`}
          >
            <Send className={atRest ? 'w-4 h-4' : 'w-2.5 h-2.5'} />
            {/* The round Send at rest keeps its name for screen readers. */}
            {atRest ? (
              <span className="sr-only">
                {composerMode === 'note' ? 'POST NOTE' : submitting ? 'SENDING…' : 'SEND'}
              </span>
            ) : composerMode === 'note' ? (
              'POST NOTE'
            ) : submitting ? (
              'SENDING…'
            ) : (
              'SEND'
            )}
          </Button>
        </div>
      </div>

      {templateError && !atRest && (
        <p role="alert" className="mt-1.5 text-[11.5px] text-destructive">
          {templateError}
        </p>
      )}

      {/* Selected files */}
      {selectedFiles.length > 0 && !atRest && (
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
