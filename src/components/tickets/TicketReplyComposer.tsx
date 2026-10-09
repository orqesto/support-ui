import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { TemplatePicker } from '@/components/shared/TemplatePicker';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import { formatDate } from '@/lib/utils';
import {
  isInFlight,
  nameTokensWithoutFallback,
  sameReplyText,
  ticketRepliesService,
  type DeliveryOutcome,
  type TicketReplies,
  type TicketReply,
} from '@/services/ticketReplies.service';
import { ticketDraftsService } from '@/services/ticketDrafts.service';
import type { TicketThread } from '@/services/ticketThreads.service';
import { TicketDraftsReview, useDraftsWorkflow } from './TicketDraftsReview';

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

const OUTCOME_WORDS: Record<DeliveryOutcome, string> = {
  pending: 'waiting to send',
  sending: 'sending',
  sent: 'sent',
  refused: 'not sent',
  failed: 'failed',
  interrupted: 'stopped part-way',
};

type Confirm =
  | { kind: 'new'; resolve: boolean; ids: number[]; description: string }
  | { kind: 'again'; reply: TicketReply; ids: number[]; description: string }
  /** "Send here": an earlier reply into ONE thread it has not reached. */
  | { kind: 'here'; reply: TicketReply; ids: number[]; description: string }
  | { kind: 'reviewed'; resolve: boolean; ids: number[]; description: string }
  | { kind: 'discard'; ids: number[]; description: string };

/** Sent from reviewed drafts: the text shown is the base each thread's own version came from. */
const hasReviewedVersions = (reply: TicketReply) => reply.deliveries.some((row) => row.hasOwnText);
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
};

export const TicketReplyComposer = ({
  ticketId,
  threads,
  selected,
  replies,
  unreachable,
  onSent,
}: Props) => {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
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
    setFiles([]);
    editorRef.current?.setContent('');
    setConfirm(null);
    setNotice(null);
    setError(null);
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
  const busy = sending || draftBusy;

  const emailOf = new Map(threads.map((row) => [row.conversationId, row.requesterEmail]));
  const sentTo = (reply: TicketReply) =>
    new Set(
      reply.deliveries.filter((row) => row.outcome === 'sent').map((row) => row.conversationId)
    );
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
          return nameTokens.some((token) =>
            token === 'first_name' ? !known.firstName : !known.customerName
          );
        });
  const blank = isBlankRichText(draft);

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
      description: `Send this earlier reply to the ${ids.length} ${plural(ids.length, 'thread', 'threads')} that ${plural(ids.length, 'has', 'have')} not had it. Threads that already have it get nothing. A thread sent again after a failure keeps the choice it was first sent with (Pending or resolved); a thread new to this reply becomes Pending.${originalOnly(reply)}`,
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
    setSending(true);
    const startedOn = ticketId;
    const fresh = request.kind === 'new' || request.kind === 'reviewed';
    try {
      const result = await ticketRepliesService.send(
        startedOn,
        request.kind === 'new'
          ? { content: draft.trim() }
          : request.kind === 'reviewed'
            ? { fromDrafts: true }
            : { replyId: request.reply.id },
        request.ids,
        // A re-send leaves it to each thread's first choice (the server keeps it).
        fresh ? request.resolve : undefined,
        fresh ? files : []
      );
      if (currentTicket.current !== startedOn) return;
      if (request.kind === 'new') {
        setDraft('');
        setFiles([]);
        editorRef.current?.setContent('');
      }
      if (request.kind === 'reviewed') {
        setFiles([]);
        setAdaptResults(new Map());
        setRefused([]);
        void drafts.refresh();
      }
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
    <section className="space-y-3 pt-3 border-t border-border" aria-label="Reply to these threads">
      <div>
        <h4 className="text-sm font-medium">Reply to the ticked threads</h4>
        <p className="text-xs text-muted-foreground">
          One reply, sent to each customer separately in their own email thread.
        </p>
      </div>
      <RichTextEditor
        ref={editorRef}
        content={draft}
        onChange={setDraft}
        placeholder="Write one reply for every ticked thread…"
        minHeight="100px"
        initiallyHidden={false}
        editable={!sending}
      />
      <p className="text-xs text-muted-foreground">
        Greet each customer by name with {'{first_name|there}'} — “there” is used when the name is
        unknown. Also: {'{customer_name}'}, {'{ticket_id}'}, {'{thread_id}'}, {'{agent_name}'}.
      </p>
      {unnamed.length > 0 && (
        <p className="text-xs text-destructive">
          {unnamed.length} ticked {plural(unnamed.length, 'customer has', 'customers have')} no name
          on record — {plural(unnamed.length, 'that thread', 'those threads')} will not be sent
          unless you add a fallback, e.g. {'{first_name|there}'}.
        </p>
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || files.length >= MAX_FILES}
        >
          <Paperclip className="w-4 h-4 mr-1" aria-hidden />
          Attach
        </Button>
        <Button
          size="sm"
          onClick={() => askNew(false)}
          isLoading={sending}
          disabled={sending || blank || selected.length === 0 || tooMany}
        >
          Send to {selected.length} {plural(selected.length, 'thread', 'threads')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => askNew(true)}
          disabled={sending || blank || selected.length === 0 || tooMany}
        >
          Send &amp; resolve all
        </Button>
        {draftsUsable && (
          <>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => void makeDrafts({ content: draft.trim() })}
              disabled={busy || blank || selected.length === 0 || tooMany}
            >
              Make drafts
            </Button>
            <TemplatePicker
              use="ticket"
              label="Use template"
              onPick={(template) => void makeDrafts({ templateId: template.id })}
              disabled={busy || selected.length === 0 || tooMany}
            />
          </>
        )}
      </div>
      {tooMany && (
        <p className="text-xs text-destructive">
          One reply can go to at most {replies.maxThreads} threads — untick{' '}
          {selected.length - replies.maxThreads}.
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

      {replies.replies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Sent from this ticket</h4>
          <ul className="space-y-2">
            {replies.replies.map((reply) => {
              const had = sentTo(reply);
              const reached = threads.filter((row) => had.has(row.conversationId)).length;
              const live = new Set(
                reply.deliveries
                  .filter((row) => isInFlight(row.outcome))
                  .map((row) => row.conversationId)
              );
              /*
                R6: the threads that should have it and do not — a delivery that failed, was
                refused or stopped part-way, and a thread linked to the ticket AFTER this reply.
                ⛔ Never a thread the agent left unticked on purpose (it has no delivery row and
                was already on the ticket).
              */
              const tried = new Set(reply.deliveries.map((row) => row.conversationId));
              const missing = threads
                .filter(
                  (row) =>
                    tried.has(row.conversationId) ||
                    new Date(row.addedAt).getTime() > new Date(reply.createdAt).getTime()
                )
                .map((row) => row.conversationId)
                .filter((id) => !had.has(id) && !live.has(id) && !unreachable.has(id));
              // "Send here": every other thread it has not reached that it can reach — one at a time.
              const offered = new Set(missing);
              const here =
                reply.content === null
                  ? []
                  : threads
                      .map((row) => row.conversationId)
                      .filter(
                        (id) =>
                          !had.has(id) && !live.has(id) && !unreachable.has(id) && !offered.has(id)
                      );
              const problems = reply.deliveries.filter(
                (row) =>
                  row.outcome === 'failed' ||
                  row.outcome === 'refused' ||
                  row.outcome === 'interrupted'
              );
              return (
                <li key={reply.id} className="p-3 rounded-lg border border-border space-y-1">
                  {reply.content === null ? (
                    <p className="text-sm text-muted-foreground">
                      Sent only to threads in departments you cannot open.
                    </p>
                  ) : (
                    <p className="text-sm line-clamp-2">{stripHtml(reply.content)}</p>
                  )}
                  {reply.content !== null && hasReviewedVersions(reply) && (
                    <p className="text-xs text-muted-foreground">
                      Each customer received their own reviewed version.
                    </p>
                  )}
                  {reply.attachments.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <Paperclip className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
                      {reply.attachments.map((file) => file.filename).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {reply.createdBy?.name ?? 'Someone'} · {formatDate(reply.createdAt)} · sent to{' '}
                    {reached} of {threads.length}
                    {live.size > 0 && ` · sending to ${live.size}…`}
                    {reply.hiddenCount > 0 &&
                      ` · ${reply.hiddenCount} more in departments you cannot open`}
                  </p>
                  {problems.map((row) => (
                    <p key={row.conversationId} className="text-xs text-destructive">
                      {emailOf.get(row.conversationId) ?? `Thread #${row.conversationId}`}:{' '}
                      {OUTCOME_WORDS[row.outcome]}
                      {row.reason && ` — ${row.reason}`}
                    </p>
                  ))}
                  {/* A reply the agent cannot read is not theirs to send on (G1). */}
                  {reply.content !== null && missing.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => askAgain(reply, missing)}
                      disabled={sending || missing.length > replies.maxThreads}
                    >
                      Send to the {missing.length}{' '}
                      {plural(missing.length, 'thread that has', 'threads that have')} not had it
                    </Button>
                  )}
                  {here.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">Not sent to:</span>
                      {here.map((id) => (
                        <Button
                          key={id}
                          size="sm"
                          variant="ghost"
                          onClick={() => askHere(reply, id)}
                          disabled={busy}
                          aria-label={`Send this reply to ${emailOf.get(id) ?? `thread #${id}`}`}
                          className="h-auto px-1.5 py-0.5 text-xs"
                        >
                          {emailOf.get(id) ?? `Thread #${id}`} · Send here
                        </Button>
                      ))}
                    </div>
                  )}
                  {missing.length > replies.maxThreads && (
                    <p className="text-xs text-muted-foreground">
                      More than {replies.maxThreads} threads have not had it — one send reaches at
                      most {replies.maxThreads}; tick them in the list above and send it again.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
    </section>
  );
};
