import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { logger } from '@/lib/logger';
import {
  searchThreadCandidates,
  THREAD_PICKER_LIMIT,
  type ThreadCandidate,
} from '@/services/threadCandidates.service';

type Props = {
  chosen: ThreadCandidate[];
  onChosenChange: (chosen: ThreadCandidate[]) => void;
  /** The thread the ticket is created from: listed, never offered, not removable here. */
  fixed?: ThreadCandidate | null;
};

/**
 * "Threads it explains" on Create ticket: any customer's, every lifecycle (as "Add threads" on a
 * ticket). Optional — threads can be added later on the ticket page as well.
 */
export const TicketThreadPicker = ({ chosen, onChosenChange, fixed = null }: Props) => {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ThreadCandidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchThreadCandidates(query)
        .then(({ candidates: found, capped: full }) => {
          if (seq !== searchSeq.current) return;
          setCapped(full);
          setCandidates(found);
        })
        .catch((err: unknown) => {
          if (seq !== searchSeq.current) return;
          logger.error('New ticket: thread search failed', err);
          // Nothing listed: the "showing the newest 25" of an earlier search no longer applies.
          setCapped(false);
          setCandidates([]);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const takenIds = new Set([...chosen.map((row) => row.id), ...(fixed ? [fixed.id] : [])]);
  const offered = (candidates ?? []).filter((row) => !takenIds.has(row.id));

  return (
    <section className="space-y-2" aria-label="Threads it explains">
      <p className="text-sm font-medium text-foreground">
        Threads it explains <span className="font-normal text-muted-foreground">· optional</span>
      </p>
      {(fixed || chosen.length > 0) && (
        <ul className="flex flex-wrap gap-1" aria-label="Chosen threads">
          {fixed && (
            <li>
              <Tooltip content="The thread this ticket is created from" size="sm">
                <Badge variant="secondary">
                  {fixed.publicId ?? `#${fixed.id}`} · {fixed.sender} (this thread)
                </Badge>
              </Tooltip>
            </li>
          )}
          {chosen.map((row) => (
            <li key={row.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChosenChange(chosen.filter((one) => one.id !== row.id))}
                aria-label={`Leave out ${row.sender || `thread #${row.id}`}`}
              >
                {row.publicId ?? `#${row.id}`} · {row.sender}
                <X className="ml-1 w-3 h-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <SearchInput
        value={query}
        onChange={setQuery}
        leadingIcon
        ariaLabel="Threads it explains (optional)"
        placeholder="Search any customer’s threads — name, address, subject"
      />
      {/* One bordered list that scrolls, as the design's candidates (`.cands`). */}
      <ul
        className="overflow-y-auto max-h-[264px] rounded-[9px] border border-border"
        aria-label="Threads found"
      >
        {candidates === null ? (
          <li className="py-2.5 px-3 text-xs text-muted-foreground">Searching…</li>
        ) : offered.length === 0 ? (
          <li className="py-2.5 px-3 text-xs text-muted-foreground">No threads match.</li>
        ) : (
          offered.map((row) => (
            <li
              key={row.id}
              className="flex gap-2.5 items-center py-1.5 pr-2 pl-3 text-[13px] border-t border-border/60 first:border-t-0"
            >
              <span className="flex-1 min-w-0 truncate">
                <b className="font-semibold">{row.sender}</b>
                <span className="text-muted-foreground"> · {row.subject ?? '(no subject)'}</span>
              </span>
              {row.status && (
                <Badge variant={statusVariant(row.status)} size="sm">
                  {row.status.replace('_', ' ')}
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChosenChange([...chosen, row])}
                aria-label={`Add ${row.sender || `thread #${row.id}`}`}
              >
                Add
              </Button>
            </li>
          ))
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Every lifecycle is searched — a thread already answered and resolved still belongs on the
        incident it reported. You can add more on the ticket later.
        {capped && ` Showing the newest ${THREAD_PICKER_LIMIT}; search to find another thread.`}
      </p>
    </section>
  );
};

/** A thread's lifecycle as the thread list colours it: done green, waiting grey, live blue. */
const statusVariant = (status: string): 'success' | 'secondary' | 'info' =>
  status === 'resolved' || status === 'closed'
    ? 'success'
    : status === 'pending' || status === 'on_hold'
      ? 'secondary'
      : 'info';
