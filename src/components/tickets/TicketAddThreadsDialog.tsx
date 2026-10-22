import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/Dialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { THREAD_PICKER_LIMIT, type ThreadCandidate } from '@/services/threadCandidates.service';

/** "Add threads to this ticket": search any customer's threads, add each with one press. */
export const TicketAddThreadsDialog = ({
  open,
  onClose,
  query,
  onQueryChange,
  error,
  candidates,
  capped,
  busy,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  error: string | null;
  /** null while the first search runs. */
  candidates: ThreadCandidate[] | null;
  capped: boolean;
  busy: boolean;
  onAdd: (conversationId: number) => void;
}) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add threads to this ticket</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <div className="space-y-3">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          leadingIcon
          ariaLabel="Search threads"
          placeholder="Search any customer’s threads — name, address, subject"
        />
        {/* Inside the dialog: the page's own line is behind its overlay. */}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {candidates === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : candidates.length === 0 && !capped && !error ? (
          <p className="text-sm text-muted-foreground">
            {query.trim() ? 'No thread matches that.' : 'No other threads to add.'}
          </p>
        ) : (
          // One bordered list that scrolls, as the design's Add threads (`.cands`).
          <ul className="overflow-auto max-h-[300px] rounded-[9px] border border-border">
            {candidates.map((row) => (
              <li
                key={row.id}
                className="flex gap-2.5 items-center py-2 pr-2 pl-3 text-[13px] border-t border-border/60 first:border-t-0"
              >
                <span className="flex-1 min-w-0 truncate">
                  {row.sender}
                  {row.subject && <span className="text-muted-foreground"> · {row.subject}</span>}
                </span>
                <Button size="sm" variant="outline" onClick={() => onAdd(row.id)} disabled={busy}>
                  Add
                </Button>
              </li>
            ))}
            {capped && (
              <li className="py-2 px-3 text-xs border-t border-border/60 text-muted-foreground">
                Showing the newest {THREAD_PICKER_LIMIT}. Search to find another thread.
              </li>
            )}
          </ul>
        )}
        <p className="text-[12.5px] text-muted-foreground">
          Every lifecycle is searched — a thread already answered and resolved still belongs on the
          incident it reported.
        </p>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
