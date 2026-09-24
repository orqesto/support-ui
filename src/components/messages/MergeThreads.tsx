import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitMerge, Undo2 } from 'lucide-react';
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

type Props = {
  message: Message;
  /** Refresh the surrounding surfaces — a merge changes the thread and the board. */
  onChanged?: () => void;
};

/**
 * "These are the SAME conversation." Unlike Link (same piece of work, two tickets), a merge
 * leaves ONE ticket: the others' messages move in and they leave the inbox. Undoable here.
 *
 * ⛔ Hidden entirely when the backend cannot answer `GET /merges` — an older backend has no merge
 * route, and offering a button that 404s would be worse than not offering it.
 */
export const MergeThreads = ({ message, onChanged }: Props) => {
  const navigate = useNavigate();
  const orgCode = useCurrentOrgCode();
  const [merges, setMerges] = useState<ManualMerge[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirmRows, setConfirmRows] = useState<MergeRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMerges(await conversationMergeService.listMerges(message.id));
  }, [message.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = useCallback(
    async (term: string) => {
      setSearching(true);
      setError(null);
      try {
        const res = await messageService.getThreads({ search: term, lifecycle: 'all' }, 1, 25);
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
        logger.error('Failed to search tickets to merge', err);
        setError(getApiErrorMessage(err) ?? 'Could not search tickets just now.');
      } finally {
        setSearching(false);
      }
    },
    [message.id, message.channel]
  );

  const openPicker = () => {
    const initial = customerDomainQuery(message.sender);
    setQuery(initial);
    setCandidates([]);
    setPickerOpen(true);
    if (initial) void search(initial);
  };

  const afterMerge = (survivor: MergeRow) => {
    setConfirmRows(null);
    setPickerOpen(false);
    if (survivor.id !== message.id) {
      // This ticket was merged away — show the one that now holds its messages. Navigate FIRST:
      // refreshing here would reload a thread that no longer exists and flash an error.
      navigate(
        `/messages?id=${getConvUrlId({ id: survivor.id, publicId: survivor.publicId }, orgCode)}`
      );
    } else {
      void load();
    }
    onChanged?.();
  };

  const doUnmerge = async (merge: ManualMerge) => {
    setBusy(true);
    setError(null);
    try {
      await conversationMergeService.unmerge(message.id, merge.id);
      await load();
      onChanged?.();
    } catch (err) {
      logger.error('Failed to unmerge', err);
      setError(
        getApiErrorMessage(err) ?? 'That ticket could not be unmerged. Nothing was changed.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (merges === null) return null;

  const label = (row: { id: number; publicId?: string | null }) => getConvUrlId(row, orgCode);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-medium flex items-center gap-1.5">
          <GitMerge className="h-3.5 w-3.5" aria-hidden />
          Same conversation
        </h4>
        <Button variant="outline" size="sm" onClick={openPicker} disabled={busy}>
          Merge…
        </Button>
      </div>

      {merges.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Merge when the same conversation arrived as two tickets — for example the customer wrote
          back from another address.
        </p>
      ) : (
        <ul className="space-y-1">
          {merges.map((merge) => (
            <li key={merge.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">
                <span className="font-mono">{label(merge)}</span> merged in
                {merge.mergedAt && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {new Date(merge.mergedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void doUnmerge(merge)}
                disabled={busy}
              >
                <Undo2 className="h-3 w-3 mr-1" aria-hidden />
                Unmerge
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogHeader>
          <DialogTitle>Merge with another ticket</DialogTitle>
          <DialogClose onClose={() => setPickerOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSearch={() => void search(query)}
              showSearchButton
              placeholder="Ticket number, address or subject"
            />
            {searching ? (
              <p className="text-sm text-muted-foreground">Searching…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other tickets match.</p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((candidate) => (
                  <li key={candidate.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">
                      <span className="font-mono text-xs mr-1.5">{label(candidate)}</span>
                      {candidate.subject?.trim() ? candidate.subject : '(no subject)'}
                      {candidate.sender && (
                        <span className="text-muted-foreground"> · {candidate.sender}</span>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRows([message, candidate])}
                    >
                      Choose
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MergeConfirmDialog
        open={confirmRows !== null}
        rows={confirmRows ?? []}
        onOpenChange={(open) => {
          if (!open) setConfirmRows(null);
        }}
        onMerged={afterMerge}
      />
    </div>
  );
};
