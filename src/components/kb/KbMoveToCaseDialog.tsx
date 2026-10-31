import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { kbRef } from '@/lib/kbConsolidation';
import { searchKbCases } from '@/services/kbEngine.service';
import type { KbCaseCandidate } from '@/services/kbEngine.types';

/** A live case an entry can be moved into (one row of GET /cases/search). */
export type KbMoveTarget = KbCaseCandidate;

/** The entry being moved: its id and its scope (`s:<mailbox>` / `d:<team>`; null = none known). */
export type KbMoveEntry = { id: number; scopeKey?: string | null };

/** One search lists at most this many cases (the server's own cap is 50). */
export const MOVE_SEARCH_LIMIT = 20;
const SEARCH_DELAY_MS = 300;

export const NOT_YOUR_SCOPE_TEXT = "You can't move entries of this mailbox or team.";

/**
 * Pick the live case to move an entry into, then confirm. The server searches the cases (KB
 * engine Stage 1: `GET /cases/search`, one statement, no cases report) and, with the entry's
 * `scopeKey`, lists only the cases it can join — an entry joins only a case of its own scope.
 */
export const KbMoveToCaseDialog = ({
  entry,
  entryTitle,
  onClose,
  onConfirm,
}: {
  /** The entry being moved; null = closed. */
  entry: KbMoveEntry | null;
  entryTitle: string;
  onClose: () => void;
  onConfirm: (target: KbMoveTarget) => void;
}) => {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<KbMoveTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<KbMoveTarget | null>(null);
  const latest = useRef(0);
  const open = entry !== null;
  const scopeKey = entry?.scopeKey ?? undefined;
  const entryId = entry?.id ?? null;

  useEffect(() => {
    if (!open) return;
    const requestId = ++latest.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            const cases = await searchKbCases({
              search: query,
              scopeKey,
              limit: MOVE_SEARCH_LIMIT,
            });
            if (requestId !== latest.current) return;
            setFound(cases);
          } catch (err) {
            if (requestId !== latest.current) return;
            setFound(null);
            setError(
              getErrorStatus(err) === 403
                ? NOT_YOUR_SCOPE_TEXT
                : (getApiErrorMessage(err) ?? 'Could not search the cases.')
            );
          } finally {
            if (requestId === latest.current) setLoading(false);
          }
        })();
      },
      query ? SEARCH_DELAY_MS : 0
    );
    return () => clearTimeout(timer);
  }, [open, query, scopeKey, entryId]);

  const close = () => {
    latest.current += 1;
    setQuery('');
    setPicked(null);
    setFound(null);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {picked ? `Move into case ${kbRef(picked.publicId, picked.caseId)}?` : 'Move into a case'}
        </DialogTitle>
        <DialogClose onClose={close} />
      </DialogHeader>
      {picked ? (
        <>
          <DialogContent>
            <div className="space-y-2 text-sm">
              <p className="break-words">
                <span className="text-muted-foreground">Entry: </span>
                {entryTitle}
              </p>
              <p className="break-words">
                <span className="text-muted-foreground">Case question: </span>
                {picked.title}
              </p>
              <p className="text-muted-foreground">
                The case keeps its own answer; this entry is then served through it. To undo, open
                the entry and use Remove from case — the entry then comes back as Not live yet, for
                review: an approval it has now is not kept.
              </p>
            </div>
          </DialogContent>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button
              onClick={() => {
                const target = picked;
                close();
                onConfirm(target);
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </>
      ) : (
        <DialogContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {scopeKey
              ? 'Only the cases of this entry’s own mailbox or team are listed: it can join no other.'
              : 'Only a case of the entry’s own mailbox or team accepts it.'}
          </p>
          <Label htmlFor="move-case-search">Find a case</Label>
          <Input
            id="move-case-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Case number, or words of its question"
          />
          {error ? (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          ) : loading || found === null ? (
            <div className="flex justify-center py-4" role="status" aria-busy="true">
              <Spinner />
            </div>
          ) : found.length === 0 ? (
            <p className="py-4 text-sm text-center text-muted-foreground">
              {query.trim()
                ? `No case it can join matches “${query.trim()}”.`
                : 'No case it can join.'}
            </p>
          ) : (
            <ul className="overflow-auto mt-3 space-y-1 max-h-72" aria-label="Cases">
              {found.map((target) => (
                <li key={target.caseId}>
                  <Button
                    variant="ghost"
                    className="justify-start w-full h-auto text-left whitespace-normal"
                    onClick={() => setPicked(target)}
                  >
                    <span className="flex flex-col items-start w-full min-w-0 text-left">
                      <span className="font-medium">
                        Case {kbRef(target.publicId, target.caseId)}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {target.members === 1 ? '1 entry' : `${target.members} entries`}
                        </span>
                      </span>
                      <span className="w-full break-words text-muted-foreground">
                        {target.title}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!error && !loading && found !== null && found.length >= MOVE_SEARCH_LIMIT && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the first {MOVE_SEARCH_LIMIT} — narrow the search.
            </p>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
};
