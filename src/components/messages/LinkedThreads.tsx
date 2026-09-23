import { useCallback, useEffect, useState } from 'react';
import { Link2, Link2Off, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/Dialog';
import { messageService } from '@/services/message.service';
import {
  AssigneeConflictError,
  conversationLinksService,
  type ConversationLinks,
} from '@/services/conversationLinks.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import type { Message } from '@/types';

/**
 * "These two conversations are the same piece of customer work."
 *
 * The backend has offered this since 2026-09-19 (support-service #767) and nothing in the product
 * could say it. The shape it exists for, measured on CoreSarms 2026-09-18: 3 of 4 one-sided alerts
 * had a sibling thread from the SAME customer on a different Gmail thread, days apart — the
 * customer's reply was in one thread and the agent's work in another, and each looked unanswered.
 *
 * ⛔ NOT A MERGE, and the copy must never suggest one. Both threads survive; unlinking undoes it
 * completely. "These are the SAME conversation" is a merge — `MergeThreads`, beside this panel.
 */
type Props = {
  message: Message;
  /** Refresh the surrounding surfaces — linking can change an SLA badge (TL-D1). */
  onChanged?: () => void;
};

type Candidate = { id: number; subject: string | null; status: string; lastMessageAt?: string };

export const LinkedThreads = ({ message, onChanged }: Props) => {
  const [links, setLinks] = useState<ConversationLinks>({ linkedIds: [], slaAnchorAt: null });
  const [summaries, setSummaries] = useState<Record<number, Candidate>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** TL-D2: set when the backend hands the assignee decision back as a 409. */
  const [conflict, setConflict] = useState<Candidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const next = await conversationLinksService.list(message.id);
      setLinks(next);
      /*
        One hop, so this list is short by construction — the backend refuses to walk the graph
        precisely so that A–B and B–C never drag in a third customer's thread. Fetching each is
        therefore bounded, and a linked id alone is useless to a human: "linked to 14657" is not
        something an agent can act on.
      */
      const rows = await Promise.allSettled(next.linkedIds.map((id) => messageService.getById(id)));
      const resolved: Record<number, Candidate> = {};
      rows.forEach((row, index) => {
        const id = next.linkedIds[index];
        if (row.status === 'fulfilled' && row.value?.data) {
          const data = row.value.data as unknown as Message;
          resolved[id] = { id, subject: data.subject ?? null, status: data.status };
        }
      });
      setSummaries(resolved);
    } catch (err) {
      // ⛔ A failed READ is not "no links". An older backend has no such route, and rendering
      // "not linked to anything" would state something false about this thread.
      logger.error('Failed to read thread links', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [message.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPicker = async () => {
    setPickerOpen(true);
    setError(null);
    const email = message.sender ?? '';
    try {
      /*
        The SAME customer's other threads, because that is the shape linking exists for. A free
        search over every thread would let an agent link two different customers' work together,
        which no amount of undo makes harmless — the SLA anchor would then be computed across
        strangers.
      */
      const res = await messageService.getThreads({ search: email, lifecycle: 'all' }, 1, 25);
      const rows = (res.data ?? []) as unknown as Array<{ latestMessage?: Message }>;
      setCandidates(
        rows
          .map((row) => row.latestMessage)
          .filter((row): row is Message => !!row)
          .filter((row) => row.id !== message.id && !links.linkedIds.includes(row.id))
          .map((row) => ({ id: row.id, subject: row.subject ?? null, status: row.status }))
      );
    } catch (err) {
      logger.error('Failed to list candidate threads', err);
      // ⛔ The BACKEND'S words first. A generic sentence hides the one thing that tells an agent
      // whether to retry, ask an admin, or stop — the repo's `errorShape` guard enforces this.
      setError(getApiErrorMessage(err) ?? 'Could not list this customer’s other threads.');
    }
  };

  const doLink = async (target: Candidate, assigneeId?: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await conversationLinksService.link(message.id, target.id, assigneeId);
      setPickerOpen(false);
      setConflict(null);
      await load();
      onChanged?.();
    } catch (err) {
      if (err instanceof AssigneeConflictError) {
        // ⛔ NOT an error message. Somebody is working that thread, and the backend refused
        // precisely so a person decides rather than one of them silently losing it.
        setConflict(target);
        return;
      }
      logger.error('Failed to link threads', err);
      setError(
        getApiErrorMessage(err) ??
          'Those threads could not be linked. Try again, or check with an admin.'
      );
    } finally {
      setBusy(false);
    }
  };

  const doUnlink = async (id: number) => {
    setBusy(true);
    try {
      await conversationLinksService.unlink(message.id, id);
      await load();
      onChanged?.();
    } catch (err) {
      logger.error('Failed to unlink threads', err);
      setError(getApiErrorMessage(err) ?? 'That link could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-medium flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Same piece of work
        </h4>
        <Button variant="outline" size="sm" onClick={() => void openPicker()} disabled={busy}>
          <Plus className="h-3 w-3 mr-1" aria-hidden />
          Link a thread
        </Button>
      </div>

      {loading ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : failed ? (
        <p className="text-[12px] text-muted-foreground">
          We could not read this thread’s links just now, so this list is not complete.
        </p>
      ) : links.linkedIds.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Not linked to anything. Link a thread when the same request arrived twice — the reply in
          one and the question in another.
        </p>
      ) : (
        <ul className="space-y-1">
          {links.linkedIds.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">
                {summaries[id]?.subject || `Conversation ${id}`}
                {summaries[id]?.status && (
                  <span className="text-muted-foreground"> · {summaries[id].status}</span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void doUnlink(id)} disabled={busy}>
                <Link2Off className="h-3 w-3 mr-1" aria-hidden />
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/*
        TL-D1, said plainly: linking moves the clock to the EARLIEST customer message across the
        set, so it can surface a breach that was previously hidden. That is the intended signal —
        the customer really has been waiting that long — and an agent seeing a badge change with
        no explanation would read it as a bug.
      */}
      {links.slaAnchorAt && links.linkedIds.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Response time is measured from the earliest customer message across these threads (
          {new Date(links.slaAnchorAt).toLocaleDateString()}).
        </p>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogHeader>
          <DialogTitle>Link another thread from this customer</DialogTitle>
          <DialogClose onClose={() => setPickerOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {conflict ? (
            <div className="space-y-3">
              {/*
                TL-D2 in the agent's words. The two threads have different assignees and the
                backend will not choose — someone is working that thread.
              */}
              <p className="text-sm">
                Both threads already have someone working them. Who keeps both?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void doLink(conflict, message.assigneeId ?? null)}
                >
                  {message.assigneeName ?? 'This thread’s owner'}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setConflict(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other threads found for this customer.
            </p>
          ) : (
            <ul className="space-y-1">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">
                    {candidate.subject || `Conversation ${candidate.id}`}
                    <span className="text-muted-foreground"> · {candidate.status}</span>
                  </span>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void doLink(candidate)}>
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
