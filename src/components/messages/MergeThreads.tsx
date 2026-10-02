import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitMerge, Undo2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { getConvUrlId } from '@/lib/messageHelpers';
import { conversationMergeService, type ManualMerge } from '@/services/conversationMerge.service';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { MergeConfirmDialog, type MergeRow } from './MergeConfirmDialog';
import {
  MG_BODY,
  MG_DIALOG,
  MG_DIM,
  MG_EMPTY,
  MG_HEAD,
  MG_TITLE,
  REL_BTN,
  REL_HINT,
  REL_LEAD,
  REL_ROW,
  REL_SECTION,
  REL_SECTION_HEAD,
  REL_SECTION_TITLE,
} from './relatedStyles';
import { channelInSentence } from './messageDetailConstants';

/**
 * The customer's organisation, as a search: `mp@deals.badideas.fund` → `badideas.fund`.
 *
 * Why not the address itself: the case this exists for (ODL-SUP-19 + ODL-MKT-1, 2026-09-23) is
 * one person writing from TWO addresses, and a search on either misses the other. The last two
 * labels are a heuristic, not a registrable-domain parser — `shop.co.uk` gives `co.uk`, which is
 * too wide, so the agent can always type a ticket number or an address instead.
 */
/**
 * Public providers: a domain shared by strangers. Searching `gmail.com` listed every Gmail sender
 * in the workspace (staging, 2026-09-24) — for these the customer's own address is the query.
 * Mirrors the backend's GENERIC_MAIL_DOMAINS (support-service `genericMailDomains.ts`).
 */
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'inbox.lv',
]);

export const customerDomainQuery = (sender: string | null | undefined): string => {
  // `Name <addr@host>` → `addr@host`: the stored requester often carries a display name.
  const raw = (sender ?? '').match(/<([^>]+)>/)?.[1] ?? sender ?? '';
  const address = raw.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 0) return sender ?? '';
  if (PUBLIC_MAIL_DOMAINS.has(address.slice(at + 1))) return address;
  const labels = address
    .slice(at + 1)
    .split('.')
    .filter(Boolean);
  return labels.length >= 2 ? labels.slice(-2).join('.') : labels.join('.');
};

type MergePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message;
  /**
   * After a merge. When this thread was merged AWAY the dialog has already navigated to the
   * survivor; the caller only refreshes what it shows.
   */
  onMerged?: (survivor: MergeRow, mergedIn: MergeRow[]) => void;
};

/**
 * "Merge with another thread" — search, choose, then MergeConfirmDialog says what will happen.
 * v4 `.mg-dlg` visuals; the search starts from the customer's organisation (customerDomainQuery).
 */
export const MergePickerDialog = ({
  open,
  onOpenChange,
  message,
  onMerged,
}: MergePickerDialogProps) => {
  const navigate = useNavigate();
  const orgCode = useCurrentOrgCode();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirmRows, setConfirmRows] = useState<MergeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Searches can overlap (a reopen, a second Search press): only the latest may write the list.
  const searchSeq = useRef(0);

  const search = useCallback(
    async (term: string) => {
      const seq = ++searchSeq.current;
      setSearching(true);
      setError(null);
      try {
        const res = await messageService.getThreads({ search: term, lifecycle: 'all' }, 1, 25);
        if (seq !== searchSeq.current) return;
        const rows = (res.data ?? []) as unknown as Array<{
          latestMessage?: Message;
          sender?: string | null;
        }>;
        setCandidates(
          rows
            // The customer's address lives on the THREAD row (what the list shows), not on its
            // latestMessage — reading only the message left every picker row as "·" (staging).
            .map((row) =>
              row.latestMessage
                ? { ...row.latestMessage, sender: row.sender ?? row.latestMessage.sender }
                : undefined
            )
            .filter((row): row is Message => !!row && row.id !== message.id)
            // Same channel only: the backend refuses the rest, so do not offer them.
            .filter((row) => row.channel === message.channel)
        );
      } catch (err) {
        if (seq !== searchSeq.current) return;
        logger.error('Failed to search threads to merge', err);
        setCandidates([]);
        setError(getApiErrorMessage(err) ?? 'Could not search threads just now.');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [message.id, message.channel]
  );

  // Every opening starts from the customer's organisation.
  useEffect(() => {
    if (!open) return;
    const initial = customerDomainQuery(message.sender);
    setQuery(initial);
    setCandidates([]);
    setError(null);
    if (initial) void search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open]);

  const afterMerge = (survivor: MergeRow, mergedIn: MergeRow[]) => {
    setConfirmRows(null);
    onOpenChange(false);
    if (survivor.id !== message.id) {
      // This thread was merged away — show the one that now holds its messages. Navigate FIRST:
      // refreshing here would reload a thread that no longer exists and flash an error.
      navigate(
        `/messages?id=${getConvUrlId({ id: survivor.id, publicId: survivor.publicId }, orgCode)}`
      );
    }
    onMerged?.(survivor, mergedIn);
  };

  const label = (row: { id: number; publicId?: string | null }) => getConvUrlId(row, orgCode);
  const channelWord = channelInSentence(message.channel);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} className={MG_DIALOG} sheetOnPhone>
        <DialogHeader className={MG_HEAD}>
          <DialogTitle className={MG_TITLE}>Merge with another thread</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>
        <DialogContent className={MG_BODY}>
          <SearchInput
            value={query}
            onChange={setQuery}
            onSearch={() => void search(query)}
            showSearchButton
            placeholder="Thread number, address or subject"
          />
          <p className="m-0 text-[11.5px] text-muted-foreground">
            Only {channelWord} threads can merge into this one.
          </p>
          {error && <p className="m-0 text-destructive">{error}</p>}
          {searching ? (
            <p className={MG_EMPTY}>Searching…</p>
          ) : candidates.length === 0 ? (
            !error && <p className={MG_EMPTY}>No other threads match.</p>
          ) : (
            <ul className="grid gap-0.5">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center gap-2.5 px-2 py-[7px] -mx-2 rounded-lg hover:bg-muted"
                >
                  <span className="flex flex-col flex-1 min-w-0 leading-[1.35]">
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {label(candidate)}
                    </span>
                    <span className="text-[13px] font-medium truncate">
                      {candidate.subject?.trim() ? candidate.subject : '(no subject)'}
                    </span>
                    {candidate.sender && <span className={MG_DIM}>{candidate.sender}</span>}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3"
                    onClick={() => setConfirmRows([message, candidate])}
                  >
                    Choose
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <MergeConfirmDialog
        open={confirmRows !== null}
        rows={confirmRows ?? []}
        currentId={message.id}
        onOpenChange={(next) => {
          if (!next) setConfirmRows(null);
        }}
        onMerged={afterMerge}
      />
    </>
  );
};

type MergedSectionProps = {
  message: Pick<Message, 'id'>;
  /** What was merged into this thread. */
  merges: ManualMerge[];
  canManage: boolean;
  /** Open the merge picker. */
  onMerge: () => void;
  /** After an unmerge the server confirmed (with the thread it took out): reload what shows. */
  onUnmerged: (unmergedId: number) => void;
};

/**
 * v4 "Same conversation" (`mergedHTML`): what was merged in, each with Unmerge, and Merge….
 * Rendered in the header's "Merged · n" popover. A merge leaves ONE thread (the others' messages
 * move in and they leave the inbox), unlike adding threads to a ticket, where each stays.
 */
export const MergedSection = ({
  message,
  merges,
  canManage,
  onMerge,
  onUnmerged,
}: MergedSectionProps) => {
  const orgCode = useCurrentOrgCode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doUnmerge = async (merge: ManualMerge) => {
    setBusy(true);
    setError(null);
    try {
      await conversationMergeService.unmerge(message.id, merge.id);
      toast.success(`${getConvUrlId(merge, orgCode)} unmerged — it is its own thread again`);
      onUnmerged(merge.id);
    } catch (err) {
      logger.error('Failed to unmerge', err);
      setError(
        getApiErrorMessage(err) ?? 'That thread could not be unmerged. Nothing was changed.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={REL_SECTION} aria-label="Same conversation">
      <div className={REL_SECTION_HEAD}>
        <h5 className={REL_SECTION_TITLE}>
          <GitMerge className="h-[13px] w-[13px] text-muted-foreground flex-none" aria-hidden />
          Same conversation
        </h5>
        {canManage && (
          <Button variant="ghost" className={REL_BTN} onClick={onMerge} disabled={busy}>
            Merge…
          </Button>
        )}
      </div>
      <p className={REL_LEAD}>
        Two threads become one. The other thread’s messages move in here and it leaves the inbox;
        Unmerge undoes it.
      </p>
      {merges.length === 0 ? (
        <p className={REL_HINT}>
          Merge when the same conversation arrived as two threads — for example the customer wrote
          back from another address.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {merges.map((merge) => (
            <li key={merge.id} className={REL_ROW}>
              <span className="flex-1 min-w-0">
                <span className="font-mono text-[11.5px] text-foreground">
                  {getConvUrlId(merge, orgCode)}
                </span>{' '}
                merged in
                {merge.mergedAt && !Number.isNaN(Date.parse(merge.mergedAt)) && (
                  <span className="block text-[10.5px] text-muted-foreground">
                    {new Date(merge.mergedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  className={REL_BTN}
                  onClick={() => void doUnmerge(merge)}
                  disabled={busy}
                  aria-label={`Unmerge ${getConvUrlId(merge, orgCode)}`}
                >
                  <Undo2 className="h-3 w-3 mr-1" aria-hidden />
                  Unmerge
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="m-0 text-[12px] text-destructive">{error}</p>}
    </section>
  );
};
