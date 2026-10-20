import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { answerToEditorHtml } from '@/components/messages/messageDetailConstants';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useDepartments } from '@/hooks/useDepartments';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { assignmentService } from '@/services/assignment.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { ticketThreadsService } from '@/services/ticketThreads.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message } from '@/types';

/**
 * "New ticket" on the Tickets page — a contingency (client spec; owner 2026-10-19): a title, its
 * cause and an owner, in a department, with the threads it already explains — or none yet ("allow
 * an empty contingency": the cause is often known before anyone reports it). Threads can be added
 * later on the ticket page as well.
 */

type Candidate = { id: number; publicId: string | null; subject: string | null; sender: string };

/** Search results shown at once; a full page says so. */
const PICKER_LIMIT = 25;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `threadsFailed`: the ticket exists but its chosen threads could not be linked. */
  onCreated: (ticketId: number, outcome: { threadsFailed: boolean }) => void;
};

type Option = { value: string; label: string };

export const NewTicketDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const user = useAuthStore((state) => state.user);
  // A primitive for the effects below: the user object is not guaranteed to keep its identity.
  const userId = user?.id;
  const { data: allDepartments = [] } = useDepartments();
  // A ticket is filed in one of the creator's departments; an administrator may pick any.
  const mayPickAny = user?.role === 'admin' || user?.organizationRole === 'org_admin';
  const departments = allDepartments.filter(
    (dept) => dept.active !== false && (mayPickAny || (user?.departmentIds ?? []).includes(dept.id))
  );

  const [title, setTitle] = useState('');
  const [cause, setCause] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  // The people who can own it, for the department they were read for: another department's are
  // never offered or sent, and Create waits for the current one's (else the creator went as owner
  // before the list could show they are not assignable — a global admin, #648).
  const [ownerList, setOwnerList] = useState<{ departmentId: string; options: Option[] } | null>(
    null
  );
  const ownersLoaded = ownerList !== null && ownerList.departmentId === departmentId;
  const owners = ownersLoaded ? ownerList.options : [];
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [chosen, setChosen] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // Each opening starts clean.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCause('');
    setOwnerId(userId === undefined ? '' : String(userId));
    setOwnerList(null);
    setQuery('');
    setCandidates(null);
    setChosen([]);
    setError(null);
  }, [open, userId]);

  // The first of the creator's departments, until they pick another.
  const firstDepartment = departments[0]?.id;
  useEffect(() => {
    if (open && !departmentId && firstDepartment !== undefined)
      setDepartmentId(String(firstDepartment));
  }, [open, departmentId, firstDepartment]);

  // Who can own it: the people assignable in that department.
  useEffect(() => {
    if (!open || !departmentId) return;
    let live = true;
    assignmentService
      .getAssignableUsers(undefined, Number(departmentId))
      .then((rows) => {
        if (!live) return;
        const options = rows.map((row) => ({
          value: String(row.id),
          label: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.email,
        }));
        setOwnerList({ departmentId, options });
        // The creator by default — only when they can own a ticket here (a global admin is not
        // listed: the picker showed "Select…" while the ticket went to them, staging 2026-10-19).
        setOwnerId((current) =>
          current && !options.some((option) => option.value === current) ? '' : current
        );
      })
      .catch((err: unknown) => {
        if (!live) return;
        logger.error('New ticket: owners failed', err);
        // Nobody can be checked as an owner: it goes unassigned rather than to an unchecked one.
        setOwnerList({ departmentId, options: [] });
        setOwnerId('');
      });
    return () => {
      live = false;
    };
  }, [open, departmentId]);

  // The threads it explains: any customer's, every lifecycle (as "Add threads" on a ticket).
  useEffect(() => {
    if (!open) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      messageService
        .getThreads(
          { ...(query.trim() ? { search: query.trim() } : {}), lifecycle: 'all' },
          1,
          PICKER_LIMIT
        )
        .then((res) => {
          if (seq !== searchSeq.current) return;
          const rows = (res.data ?? []) as unknown as Array<{
            latestMessage?: Message;
            sender?: string | null;
          }>;
          setCapped(rows.length >= PICKER_LIMIT);
          setCandidates(
            rows
              .map((row) =>
                row.latestMessage
                  ? { ...row.latestMessage, sender: row.sender ?? row.latestMessage.sender }
                  : undefined
              )
              .filter((row): row is Message => !!row)
              .map((row) => ({
                id: row.id,
                publicId: row.publicId ?? null,
                subject: row.subject ?? null,
                sender: row.sender ?? '',
              }))
          );
        })
        .catch((err: unknown) => {
          if (seq !== searchSeq.current) return;
          logger.error('New ticket: thread search failed', err);
          setCandidates([]);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query]);

  const chosenIds = new Set(chosen.map((row) => row.id));
  const offered = (candidates ?? []).filter((row) => !chosenIds.has(row.id));
  const ready =
    title.trim() !== '' && cause.trim() !== '' && departmentId !== '' && ownersLoaded && !busy;

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const response = await ticketService.create({
        title: title.trim(),
        description: normalizeEditorHtml(answerToEditorHtml(cause.trim())),
        departmentId: Number(departmentId),
        ...(ownerId ? { assigneeId: Number(ownerId) } : {}),
      });
      const ticketId = response.data?.id;
      if (!ticketId) throw new Error('The ticket was not created');
      let threadsFailed = false;
      if (chosen.length > 0) {
        try {
          await ticketThreadsService.addThreads(
            ticketId,
            chosen.map((row) => row.id)
          );
        } catch (err) {
          // The ticket exists: open it — its page adds threads, and says so — rather than fail the
          // whole step.
          logger.error('New ticket: linking its threads failed', err);
          threadsFailed = true;
        }
      }
      onCreated(ticketId, { threadsFailed });
    } catch (err) {
      logger.error('New ticket: create failed', err);
      setError(getApiErrorMessage(err) ?? 'The ticket could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>
        <div className="space-y-3">
          <Input
            label="Title"
            value={title}
            maxLength={500}
            placeholder="e.g. Customs papers lost by the carrier"
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <Textarea
            label="Cause"
            value={cause}
            rows={3}
            placeholder="What happened, as far as you know"
            onChange={(event) => setCause(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Department"
              aria-label="Department"
              value={departmentId}
              options={departments.map((dept) => ({ value: String(dept.id), label: dept.name }))}
              onChange={(value) => {
                setDepartmentId(value);
                setOwnerId('');
              }}
            />
            <Select
              label="Owner"
              aria-label="Owner"
              value={ownerId}
              options={[{ value: '', label: 'Unassigned' }, ...owners]}
              onChange={setOwnerId}
            />
          </div>
          <div className="space-y-2">
            <Input
              label="Threads it explains (optional)"
              value={query}
              placeholder="Search any customer’s threads — name, address, subject"
              onChange={(event) => setQuery(event.target.value)}
            />
            {chosen.length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label="Chosen threads">
                {chosen.map((row) => (
                  <li key={row.id}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setChosen((prev) => prev.filter((one) => one.id !== row.id))}
                      aria-label={`Leave out ${row.sender || `thread #${row.id}`}`}
                    >
                      {row.publicId ?? `#${row.id}`} · {row.sender}
                      <X className="ml-1 w-3 h-3" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <ul className="max-h-48 overflow-y-auto space-y-1" aria-label="Threads found">
              {candidates === null ? (
                <li className="text-xs text-muted-foreground">Searching…</li>
              ) : offered.length === 0 ? (
                <li className="text-xs text-muted-foreground">No threads match.</li>
              ) : (
                offered.map((row) => (
                  <li key={row.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate">
                      {row.sender} · {row.subject ?? '(no subject)'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setChosen((prev) => [...prev, row])}
                      aria-label={`Add ${row.sender || `thread #${row.id}`}`}
                    >
                      Add
                    </Button>
                  </li>
                ))
              )}
            </ul>
            {capped && (
              <p className="text-xs text-muted-foreground">
                Showing the newest {PICKER_LIMIT}. Search to find another thread.
              </p>
            )}
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={!ready} isLoading={busy}>
            {chosen.length > 0
              ? `Create with ${chosen.length} ${chosen.length === 1 ? 'thread' : 'threads'}`
              : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
