import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Eye,
  MoreHorizontal,
  Send,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { HoldDialog } from '@/components/shared/HoldDialog';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  COMPOSER_AI_TOOL,
  COMPOSER_TOOL,
  LABEL,
  answerToEditorHtml,
} from '@/components/messages/messageDetailConstants';
import { Spinner } from '@/components/ui/Spinner';
import { editorHtmlToText } from '@/lib/editorText';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { stripHtml } from '@/lib/stripHtml';
import {
  isInFlight,
  PREVIEW_COUNT,
  ticketRepliesService,
  type Hold,
  type ReplyPreview,
  type TicketReply,
} from '@/services/ticketReplies.service';

/**
 * The ticket page's update helpers (contingency page, owner 2026-10-19): the AI draft of one update
 * for every customer, and the preview of what the first ticked customers actually receive.
 */

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * "Sending to N threads…" is said once, when a send is queued; the replies then show each
 * delivery. Once the deliveries it started have all finished it is no longer true, so it goes
 * (staging 2026-10-19: it stayed up after every thread had its mail) — that notice only, never
 * another said since. Returns what the composer calls when it says it (`true`) or not (`false`).
 *
 * Settled by the first read made after the send (a new replies list) that has nothing in flight —
 * not by watching "in flight" turn on and off: a send while earlier deliveries were still going
 * never turned it on, and deliveries that finished before any read saw them never did either
 * (both left the notice up for good). The list on screen when it was queued predates the send.
 */
export const useSendingNotice = (
  replies: TicketReply[],
  setNotice: (update: (prev: string | null) => string | null) => void
) => {
  const anyInFlight = replies.some((reply) =>
    reply.deliveries.some((row) => isInFlight(row.outcome))
  );
  // The list on screen when the send was queued; null = no notice of ours is up.
  const queuedOn = useRef<TicketReply[] | null>(null);
  useEffect(() => {
    if (queuedOn.current === null || replies === queuedOn.current || anyInFlight) return;
    queuedOn.current = null;
    setNotice((prev) => (prev?.startsWith('Sending to') ? null : prev));
  }, [replies, anyInFlight, setNotice]);
  return (queued: boolean) => {
    queuedOn.current = queued ? replies : null;
  };
};

/**
 * "Generate with AI": one update for everyone, from the ticket and the knowledge base; text already
 * typed goes as the agent's notes. Returns the editor HTML, or a notice when nothing was drafted.
 */
export const draftTicketUpdate = async (
  ticketId: number,
  draft: string,
  blank: boolean
): Promise<{ html: string; fromKnowledgeBase: boolean } | { notice: string }> => {
  const notes = blank ? undefined : editorHtmlToText(draft).trim() || undefined;
  const result = await ticketRepliesService.composeUpdate(ticketId, notes);
  if (!result.text) {
    // An incident is usually new to the knowledge base: with the facts typed in the box, the
    // update is written from them alone, so a blank box asks for them.
    if (result.sources.length > 0) {
      return {
        notice:
          'The knowledge base had related material but no draft could be written — write the update yourself.',
      };
    }
    return {
      notice: notes
        ? 'No draft could be written just now — write the update yourself.'
        : 'Nothing in the knowledge base covers this yet. Type the key facts in the box — what happened, what you are doing, when to expect it — and Generate again.',
    };
  }
  return {
    html: normalizeEditorHtml(answerToEditorHtml(result.text)),
    // With nothing in the KB the update is written from the agent's notes alone.
    fromKnowledgeBase: result.sources.length > 0,
  };
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
      setNotice(
        result.fromKnowledgeBase
          ? 'Draft written from the ticket and the knowledge base — check it before sending.'
          : 'Draft written from your notes — check it before sending.'
      );
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
  /** Why Send is off — shown on hover over the greyed-out button. */
  sendBlockedReason?: string | null;
  previewOpen: boolean;
  onGenerate: () => void;
  onTogglePreview: () => void;
  /** Send: each thread becomes Pending (waiting for the customer). */
  onSend: () => void;
  /** Send & resolve all. */
  onResolve: () => void;
  /** Send & put on hold, once the reason and date are given. */
  onHold: (hold: Hold) => void;
  /** Undo the AI draft — the agent's own text back. Absent while there is nothing to undo. */
  onUndoDraft?: () => void;
  /** The reply tools after the AI draft (Attach, Translate, Templates), as the thread composer. */
  tools: ReactNode;
  /** More ⋯ items after Preview (per-customer drafts); absent when the backend has none. */
  moreItems?: ReactNode;
  /** After the ⋯ menu (the template picker). */
  trailing?: ReactNode;
};

/**
 * The composer's action row (Tickets v3): Generate · Attach · ⋯ on the left, and the split
 * "Send to N threads ▾" on the right — its menu holds Send & resolve all and Send & put on hold.
 */
export const TicketUpdateActions = ({
  count,
  composing,
  sending,
  aiDisabled,
  previewDisabled,
  sendDisabled,
  sendBlockedReason,
  previewOpen,
  onGenerate,
  onTogglePreview,
  onSend,
  onResolve,
  onHold,
  onUndoDraft,
  tools,
  moreItems,
  trailing,
}: ActionsProps) => {
  const [holdOpen, setHoldOpen] = useState(false);
  const threads = `${count} ${plural(count, 'thread', 'threads')}`;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex flex-wrap gap-1.5 items-center">
        {/* The thread composer's AI button: soft, the draft is a suggestion. */}
        <Tooltip
          content="Drafts one update for every ticked customer from the ticket’s title and cause, with your knowledge base. Text already typed is used as your notes."
          size="sm"
        >
          <Button
            variant="ghost"
            type="button"
            onClick={onGenerate}
            disabled={aiDisabled}
            aria-busy={composing}
            className={COMPOSER_AI_TOOL}
          >
            {composing ? <Spinner size={12} /> : <Sparkles className="w-3 h-3" aria-hidden />}
            {composing ? 'Drafting…' : 'AI draft'}
          </Button>
        </Tooltip>
        {onUndoDraft && !composing && (
          <Tooltip content="Restore what you had written" size="sm">
            <Button
              variant="ghost"
              type="button"
              onClick={onUndoDraft}
              className="flex gap-1 items-center px-2 py-1 h-auto rounded text-muted-foreground hover:text-foreground"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden />
              <span className={LABEL}>undo</span>
            </Button>
          </Tooltip>
        )}
        {tools}
        <Menu
          ariaLabel="More composer actions"
          width={270}
          trigger={({ open, toggle }) => (
            <Tooltip content={open ? null : 'More composer actions'} size="sm">
              <Button
                variant="ghost"
                type="button"
                aria-label="More composer actions"
                aria-expanded={open}
                onClick={toggle}
                disabled={previewDisabled}
                className={`${COMPOSER_TOOL} h-auto`}
              >
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </Tooltip>
          )}
        >
          <MenuItem
            checked={previewOpen}
            onSelect={onTogglePreview}
            icon={<Eye className="w-3.5 h-3.5" />}
          >
            Preview per customer
          </MenuItem>
          {moreItems && (
            <>
              <MenuSeparator />
              <MenuLabel>Per-customer drafts</MenuLabel>
              {moreItems}
            </>
          )}
        </Menu>
        {trailing}
      </div>
      <span className="flex-1" />
      <SendBlockedTip reason={sendDisabled ? sendBlockedReason : null}>
        <div className="flex">
          <Button
            size="sm"
            onClick={onSend}
            isLoading={sending}
            disabled={sendDisabled}
            className="rounded-r-none"
          >
            <Send className="w-3.5 h-3.5 mr-1" aria-hidden />
            Send to {threads}
          </Button>
          <Menu
            ariaLabel="More send options"
            align="end"
            width={260}
            trigger={({ open, toggle }) => (
              <Tooltip content={open ? null : 'More send options'} size="sm">
                <Button
                  size="sm"
                  aria-label="More send options"
                  aria-expanded={open}
                  onClick={toggle}
                  disabled={sendDisabled}
                  className="px-[7px] rounded-l-none border-l border-primary-foreground/30"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            )}
          >
            <MenuItem
              icon={<Check className="w-3.5 h-3.5" />}
              hint="threads resolved"
              onSelect={onResolve}
            >
              Send &amp; resolve all
            </MenuItem>
            <MenuItem
              icon={<Clock className="w-3.5 h-3.5" />}
              hint="until a date"
              onSelect={() => setHoldOpen(true)}
            >
              Send &amp; put on hold
            </MenuItem>
          </Menu>
        </div>
      </SendBlockedTip>
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
    </div>
  );
};

/** Explains a greyed-out Send on hover; with no reason it adds nothing around the buttons. */
const SendBlockedTip = ({ reason, children }: { reason?: string | null; children: ReactNode }) =>
  reason ? (
    <Tooltip content={reason} size="sm">
      <span className="inline-flex">{children}</span>
    </Tooltip>
  ) : (
    <>{children}</>
  );

/** Which placeholders exist, and how many ticked customers a `{customer_name}` cannot reach. */
export const PlaceholderHints = ({ unnamed }: { unnamed: number }) => (
  <>
    {unnamed > 0 && (
      <p className="text-xs text-destructive">
        {unnamed} ticked {plural(unnamed, 'customer has', 'customers have')} no name on record —{' '}
        {plural(unnamed, 'that thread', 'those threads')} will not be sent unless you add a
        fallback, e.g. {'{customer_name|there}'}.
      </p>
    )}
  </>
);
