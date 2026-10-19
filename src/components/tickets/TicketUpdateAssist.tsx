import { useEffect, useRef, useState } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { HoldDialog } from '@/components/shared/HoldDialog';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { answerToEditorHtml } from '@/components/messages/messageDetailConstants';
import { editorHtmlToText } from '@/lib/editorText';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { stripHtml } from '@/lib/stripHtml';
import {
  PREVIEW_COUNT,
  ticketRepliesService,
  type Hold,
  type ReplyPreview,
} from '@/services/ticketReplies.service';

/**
 * The ticket page's update helpers (contingency page, owner 2026-10-19): the AI draft of one update
 * for every customer, and the preview of what the first ticked customers actually receive.
 */

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * "Generate with AI": one update for everyone, from the ticket and the knowledge base; text already
 * typed goes as the agent's notes. Returns the editor HTML, or a notice when nothing was drafted.
 */
export const draftTicketUpdate = async (
  ticketId: number,
  draft: string,
  blank: boolean
): Promise<{ html: string } | { notice: string }> => {
  const notes = blank ? undefined : editorHtmlToText(draft).trim() || undefined;
  const result = await ticketRepliesService.composeUpdate(ticketId, notes);
  if (!result.text) {
    return {
      notice:
        result.sources.length > 0
          ? 'The knowledge base had related material but no draft could be written — write the update yourself.'
          : 'Nothing in the knowledge base fits this ticket yet — write the update yourself.',
    };
  }
  return { html: normalizeEditorHtml(answerToEditorHtml(result.text)) };
};

/** The composer's "Generate with AI" handler: the box gets the draft, or the page says why not. */
export const useGenerateTicketUpdate = (input: {
  ticketId: number;
  /** The ticket on screen now: an answer for a ticket the page left is dropped. */
  currentTicket: { current: number };
  draft: string;
  blank: boolean;
  setComposing: (on: boolean) => void;
  setError: (text: string | null) => void;
  setNotice: (text: string | null) => void;
  apply: (html: string) => void;
}) => {
  const { ticketId, currentTicket, draft, blank, setComposing, setError, setNotice, apply } = input;
  return async () => {
    setError(null);
    setNotice(null);
    setComposing(true);
    const startedOn = ticketId;
    try {
      const result = await draftTicketUpdate(startedOn, draft, blank);
      if (currentTicket.current !== startedOn) return;
      if ('notice' in result) {
        setNotice(result.notice);
        return;
      }
      apply(result.html);
      setNotice('Draft written from the ticket and the knowledge base — check it before sending.');
    } catch (err) {
      logger.error('Failed to draft the ticket update', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'The update could not be drafted.');
    } finally {
      setComposing(false);
    }
  };
};

type PreviewProps = {
  ticketId: number;
  draft: string;
  blank: boolean;
  /** The ticked threads, in list order — the first PREVIEW_COUNT are shown. */
  selected: number[];
  emailOf: Map<number, string>;
};

/**
 * What the first PREVIEW_COUNT ticked recipients receive — the server fills each one's
 * placeholders exactly as the send will. Re-read while shown, one read per pause in typing.
 */
export const TicketUpdatePreview = ({
  ticketId,
  draft,
  blank,
  selected,
  emailOf,
}: PreviewProps) => {
  const [previews, setPreviews] = useState<ReplyPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewKey = selected.slice(0, PREVIEW_COUNT).join(',');
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    if (blank || previewKey === '') {
      setPreviews(null);
      return;
    }
    const timer = setTimeout(() => {
      ticketRepliesService
        .preview(ticketId, draft.trim(), previewKey.split(',').map(Number))
        .then((rows) => {
          if (mine !== seq.current) return;
          setPreviews(rows);
          setError(null);
        })
        .catch((err: unknown) => {
          if (mine !== seq.current) return;
          logger.error('Failed to preview the ticket reply', err);
          setPreviews(null);
          setError(getApiErrorMessage(err) ?? 'The preview could not be made.');
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [blank, previewKey, draft, ticketId]);

  const shown = Math.min(PREVIEW_COUNT, selected.length);
  return (
    <div className="space-y-2" aria-label="What the first recipients receive">
      <p className="text-xs font-medium text-muted-foreground">
        What the first {shown} ticked {plural(shown, 'customer receives', 'customers receive')}
      </p>
      {blank || selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Write the update and tick a thread to see it here.
        </p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : previews === null ? (
        <p className="text-xs text-muted-foreground">Filling it in for each customer…</p>
      ) : (
        <ul className="space-y-2">
          {previews.map((row) => (
            <li
              key={row.conversationId}
              className="p-2 space-y-1 rounded-md border border-border bg-muted"
            >
              <p className="text-xs text-muted-foreground">
                To {emailOf.get(row.conversationId) ?? `thread #${row.conversationId}`}
              </p>
              {row.ok ? (
                <p className="text-sm whitespace-pre-line">{stripHtml(row.text)}</p>
              ) : (
                <p className="text-xs text-destructive">Not sent: {row.reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type ActionsProps = {
  /** How many threads are ticked. */
  count: number;
  composing: boolean;
  sending: boolean;
  aiDisabled: boolean;
  previewDisabled: boolean;
  sendDisabled: boolean;
  previewOpen: boolean;
  onGenerate: () => void;
  onTogglePreview: () => void;
  /** Send update: each thread becomes Pending (waiting for the customer). */
  onSend: () => void;
  /** Send & resolve all. */
  onResolve: () => void;
  /** Send & put on hold, once the reason and date are given. */
  onHold: (hold: Hold) => void;
};

/** Generate with AI · Preview · Send update · Send & put on hold · Send & resolve all. */
export const TicketUpdateActions = ({
  count,
  composing,
  sending,
  aiDisabled,
  previewDisabled,
  sendDisabled,
  previewOpen,
  onGenerate,
  onTogglePreview,
  onSend,
  onResolve,
  onHold,
}: ActionsProps) => {
  const [holdOpen, setHoldOpen] = useState(false);
  const threads = `${count} ${plural(count, 'thread', 'threads')}`;
  return (
    <>
      <Tooltip
        content="Drafts one update for every ticked customer from the ticket’s title and cause, with your knowledge base. Text already typed is used as your notes."
        size="sm"
      >
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={onGenerate}
          isLoading={composing}
          disabled={aiDisabled}
        >
          <Sparkles className="w-4 h-4 mr-1" aria-hidden />
          Generate with AI
        </Button>
      </Tooltip>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={onTogglePreview}
        disabled={previewDisabled}
        aria-pressed={previewOpen}
      >
        <Eye className="w-4 h-4 mr-1" aria-hidden />
        {previewOpen ? 'Hide preview' : 'Preview'}
      </Button>
      <Button size="sm" onClick={onSend} isLoading={sending} disabled={sendDisabled}>
        Send update to {threads}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)} disabled={sendDisabled}>
        Send &amp; put on hold
      </Button>
      <Button size="sm" variant="outline" onClick={onResolve} disabled={sendDisabled}>
        Send &amp; resolve all
      </Button>
      <HoldDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title={`Send & put ${threads} on hold`}
        description="Each customer gets the update in their own thread, and each thread goes On-hold until the recheck date — then it comes back to the active list and you are reminded. A customer reply brings it back sooner."
        confirmText="Send & put on hold"
        busy={sending}
        onConfirm={(hold) => {
          setHoldOpen(false);
          onHold(hold);
        }}
      />
    </>
  );
};

/** Which placeholders exist, and how many ticked customers a `{customer_name}` cannot reach. */
export const PlaceholderHints = ({ unnamed }: { unnamed: number }) => (
  <>
    <p className="text-xs text-muted-foreground">
      {'{first_name}'} greets each customer by their own first name — “Hi there,” when it is not
      known, never their email address. Also: {'{customer_name}'}, {'{ticket_id}'}, {'{thread_id}'},{' '}
      {'{agent_name}'}.
    </p>
    {unnamed > 0 && (
      <p className="text-xs text-destructive">
        {unnamed} ticked {plural(unnamed, 'customer has', 'customers have')} no name on record —{' '}
        {plural(unnamed, 'that thread', 'those threads')} will not be sent unless you add a
        fallback, e.g. {'{customer_name|there}'}.
      </p>
    )}
  </>
);
