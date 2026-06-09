import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Send, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { messageService } from '@/services/message.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sources, setSources] = useState<Integration[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [messageSourceId, setMessageSourceId] = useState<number | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailSources = useMemo(
    () => sources.filter((src) => src.enabled && (src.type === 'email' || src.type === 'gmail')),
    [sources]
  );

  // Reset form whenever the modal opens. Avoids stale state on second open.
  useEffect(() => {
    if (!open) return;
    setTo('');
    setSubject('');
    setContent('');
    setFiles([]);
    setError(null);
  }, [open]);

  // Lazy-load sources on open. Cached at the component level — re-opens within
  // the same session reuse the previously fetched list.
  useEffect(() => {
    if (!open) return;
    if (sources.length > 0) return;
    setSourcesLoading(true);
    setSourcesError(null);
    integrationsService
      .getAll()
      .then((response) => {
        if (response.success && response.data) {
          setSources(response.data);
          const firstEmail = response.data.find(
            (src) => src.enabled && (src.type === 'email' || src.type === 'gmail')
          );
          if (firstEmail) setMessageSourceId(firstEmail.id);
        } else {
          setSourcesError(response.error ?? 'Failed to load sources');
        }
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
    if (!to.trim()) {
      setError('Recipient email is required');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    // RichTextEditor returns '<p></p>' for an empty doc; treat that as empty.
    const trimmedContent = content.replace(/<p>\s*<\/p>/g, '').trim();
    if (!trimmedContent) {
      setError('Body cannot be empty');
      return;
    }

    setSubmitting(true);
    try {
      const response = await messageService.composeNew({
        messageSourceId,
        to: to.trim(),
        subject: subject.trim(),
        content: trimmedContent,
        attachments: files.length > 0 ? files : undefined,
      });

      if (response.success && response.data) {
        logger.info('[ComposeNewModal] sent', {
          conversationId: response.data.conversationId,
        });
        onClose();
        // Take the agent to the conversation they just created so they can
        // verify and follow up.
        navigate(`/messages?messageId=${response.data.conversationId}`);
      } else {
        setError(response.error ?? response.message ?? 'Failed to send');
      }
    } catch (err) {
      logger.error('[ComposeNewModal] send failed', err);
      const message =
        err instanceof Error && err.message ? err.message : 'Failed to send message';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose new message</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">From</label>
            {sourcesLoading ? (
              <div className="text-sm text-muted-foreground">Loading sources…</div>
            ) : sourcesError ? (
              <div className="text-sm text-destructive">{sourcesError}</div>
            ) : emailSources.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No email sources configured. Add one in Settings → Connected Services first.
              </div>
            ) : (
              <select
                value={messageSourceId ?? ''}
                onChange={(event) => setMessageSourceId(Number(event.target.value) || null)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={submitting}
                required
              >
                <option value="" disabled>
                  Pick a source
                </option>
                {emailSources.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.name} ({src.type})
                  </option>
                ))}
              </select>
            )}
          </div>

          <Input
            label="To"
            type="email"
            placeholder="recipient@example.com"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            disabled={submitting}
            required
          />

          <Input
            label="Subject"
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={submitting}
            required
          />

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Message</label>
            <RichTextEditor
              ref={editorRef}
              content={content}
              onChange={setContent}
              placeholder="Write your message…"
              minHeight="180px"
              initiallyHidden={false}
              editable={!submitting}
            />
          </div>

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
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={submitting}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
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
            <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <Paperclip className="w-4 h-4 mr-2" />
              Attach
            </Button>
            <div className="flex-1" />
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting || emailSources.length === 0 || !messageSourceId}
              isLoading={submitting}
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
