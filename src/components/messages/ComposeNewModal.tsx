import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Send, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { parseTypedAddresses } from './RecipientFields';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { messageService } from '@/services/message.service';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import { isBlankRichText } from '@/lib/stripHtml';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { ComposeNewAiDraft, type ComposeAiNote } from './ComposeNewAiDraft';
import { COMPOSER_SEND, COMPOSER_TOOL, SEND_SHORTCUT } from './messageDetailConstants';

// The addressing rows' names, as in a mail client: small, muted, one column wide.
const ROW_LABEL = 'w-14 shrink-0 text-xs text-muted-foreground';

type ComposeSource = { id: number; name: string; type: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

// V1 compose-new modal: pick an email-capable source, fill To/Subject/Body,
// optionally attach files, send. On success we navigate to the conversation
// the BE created so the agent can see the message in context.
//
// Source dropdown lists only enabled email/gmail integrations. The BE picks
// the destination department from the source's link table (isDefault first).
export const ComposeNewModal = ({ open, onClose }: Props) => {
  const navigate = useNavigate();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Where AI draft's Undo renders: after Translate, beside the spacer, so its reserved (empty)
  // slot is not a hole between two chips.
  const [undoSlot, setUndoSlot] = useState<HTMLSpanElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sources, setSources] = useState<ComposeSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [messageSourceId, setMessageSourceId] = useState<number | null>(null);
  const [to, setTo] = useState('');
  // Comma/space separated, parsed on submit. Revealed on demand — most outbound
  // mail is to one person and a permanently-open pair of empty fields is noise.
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An AI draft is about to replace the editor: lock it, and Send, until it lands.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<ComposeAiNote | null>(null);
  const { aiConfigured } = useAiConfigured();
  const { off: aiDraftsOff } = useAiDraftsOff();
  // A disabled button shows no hover title, so the editor itself says how AI draft works here.
  const messagePlaceholder =
    aiConfigured && !aiDraftsOff
      ? 'Write your message… Or jot down what to say and press AI draft to turn it into a ready-to-send email.'
      : 'Write your message…';

  // Already only enabled email sources the agent may send from (see the loader below).
  const emailSources = sources;

  // Reset form whenever the modal opens. Avoids stale state on second open.
  useEffect(() => {
    if (!open) return;
    setTo('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setSubject('');
    setContent('');
    setFiles([]);
    setError(null);
    setAiBusy(false);
  }, [open]);

  // Lazy-load sources on open. Cached at the component level — re-opens within
  // the same session reuse the previously fetched list.
  //
  // Only the sources this agent may send from (a mailbox whose department they cannot reach was
  // offered and then refused on Send). A backend without that list (404) answers null: fall back
  // to every enabled email source, as before.
  useEffect(() => {
    if (!open) return;
    if (sources.length > 0) return;
    setSourcesLoading(true);
    setSourcesError(null);
    const load = async (): Promise<ComposeSource[]> => {
      const sendable = await messageService.getComposeSources();
      if (sendable) return sendable;
      const response = await integrationsService.getAll();
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load sources');
      }
      return response.data
        .filter((src) => src.enabled && (src.type === 'email' || src.type === 'gmail'))
        .map(({ id, name, type }) => ({ id, name, type }));
    };
    load()
      .then((loaded) => {
        setSources(loaded);
        if (loaded[0]) setMessageSourceId(loaded[0].id);
      })
      .catch((err: unknown) => {
        logger.error('[ComposeNewModal] failed to load sources', err);
        setSourcesError('Failed to load sources');
      })
      .finally(() => setSourcesLoading(false));
  }, [open, sources.length]);

  const handleFilesPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    setFiles(next);
    // Reset the input so picking the same file twice re-fires onChange.
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!messageSourceId) {
      setError('Pick a source to send from');
      return;
    }
    const toList = parseTypedAddresses(to);
    if (toList.length === 0) {
      setError('Recipient email is required');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    // Require real text — markup-only bodies (`<p></p>`, `<p><br></p>`, an inline
    // image with no text) must not be sent even when attachments are attached.
    if (isBlankRichText(content)) {
      setError('Add a message — attachments alone can’t be sent');
      return;
    }

    setSubmitting(true);
    try {
      const response = await messageService.composeNew({
        messageSourceId,
        to: toList,
        cc: parseTypedAddresses(cc),
        bcc: parseTypedAddresses(bcc),
        subject: subject.trim(),
        content: content.trim(),
        attachments: files.length > 0 ? files : undefined,
      });

      if (response.success && response.data) {
        logger.info('[ComposeNewModal] sent', {
          conversationId: response.data.conversationId,
        });
        onClose();
        // Take the agent to the conversation they just created so they can
        // verify and follow up.
        navigate(`/threads?messageId=${response.data.conversationId}`);
      } else {
        setError(response.error ?? response.message ?? 'Failed to send');
      }
    } catch (err) {
      logger.error('[ComposeNewModal] send failed', err);
      const message = err instanceof Error && err.message ? err.message : 'Failed to send message';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // `size="lg"` is the window's own width (672px). A max-w class on DialogContent only sized an
    // inner box: the window stayed 512px and the composer's rows wrapped (staging, 2026-10-19).
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="lg" sheetOnPhone>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compose new message</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        {/*
          The same composer as a thread's reply box (owner, 2026-10-19): addressing rows, the
          editor and one row of tool chips with SEND at its end, all in one framed field — not a
          form of labelled inputs with a button footer that wrapped and jumped.
        */}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
          <div
            data-testid="compose-field"
            className="relative rounded-[10px] border border-border bg-raised transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary-muted"
          >
            <div className="space-y-1 px-2 pt-2 pb-1">
              <div className="flex items-center gap-1.5">
                <span className={ROW_LABEL}>From</span>
                {sourcesLoading ? (
                  <span className="text-xs text-muted-foreground">Loading sources…</span>
                ) : sourcesError ? (
                  <span className="text-xs text-destructive">{sourcesError}</span>
                ) : emailSources.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No email source you can send from. An admin can add one in Settings → Connected
                    Services, or give you access to its department.
                  </span>
                ) : (
                  <Select
                    aria-label="From"
                    size="sm"
                    className="flex-1"
                    value={String(messageSourceId ?? '')}
                    onChange={(value) => setMessageSourceId(Number(value) || null)}
                    disabled={submitting}
                    required
                    placeholder="Pick a source"
                    options={emailSources.map((src) => ({
                      value: String(src.id),
                      label: `${src.name} (${src.type})`,
                    }))}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={ROW_LABEL}>To</span>
                <Input
                  aria-label="To"
                  type="text"
                  placeholder="one@example.com, two@example.com"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  disabled={submitting}
                  className="h-7 flex-1 text-xs"
                />
                {!showCcBcc && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCcBcc(true)}
                    disabled={submitting}
                    className="h-auto shrink-0 whitespace-nowrap px-1 py-0 text-xs"
                  >
                    Cc / Bcc
                  </Button>
                )}
              </div>
              {showCcBcc && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className={ROW_LABEL}>Cc</span>
                    <Input
                      aria-label="Cc"
                      type="text"
                      placeholder="one@example.com, two@example.com"
                      value={cc}
                      onChange={(event) => setCc(event.target.value)}
                      disabled={submitting}
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={ROW_LABEL}>Bcc</span>
                    <Input
                      aria-label="Bcc"
                      type="text"
                      placeholder="Hidden from the other recipients"
                      value={bcc}
                      onChange={(event) => setBcc(event.target.value)}
                      disabled={submitting}
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                </>
              )}
              <div className="flex items-center gap-1.5">
                <span className={ROW_LABEL}>Subject</span>
                <Input
                  aria-label="Subject"
                  type="text"
                  placeholder="Subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={submitting}
                  className="h-7 flex-1 text-xs"
                />
              </div>
            </div>

            <RichTextEditor
              ref={editorRef}
              content={content}
              onChange={setContent}
              // ⌘↵ sends, as in the reply box — except while an AI draft is replacing the text.
              onSubmit={aiBusy ? undefined : () => formRef.current?.requestSubmit()}
              placeholder={messagePlaceholder}
              minHeight="180px"
              maxHeight="320px"
              initiallyHidden={false}
              transparent
              // `locked`, not `editable={false}`: a non-editable editor drops its formatting row, so
              // the field shrank ~50px and the tool row jumped up while drafting or sending
              // (measured on staging, 2026-10-19). Locked blocks typing and keeps the row.
              locked={submitting || aiBusy}
              className="rounded-none border-0 border-t border-hair shadow-none"
            />

            <div
              data-testid="compose-tools"
              className="flex flex-wrap items-center gap-[7px] px-[9px] py-1.5 border-t border-hair"
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                title="Attach files"
                className={`${COMPOSER_TOOL} h-auto`}
              >
                <Paperclip className="w-3 h-3" />
                Attach
              </Button>
              <ComposeNewAiDraft
                content={content}
                setContent={setContent}
                disabled={submitting}
                onBusyChange={setAiBusy}
                onNoteChange={setAiNote}
                undoSlot={undoSlot}
              />
              <TranslateButton
                getText={() => editorRef.current?.getTranslationText() ?? ''}
                onTranslated={(translated) => editorRef.current?.applyTranslation(translated)}
                clearable={false}
                disabled={submitting || aiBusy}
                label="Translate"
                buttonClassName={`${COMPOSER_TOOL} !w-auto !h-auto`}
              />
              <span ref={setUndoSlot} className="inline-flex self-stretch" />
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-muted-foreground hidden sm:inline">
                {SEND_SHORTCUT} send
              </span>
              <Button
                type="submit"
                variant="ghost"
                disabled={
                  submitting ||
                  aiBusy ||
                  emailSources.length === 0 ||
                  !messageSourceId ||
                  parseTypedAddresses(to).length === 0 ||
                  !subject.trim() ||
                  isBlankRichText(content)
                }
                className={COMPOSER_SEND}
              >
                <Send className="w-2.5 h-2.5" />
                {submitting ? 'SENDING…' : 'SEND'}
              </Button>
            </div>
          </div>

          {/* One reserved line for AI draft's messages, so one appearing never moves the field. */}
          <p
            role="alert"
            className={`min-h-4 text-xs leading-4 ${
              aiNote?.tone === 'info' ? 'text-muted-foreground' : 'text-destructive'
            }`}
          >
            {aiNote?.text}
          </p>

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md bg-muted"
                >
                  <span className="truncate">
                    <Paperclip className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-muted-foreground" />
                    {file.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({Math.round(file.size / 1024)} KB)
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(index)}
                    disabled={submitting}
                    className="p-0 w-auto h-auto text-muted-foreground hover:text-destructive"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilesPicked}
          />

          {error && (
            <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
