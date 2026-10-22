import { InsertFieldMenu } from './InsertFieldMenu';
import { TicketComposerTools, useInsertTemplate } from './ticketComposerTools';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { MenuItem } from '@/components/ui/Menu';
import { COMPOSER_TOOL } from '@/components/messages/messageDetailConstants';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { TemplatePicker } from '@/components/shared/TemplatePicker';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { isBlankRichText } from '@/lib/stripHtml';
import {
  isInFlight,
  nameTokensWithoutFallback,
  sameReplyText,
  ticketRepliesService,
  type Hold,
  type TicketReplies,
  type TicketReply,
} from '@/services/ticketReplies.service';
import { ticketDraftsService } from '@/services/ticketDrafts.service';
import type { TicketThread } from '@/services/ticketThreads.service';
import { TicketDraftsReview, useDraftsWorkflow } from './TicketDraftsReview';
import { TicketSentHistory, hasReviewedVersions, sentTo } from './TicketSentHistory';
import {
  PlaceholderHints,
  TicketUpdateActions,
  TicketUpdatePreview,
  useGenerateTicketUpdate,
  useSendingNotice,
} from './TicketUpdateAssist';

/**
 * Reply to a ticket's threads from the ticket page (owner, 2026-09-23): one text, a SEPARATE
 * email into each ticked thread, and a record of who has it so nobody gets it twice.
 * Plan + decisions: `TICKET-REPLY-ALL-PLAN-2026-10-09.md` (R1–R6, Q1–Q3).
 */

/** While a send is running the page asks the server this often what has gone out. */
export const POLL_MS = 2000;
/** The server's limit per reply (the thread reply's too). */
export const MAX_FILES = 10;

/**
 * The replies sent from a ticket, kept fresh while any of them is still sending.
 * `data` null = not read yet. Only the latest read for the CURRENT ticket may write.
 */
export const useTicketReplies = (ticketId: number) => {
  const [data, setData] = useState<TicketReplies | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      const next = await ticketRepliesService.repliesOfTicket(ticketId);
      if (mine !== seq.current) return;
      setData(next);
      setFailed(false);
      const sending =
        !next.unavailable &&
        next.replies.some((reply) => reply.deliveries.some((row) => isInFlight(row.outcome)));
      if (sending) timer.current = setTimeout(() => void refresh(), POLL_MS);
    } catch (err) {
      if (mine !== seq.current) return;
      logger.error('Failed to read the ticket’s replies', err);
      setFailed(true);
    }
  }, [ticketId]);

  useEffect(() => {
    setData(null);
    setFailed(false);
    void refresh();
    return () => {
      seq.current += 1; // a read in flight for this ticket may no longer write
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  return { data, failed, refresh };
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

type Confirm =
  | { kind: 'new'; resolve: boolean; ids: number[]; description: string; hold?: Hold }
  | { kind: 'again'; reply: TicketReply; ids: number[]; description: string }
  /** "Send here": an earlier reply into ONE thread it has not reached. */
  | { kind: 'here'; reply: TicketReply; ids: number[]; description: string }
  | { kind: 'reviewed'; resolve: boolean; ids: number[]; description: string }
  | { kind: 'discard'; ids: number[]; description: string };

/** A re-send of such a reply carries the base text, not anyone's reviewed version — say so. */
const originalOnly = (reply: TicketReply) =>
  hasReviewedVersions(reply)
    ? ' They get the original text, filled in for them — not a reviewed version.'
    : '';

const confirmTitle = (confirm: Confirm) => {
  if (confirm.kind === 'discard') return 'Discard your drafts on this ticket?';
  const what =
    confirm.kind === 'reviewed'
      ? 'the reviewed drafts'
      : confirm.kind === 'new'
        ? 'this reply'
        : 'it';
  return `Send ${what} to ${confirm.ids.length} ${plural(confirm.ids.length, 'thread', 'threads')}?`;
};

const confirmButton = (confirm: Confirm | null) => {
  if (confirm?.kind === 'discard') return 'Discard';
  return (confirm?.kind === 'new' || confirm?.kind === 'reviewed') && confirm.resolve
    ? 'Send & resolve'
    : 'Send';
};

type Props = {
  ticketId: number;
  /** The ticket's threads the agent can open. */
  threads: TicketThread[];
  /** The ticked ones, in list order. */
  selected: number[];
  replies: Extract<TicketReplies, { unavailable: false }>;
  /** Threads a reply cannot reach right now. */
  unreachable: Map<number, string>;
  onSent: () => void;
  /**
   * The threads a NEW reply was just queued for and how they end up — the page offers "Reopen"
   * (the undo, which cannot unsend) for a send that resolved them or put them on hold.
   */
  onQueued?: (ids: number[], outcome: 'pending' | 'resolved' | 'on_hold') => void;
  /** Why nothing can be sent right now (e.g. every thread is resolved); shown, and sending is off. */
  disabledReason?: string | null;
};

export const TicketReplyComposer = ({
  ticketId,
  threads,
  selected,
  replies,
  unreachable,
  onSent,
  onQueued,
  disabledReason = null,
}: Props) => {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [composing, setComposing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  /*
    The agent's own text from before the first AI draft replaced it (null: nothing to undo). Kept
    across a second Generate, so Undo always reaches their words — as the thread composer's.
  */
  const [beforeAi, setBeforeAi] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A different ticket: nothing written or said about the previous one stays.
  const currentTicket = useRef(ticketId);
  currentTicket.current = ticketId;
  useEffect(() => {
    setDraft('');
    setBeforeAi(null);
    setFiles([]);
    editorRef.current?.setContent('');
    setConfirm(null);
    setNotice(null);
    setError(null);
    setPreviewOpen(false);
  }, [ticketId]);

  // Drafts (reply templates P2): made per ticked thread, reviewed, then sent.
  const {
    drafts,
    draftsUsable,
    draftRows,
    refused,
    setRefused,
    adaptPick,
    setAdaptPick,
    adaptResults,
    setAdaptResults,
    editing,
    setEditing,
    draftBusy,
    setDraftBusy,
    offerAdapt,
    adaptSelected,
    saveEdit,
    discard,
  } = useDraftsWorkflow({ ticketId, threads, currentTicket, setError, setNotice });
  // Send reviewed goes to the TICKED threads that have a draft — unticking one leaves it out.
  const reviewIds = draftRows
    .map((row) => row.conversationId)
    .filter((id) => selected.includes(id) && !unreachable.has(id));
  const busy = sending || draftBusy || composing;
  const locked = disabledReason !== null;

  const sendingNotice = useSendingNotice(replies.replies, setNotice);

  const emailOf = new Map(threads.map((row) => [row.conversationId, row.requesterEmail]));
  const tooMany = selected.length > replies.maxThreads;
  // T-4: a name token with no fallback is refused for a customer with no name — say so first.
  const nameTokens = nameTokensWithoutFallback(draft);
  const unnamed =
    nameTokens.length === 0
      ? []
      : selected.filter((id) => {
          const known = replies.names.find((row) => row.conversationId === id);
          // A thread the backend gave no name row for is unknown, not nameless: no warning.
          if (!known) return false;
          return nameTokens.length > 0 && !known.customerName;
        });
  const blank = isBlankRichText(draft);
  // Why Send is greyed out, said on hover — a disabled button alone does not explain itself.
  const sendBlockedReason = composing
    ? 'Wait for the draft to finish'
    : sending
      ? 'Sending…'
      : locked
        ? 'Nobody left to update'
        : selected.length === 0
          ? 'Tick at least one thread to send to'
          : tooMany
            ? `At most ${replies.maxThreads} threads at a time`
            : blank
              ? 'Write the update first'
              : draftBusy
                ? 'Wait for the drafts to finish'
                : null;
  const recipients = selected.map((id) => {
    const named = (replies.names ?? []).find((row) => row.conversationId === id)?.customerName;
    // An empty name is no name: fall back to the address.
    return { id, name: [named, emailOf.get(id)].find(Boolean) ?? `Thread ${id}` };
  });

  const setEditor = (html: string) => {
    setDraft(html);
    editorRef.current?.setContent(html);
  };
  const generate = useGenerateTicketUpdate({
    ticketId,
    currentTicket,
    draft,
    blank,
    setComposing,
    setError,
    setNotice,
    apply: (html) => {
      setBeforeAi((prev) => prev ?? draft);
      setEditor(html);
    },
  });
  const undoAiDraft = () => {
    if (beforeAi === null) return;
    setEditor(beforeAi);
    setBeforeAi(null);
    setNotice(null);
  };

  const { insertTemplate, templateError } = useInsertTemplate({
    ticketId,
    currentTicket,
    draft,
    setEditor,
    addFiles: (fetched) => setFiles((prev) => [...prev, ...fetched].slice(0, MAX_FILES)),
    focus: () => editorRef.current?.focus(),
  });

  const askNew = (resolve: boolean) => {
    setError(null);
    setNotice(null);
    const count = selected.length;
    const parts = [
      `Each customer gets it separately, in their own email thread — nobody sees the others’ addresses.`,
      resolve ? `Each of these threads is resolved.` : `Each of these threads becomes Pending.`,
      `Unassigned threads are assigned to you if your workspace assigns threads on reply.`,
    ];
    // A7 — the same text again is the earlier reply: say who already has it, before sending.
    // Files are part of a reply: with files attached (or on the earlier one) it is another reply.
    const earlier =
      files.length > 0
        ? undefined
        : replies.replies.find(
            (reply) =>
              reply.content !== null &&
              reply.attachments.length === 0 &&
              sameReplyText(reply.content, draft.trim())
          );
    if (earlier) {
      const had = sentTo(earlier);
      const already = selected.filter((id) => had.has(id)).length;
      if (already > 0) {
        parts.unshift(
          already === count
            ? `This exact reply was already sent to all ${count} — nobody will get it again.`
            : `This exact reply was already sent to ${already} of them — only the ${count - already} that ${plural(count - already, 'has', 'have')} not had it will get it.`
        );
      }
    }
    setConfirm({ kind: 'new', resolve, ids: selected, description: parts.join(' ') });
  };

  const askAgain = (reply: TicketReply, ids: number[]) => {
    setError(null);
    setNotice(null);
    setConfirm({
      kind: 'again',
      reply,
      ids,
      description: `Send this earlier reply to the ${ids.length} ${plural(ids.length, 'thread', 'threads')} that ${plural(ids.length, 'has', 'have')} not had it. Threads that already have it get nothing. A thread sent again after a failure keeps the choice it was first sent with (Pending, On-hold or resolved); a thread new to this reply becomes Pending.${originalOnly(reply)}`,
    });
  };

  const askHere = (reply: TicketReply, id: number) => {
    setError(null);
    setNotice(null);
    setConfirm({
      kind: 'here',
      reply,
      ids: [id],
      description: `Send this earlier reply to ${emailOf.get(id) ?? `thread #${id}`} only. That thread becomes Pending.${originalOnly(reply)}`,
    });
  };

  /** One draft per ticked thread — from a template or the typed text; no model is called. */
  const makeDrafts = async (source: { templateId: number } | { content: string }) => {
    setError(null);
    setNotice(null);
    setRefused([]);
    setAdaptResults(new Map());
    setDraftBusy(true);
    const startedOn = ticketId;
    try {
      const result = await ticketDraftsService.create(startedOn, source, selected);
      if (currentTicket.current !== startedOn) return;
      setRefused(result.refused);
      setNotice(
        `${result.created.length} ${plural(result.created.length, 'draft', 'drafts')} ready to review below.`
      );
      // The typed text now lives in the drafts; leaving it in the box invites sending it twice.
      if ('content' in source) {
        setDraft('');
        setBeforeAi(null);
        editorRef.current?.setContent('');
      }
      await drafts.refresh();
    } catch (err) {
      logger.error('Failed to make the drafts', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'The drafts could not be made.');
    } finally {
      setDraftBusy(false);
    }
  };

  const askReviewed = (resolve: boolean) => {
    setError(null);
    setNotice(null);
    const left = draftRows.length - reviewIds.length;
    setConfirm({
      kind: 'reviewed',
      resolve,
      ids: reviewIds,
      description: [
        `Each customer gets the draft written for their thread, separately.`,
        resolve ? `Each of these threads is resolved.` : `Each of these threads becomes Pending.`,
        left > 0
          ? `${left} ${plural(left, 'draft', 'drafts')} for unticked threads ${plural(left, 'is', 'are')} not sent.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  };

  const send = async (request: Exclude<Confirm, { kind: 'discard' }>) => {
    setConfirm(null);
    setError(null);
    setNotice(null);
    setSending(true);
    const startedOn = ticketId;
    const fresh = request.kind === 'new' || request.kind === 'reviewed';
    try {
      const body =
        request.kind === 'new'
          ? { content: draft.trim() }
          : request.kind === 'reviewed'
            ? ({ fromDrafts: true } as const)
            : { replyId: request.reply.id };
      // A re-send leaves it to each thread's first choice (the server keeps it).
      const resolveChoice = fresh ? request.resolve : undefined;
      const sendFiles = fresh ? files : [];
      const hold = request.kind === 'new' ? request.hold : undefined;
      const result = hold
        ? await ticketRepliesService.send(startedOn, body, request.ids, false, sendFiles, hold)
        : await ticketRepliesService.send(startedOn, body, request.ids, resolveChoice, sendFiles);
      if (currentTicket.current !== startedOn) return;
      if (request.kind === 'new') {
        setDraft('');
        setBeforeAi(null);
        setFiles([]);
        editorRef.current?.setContent('');
        setPreviewOpen(false);
      }
      if (fresh && result.queued.length > 0) {
        onQueued?.(result.queued, request.resolve ? 'resolved' : hold ? 'on_hold' : 'pending');
      }
      if (request.kind === 'reviewed') {
        setFiles([]);
        setAdaptResults(new Map());
        setRefused([]);
        void drafts.refresh();
      }
      sendingNotice(result.queued.length > 0);
      const had = result.skipped.filter((row) => row.reason === 'already_sent').length;
      const busy = result.skipped.length - had;
      setNotice(
        [
          result.queued.length > 0
            ? `Sending to ${result.queued.length} ${plural(result.queued.length, 'thread', 'threads')}…`
            : 'Nothing new to send.',
          had > 0 ? `${had} already had it.` : '',
          busy > 0 ? `${busy} ${plural(busy, 'is', 'are')} still being sent.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      onSent();
    } catch (err) {
      logger.error('Failed to send the ticket reply', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'The reply could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card
      padding="none"
      role="region"
      aria-label="Reply to these threads"
      className="p-3.5 space-y-3 rounded-[10px] shadow-none"
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-between items-start">
        <div>
          <h4 className="text-sm font-medium">Send an update to the ticked threads</h4>
          <p className="text-xs text-muted-foreground">
            One update, sent to each customer separately in their own email thread.
          </p>
        </div>
        {recipients.length > 0 ? (
          <div className="flex flex-wrap gap-1 items-center" aria-label="Sending to">
            {recipients.slice(0, 3).map(({ id, name }) => (
              <Badge key={id} variant="info" className="max-w-[160px] truncate">
                {name}
              </Badge>
            ))}
            {recipients.length > 3 && (
              <span className="text-xs text-muted-foreground">+{recipients.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Tick threads to send to</span>
        )}
      </div>
      {locked && <Alert variant="info">{disabledReason}</Alert>}
      <RichTextEditor
        ref={editorRef}
        content={draft}
        onChange={setDraft}
        placeholder="Write one update for every ticked thread — or Generate with AI…"
        minHeight="100px"
        initiallyHidden={false}
        editable={!sending && !composing && !locked}
      />
      <div className="flex items-center">
        <InsertFieldMenu disabled={busy || locked} editor={editorRef} />
      </div>
      <PlaceholderHints unnamed={unnamed.length} />
      {previewOpen && (
        <TicketUpdatePreview
          ticketId={ticketId}
          draft={draft}
          blank={blank}
          selected={selected}
          emailOf={emailOf}
        />
      )}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
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
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== index))}
                disabled={sending}
                className="p-0 w-auto h-auto text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${file.name}`}
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
        aria-label="Attach files"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // The server takes at most MAX_FILES per reply; more would be refused as a whole.
          setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
          event.target.value = '';
        }}
      />
      <TicketUpdateActions
        count={selected.length}
        composing={composing}
        sending={sending}
        aiDisabled={busy || locked}
        previewDisabled={locked}
        sendDisabled={sendBlockedReason !== null}
        sendBlockedReason={sendBlockedReason}
        previewOpen={previewOpen}
        onGenerate={() => void generate()}
        onTogglePreview={() => setPreviewOpen((open) => !open)}
        onSend={() => askNew(false)}
        onResolve={() => askNew(true)}
        onHold={(hold) =>
          void send({ kind: 'new', resolve: false, ids: selected, hold, description: '' })
        }
        onUndoDraft={beforeAi !== null ? undoAiDraft : undefined}
        tools={
          <TicketComposerTools
            editor={editorRef}
            onAttach={() => fileInputRef.current?.click()}
            attachDisabled={sending || locked || files.length >= MAX_FILES}
            disabled={busy || locked}
            onInsertTemplate={(template) => void insertTemplate(template)}
          />
        }
        moreItems={
          draftsUsable ? (
            <MenuItem
              icon={<FileText className="w-3.5 h-3.5" />}
              onSelect={() => void makeDrafts({ content: draft.trim() })}
              disabled={busy || blank || selected.length === 0 || tooMany}
            >
              Make a draft for each customer
            </MenuItem>
          ) : undefined
        }
        trailing={
          draftsUsable ? (
            <TemplatePicker
              use="ticket"
              label="Draft per customer from template"
              onPick={(template) => void makeDrafts({ templateId: template.id })}
              disabled={busy || selected.length === 0 || tooMany}
              triggerClassName={`${COMPOSER_TOOL} h-auto`}
            />
          ) : undefined
        }
      />
      {tooMany && (
        <p className="text-xs text-destructive">
          One reply can go to at most {replies.maxThreads} threads — untick{' '}
          {selected.length - replies.maxThreads}.
        </p>
      )}
      {templateError && (
        <p role="alert" className="text-xs text-destructive">
          {templateError}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {refused.length > 0 && (
        <ul className="space-y-0.5" aria-label="Threads given no draft">
          {refused.map((row) => (
            <li key={row.conversationId} className="text-xs text-destructive">
              {emailOf.get(row.conversationId) ?? `Thread #${row.conversationId}`}: no draft —{' '}
              {row.reason}
            </li>
          ))}
        </ul>
      )}

      {draftRows.length > 0 && (
        <TicketDraftsReview
          rows={draftRows}
          emailOf={emailOf}
          selected={selected}
          reviewIds={reviewIds}
          maxThreads={replies.maxThreads}
          busy={busy}
          saving={draftBusy}
          offerAdapt={offerAdapt}
          adaptPick={adaptPick}
          onAdaptPickChange={setAdaptPick}
          adaptResults={adaptResults}
          editing={editing}
          onEditingChange={setEditing}
          onSaveEdit={() => void saveEdit()}
          onSendReviewed={askReviewed}
          onAdapt={() => void adaptSelected()}
          onDiscard={() =>
            setConfirm({
              kind: 'discard',
              ids: draftRows.map((row) => row.conversationId),
              description: `Discard your drafts on this ticket — the ${draftRows.length} shown here. Nothing is sent.`,
            })
          }
        />
      )}

      <TicketSentHistory
        replies={replies.replies}
        threads={threads}
        emailOf={emailOf}
        unreachable={unreachable}
        maxThreads={replies.maxThreads}
        sending={sending}
        busy={busy}
        onAskAgain={askAgain}
        onAskHere={askHere}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm?.kind === 'discard') void discard();
          else if (confirm) void send(confirm);
        }}
        variant={confirm?.kind === 'discard' ? 'danger' : 'info'}
        title={confirm ? confirmTitle(confirm) : ''}
        description={confirm?.description ?? ''}
        confirmText={confirmButton(confirm)}
      />
    </Card>
  );
};
