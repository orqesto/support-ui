import type { RefObject } from 'react';
import { Send, Paperclip, FileText, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { LABEL, SEND_SHORTCUT } from '../messageDetailConstants';

type ComposerMode = 'reply' | 'note';

/** Reply / Internal note tabs, with the key hint on the right. */
export function ComposerModeTabs({
  atRest,
  composerMode,
  setComposerMode,
  noteEditorRef,
  richEditorRef,
  shortcutHint,
}: {
  atRest: boolean;
  composerMode: ComposerMode;
  setComposerMode: React.Dispatch<React.SetStateAction<ComposerMode>>;
  noteEditorRef: RefObject<RichTextEditorHandle>;
  richEditorRef: RefObject<RichTextEditorHandle>;
  shortcutHint?: string;
}) {
  return (
    <div
      className={`flex items-center gap-[15px] mb-1.5 ${atRest ? 'hidden' : ''}`}
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
            setTimeout(() => (mode === 'note' ? noteEditorRef : richEditorRef).current?.focus(), 0);
          }}
          className={`pb-1 border-b-2 ${LABEL} tracking-[0.1em] transition-colors ${
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
      {/* The send key joined the R/N/E hint here so the toolbar fits on one row with Send. */}
      <span className="ml-auto font-mono text-[10px] text-muted-foreground hidden sm:inline">
        {shortcutHint ? `${shortcutHint} · ` : ''}
        {SEND_SHORTCUT} {composerMode === 'note' ? 'post' : 'send'}
      </span>
    </div>
  );
}

/** The channel window (WhatsApp's 24 hours): how long is left, or why sending is blocked. */
export function ComposerWindowNotice({
  windowTone,
  sendBlockedReason,
  windowRemaining,
  onUseTemplate,
}: {
  windowTone: 'none' | 'info' | 'warning' | 'blocked';
  sendBlockedReason: string | null;
  windowRemaining: string | null;
  onUseTemplate: (() => void) | null;
}) {
  return (
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
  );
}

/** The agent's signature, one line, appended by the server on send. */
export function ComposerSignature({ signature }: { signature: string }) {
  return (
    <div
      data-testid="composer-signature"
      className="flex items-baseline gap-2 px-3 pb-1.5 text-xs text-muted-foreground select-none"
      title={signature.trim()}
    >
      <span className="truncate min-w-0">
        --{' '}
        {signature
          .trim()
          .split(/\s*\n\s*/)
          .join(' · ')}
      </span>
      <Link
        to="/settings#profile"
        className="flex-none text-[11px] underline hover:text-foreground"
      >
        Edit signature in Profile
      </Link>
    </div>
  );
}

/** The plain Send / Post note button (and the round Send of the folded pill). */
export function ComposerPlainSend({
  atRest,
  draftEmpty,
  openForReview,
  onSend,
  sendDisabled,
  sendTitle,
  composerMode,
  submitting,
}: {
  atRest: boolean;
  draftEmpty: boolean;
  openForReview: () => void;
  onSend: () => void;
  sendDisabled: boolean;
  sendTitle: string | undefined;
  composerMode: ComposerMode;
  submitting: boolean;
}) {
  return (
    <Button
      variant="ghost"
      onClick={atRest && !draftEmpty ? openForReview : onSend}
      disabled={sendDisabled}
      title={sendTitle}
      className={`flex items-center gap-1 px-[13px] py-[5px] h-auto rounded-[7px] font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] transition-colors data-[inactive]:opacity-50 ${
        composerMode === 'note'
          ? 'bg-note hover:bg-note/90 text-note-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      } ${atRest ? '!w-10 !h-10 sm:!w-8 sm:!h-8 !p-0 !rounded-full justify-center flex-none' : 'max-sm:h-9 max-sm:px-3.5'}`}
    >
      <Send className={atRest ? 'w-4 h-4 sm:w-3.5 sm:h-3.5' : 'w-2.5 h-2.5'} />
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
  );
}

/** The files picked for this reply, each with its remove button. */
export function ComposerFileChips({
  selectedFiles,
  handleRemoveFile,
}: {
  selectedFiles: File[];
  handleRemoveFile: (index: number) => void;
}) {
  return (
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
  );
}
