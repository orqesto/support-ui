import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { AI_DRAFTS_OFF_MESSAGE, getApiErrorMessage, isAiDraftsOffError } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import {
  ticketDraftsService,
  type AdaptResult,
  type DraftsCreated,
  type TicketDraft,
  type TicketDrafts,
} from '@/services/ticketDrafts.service';
import type { TicketThread } from '@/services/ticketThreads.service';

/**
 * The drafts on a ticket (reply templates P2). `data` null = not read yet (or the read failed);
 * `{ unavailable: true }` = a backend without drafts — the box then offers none.
 */
export const useTicketDrafts = (ticketId: number) => {
  const [data, setData] = useState<TicketDrafts | null>(null);
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await ticketDraftsService.draftsOfTicket(ticketId);
      if (mine === seq.current) setData(next);
    } catch (err) {
      logger.error('Failed to read the ticket’s drafts', err);
    }
  }, [ticketId]);
  useEffect(() => {
    setData(null);
    void refresh();
    return () => {
      seq.current += 1;
    };
  }, [refresh]);
  return { data, refresh };
};

/** Drafts per adapt request (the server refuses more than 10). */
export const ADAPT_BATCH = 5;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

type WorkflowArgs = {
  ticketId: number;
  threads: TicketThread[];
  /** The ticket on screen now — an answer for an earlier ticket writes nothing. */
  currentTicket: React.MutableRefObject<number>;
  setError: (message: string | null) => void;
  setNotice: (message: string | null) => void;
};

/** The drafts' state on the ticket reply box, and the actions that do not touch its own text. */
export const useDraftsWorkflow = ({
  ticketId,
  threads,
  currentTicket,
  setError,
  setNotice,
}: WorkflowArgs) => {
  const drafts = useTicketDrafts(ticketId);
  const draftsUsable = drafts.data !== null && !drafts.data.unavailable;
  const draftRows =
    drafts.data && !drafts.data.unavailable
      ? drafts.data.drafts.filter((row) =>
          threads.some((th) => th.conversationId === row.conversationId)
        )
      : [];
  const [refused, setRefused] = useState<DraftsCreated['refused']>([]);
  const [adaptPick, setAdaptPick] = useState<Set<number>>(new Set());
  const [adaptResults, setAdaptResults] = useState<Map<number, AdaptResult>>(new Map());
  const [editing, setEditing] = useState<DraftEdit | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const { off: aiDraftsOff } = useAiDraftsOff();
  // A 409 AI_DRAFTS_OFF answer outranks a cached "on": the switch was flipped since it was read.
  const [aiRefused, setAiRefused] = useState(false);
  const offerAdapt = !aiDraftsOff && !aiRefused;

  // A different ticket: nothing picked, edited or reported about the previous one stays.
  useEffect(() => {
    setRefused([]);
    setAdaptPick(new Set());
    setAdaptResults(new Map());
    setEditing(null);
  }, [ticketId]);

  /*
    The server takes at most 10 drafts per adapt request: the picked ones go in sequential batches
    of ADAPT_BATCH, progress on screen. A batch that fails stops the run — the drafts not yet
    adapted are reported as such, never left silent.
  */
  const adaptSelected = async () => {
    const ids = draftRows.map((row) => row.conversationId).filter((id) => adaptPick.has(id));
    setError(null);
    setNotice(null);
    setDraftBusy(true);
    const startedOn = ticketId;
    const byThread = new Map<number, AdaptResult>();
    const notAdapted = (from: number, reason: string | null) => {
      for (const id of ids.slice(from)) {
        if (!byThread.has(id)) byThread.set(id, { conversationId: id, ok: false, reason });
      }
    };
    try {
      for (let start = 0; start < ids.length; start += ADAPT_BATCH) {
        const batch = ids.slice(start, start + ADAPT_BATCH);
        setNotice(`Adapting ${start + batch.length} of ${ids.length}…`);
        let results: AdaptResult[];
        try {
          results = await ticketDraftsService.adapt(startedOn, batch);
        } catch (err) {
          logger.error('Failed to adapt the drafts', err);
          if (currentTicket.current !== startedOn) return;
          const offNow = isAiDraftsOffError(err);
          if (offNow) setAiRefused(true);
          const message = offNow
            ? AI_DRAFTS_OFF_MESSAGE
            : (getApiErrorMessage(err) ?? 'The drafts could not be adapted.');
          setError(message);
          notAdapted(start, offNow ? 'AI drafts are switched off' : message);
          break;
        }
        if (currentTicket.current !== startedOn) return;
        for (const row of results) byThread.set(row.conversationId, row);
        // A picked draft the server gave no answer for was NOT adapted — say so, never stay silent.
        for (const id of batch) {
          if (!byThread.has(id)) byThread.set(id, { conversationId: id, ok: false, reason: null });
        }
      }
      setNotice(null);
      setAdaptResults(byThread);
      setAdaptPick(new Set());
      await drafts.refresh();
    } finally {
      setDraftBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setError(null);
    setDraftBusy(true);
    const startedOn = ticketId;
    try {
      await ticketDraftsService.update(startedOn, editing.conversationId, editing.text.trim());
      if (currentTicket.current !== startedOn) return;
      setEditing(null);
      await drafts.refresh();
    } catch (err) {
      logger.error('Failed to save the draft', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'The draft could not be saved.');
    } finally {
      setDraftBusy(false);
    }
  };

  const discard = async () => {
    setDraftBusy(true);
    const startedOn = ticketId;
    try {
      await ticketDraftsService.discard(startedOn);
      if (currentTicket.current !== startedOn) return;
      setRefused([]);
      setAdaptPick(new Set());
      setAdaptResults(new Map());
      setEditing(null);
      await drafts.refresh();
    } catch (err) {
      logger.error('Failed to discard the drafts', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'The drafts could not be discarded.');
    } finally {
      setDraftBusy(false);
    }
  };

  return {
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
  };
};

/** The draft open for editing, with its unsaved text. */
export type DraftEdit = { conversationId: number; text: string };

type Props = {
  rows: TicketDraft[];
  emailOf: Map<number, string>;
  /** The ticked threads — only their drafts are sent. */
  selected: number[];
  /** The ticked threads with a draft that a reply can reach. */
  reviewIds: number[];
  maxThreads: number;
  busy: boolean;
  saving: boolean;
  /** False when AI drafts are off — no AI selection, no Adapt button. */
  offerAdapt: boolean;
  adaptPick: Set<number>;
  onAdaptPickChange: React.Dispatch<React.SetStateAction<Set<number>>>;
  adaptResults: Map<number, AdaptResult>;
  editing: DraftEdit | null;
  onEditingChange: (next: DraftEdit | null) => void;
  onSaveEdit: () => void;
  onSendReviewed: (resolve: boolean) => void;
  onAdapt: () => void;
  onDiscard: () => void;
};

/**
 * The drafts on a ticket, one row per thread (reply templates P2, build spec B): the customer, the
 * text (editable), whether AI adapted it, a box to pick it for AI, and what the last adapt did.
 * Send reviewed is held while a draft is open for editing — the server sends what it has saved.
 */
export const TicketDraftsReview = ({
  rows,
  emailOf,
  selected,
  reviewIds,
  maxThreads,
  busy,
  saving,
  offerAdapt,
  adaptPick,
  onAdaptPickChange,
  adaptResults,
  editing,
  onEditingChange,
  onSaveEdit,
  onSendReviewed,
  onAdapt,
  onDiscard,
}: Props) => (
  <div className="space-y-2" aria-label="Drafts to review">
    <h4 className="text-sm font-medium">Drafts to review</h4>
    <p className="text-xs text-muted-foreground">
      One draft per thread, the customer’s details already filled in. Edit any of them, have AI
      adapt the ones you tick, then send — only the ticked threads above get theirs.
      {rows.some((row) => row.templateId !== null) &&
        ' The template’s files are attached in every thread.'}
    </p>
    <ul className="space-y-2">
      {rows.map((row) => {
        const email = emailOf.get(row.conversationId) ?? `Thread #${row.conversationId}`;
        const result = adaptResults.get(row.conversationId);
        const isEditing = editing?.conversationId === row.conversationId;
        return (
          <li key={row.conversationId} className="p-3 rounded-lg border border-border space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {offerAdapt && (
                <Checkbox
                  checked={adaptPick.has(row.conversationId)}
                  onChange={(event) =>
                    onAdaptPickChange((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(row.conversationId);
                      else next.delete(row.conversationId);
                      return next;
                    })
                  }
                  disabled={busy || isEditing}
                  aria-label={`Adapt with AI: ${email}`}
                />
              )}
              <span className="text-sm font-medium">{email}</span>
              {row.adapted && <Badge variant="secondary">adapted</Badge>}
              {!selected.includes(row.conversationId) && (
                <Badge variant="secondary">not ticked — not sent</Badge>
              )}
            </div>
            {isEditing ? (
              <>
                <RichTextEditor
                  content={editing.text}
                  onChange={(html) =>
                    onEditingChange({ conversationId: row.conversationId, text: html })
                  }
                  placeholder={`Draft for ${email}`}
                  minHeight="80px"
                  initiallyHidden={false}
                  editable={!busy}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={onSaveEdit}
                    isLoading={saving}
                    disabled={busy || isBlankRichText(editing.text)}
                  >
                    Save draft
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditingChange(null)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm whitespace-pre-line line-clamp-6">
                  {stripHtml(row.content)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onEditingChange({ conversationId: row.conversationId, text: row.content })
                  }
                  disabled={busy || editing !== null}
                  aria-label={`Edit the draft for ${email}`}
                >
                  Edit
                </Button>
              </div>
            )}
            {result && (
              <p className={`text-xs ${result.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                {result.ok
                  ? 'Adapted by AI — read it before sending.'
                  : `Not adapted${result.reason ? ` — ${result.reason}` : ''}. The draft is unchanged; edit it by hand or try again.`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={() => onSendReviewed(false)}
        disabled={
          busy || editing !== null || reviewIds.length === 0 || reviewIds.length > maxThreads
        }
      >
        Send reviewed to {reviewIds.length} {plural(reviewIds.length, 'thread', 'threads')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSendReviewed(true)}
        disabled={
          busy || editing !== null || reviewIds.length === 0 || reviewIds.length > maxThreads
        }
      >
        Send reviewed &amp; resolve
      </Button>
      {offerAdapt && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAdapt}
          isLoading={saving}
          disabled={busy || editing !== null || adaptPick.size === 0}
        >
          Adapt selected with AI ({adaptPick.size})
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
        Discard drafts
      </Button>
    </div>
    {editing !== null && (
      <p className="text-xs text-muted-foreground">
        Save or cancel the draft you are editing before sending.
      </p>
    )}
  </div>
);
