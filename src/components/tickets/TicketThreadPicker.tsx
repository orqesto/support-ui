import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
    <div className="space-y-2">
      <Input
        label="Threads it explains (optional)"
        value={query}
        placeholder="Search any customer’s threads — name, address, subject"
        onChange={(event) => setQuery(event.target.value)}
      />
      {(fixed || chosen.length > 0) && (
        <ul className="flex flex-wrap gap-1" aria-label="Chosen threads">
          {fixed && (
            <li>
              <Badge variant="secondary">
                {fixed.publicId ?? `#${fixed.id}`} · {fixed.sender} (this thread)
              </Badge>
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
                type="button"
                size="sm"
                onClick={() => onChosenChange([...chosen, row])}
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
          Showing the newest {THREAD_PICKER_LIMIT}. Search to find another thread.
        </p>
      )}
    </div>
  );
};
