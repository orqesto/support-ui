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
import { getApiErrorMessage } from '@/lib/errorMessages';
import { kbRef } from '@/lib/kbConsolidation';
import { kbConsolidationService, type KbWorkRow } from '@/services/kbConsolidation.service';

/** A live case an entry can be moved into. */
export type KbMoveTarget = {
  caseId: number;
  casePublicId: string | null;
  question: string | null;
  standardAnswer: string | null;
};

/** One search reads at most this many TOPICS (report headers); each holds one or more cases. */
export const MOVE_SEARCH_PAGE = 100;
const SEARCH_DELAY_MS = 300;
const EXCERPT = 200;

/** Leading zeros mean nothing: "0900" is 900, "KB-0900" is KB-900 (as the server reads them). */
const withoutLeadingZeros = (text: string): string => text.replace(/^((?:[a-z]+-)?)0+(?=\d)/, '$1');

/**
 * Does the search name THIS case by its number? The server's rule, mirrored exactly (it already
 * filtered TOPICS by it; this only tells which case of a returned topic was meant): the search is
 * trimmed and lower-cased, a leading '#' dropped, leading zeros ignored; it equals the case's
 * public number with or without its prefix ("kb-900" or "900"); the internal id counts only for
 * a case WITHOUT a public number (the only time the page shows "#<id>"). Never a substring.
 */
export const isCaseNumber = (
  search: string,
  caseId: number,
  casePublicId: string | null
): boolean => {
  const number = withoutLeadingZeros(search.trim().toLowerCase().replace(/^#/, ''));
  if (!number) return false;
  const publicId = withoutLeadingZeros((casePublicId ?? '').toLowerCase());
  return (
    (publicId !== '' && (publicId === number || publicId.replace(/^[a-z]+-/, '') === number)) ||
    (casePublicId === null && /^\d+$/.test(number) && caseId === Number(number))
  );
};

const excerpt = (text: string | null): string | null => {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed.length > EXCERPT ? `${trimmed.slice(0, EXCERPT).trimEnd()}…` : trimmed;
};

type Found = {
  targets: KbMoveTarget[];
  /** More TOPICS match than one search reads (the server pages topics, not cases). */
  more: boolean;
  /** Cases left out for serving another mailbox or department (null: could not be told). */
  otherScope: number | null;
};

/**
 * Pick the live case to move an entry into, then confirm. The cases are SEARCHED on the server
 * across every page of the report (in the departments the page shows), and only those of the
 * entry's own scope are offered — the server refuses any other (`other_scope`).
 */
export const KbMoveToCaseDialog = ({
  entry,
  entryTitle,
  departmentIds,
  onClose,
  onConfirm,
}: {
  /** The entry being moved; null = closed. */
  entry: KbWorkRow | null;
  entryTitle: string;
  departmentIds: number[];
  onClose: () => void;
  onConfirm: (target: KbMoveTarget) => void;
}) => {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<KbMoveTarget | null>(null);
  // Does the backend search case numbers? Known from what it sends (see below); until then the
  // field does not promise it.
  const [searchesNumbers, setSearchesNumbers] = useState(false);
  const latest = useRef(0);
  const open = entry !== null;
  const departmentsKey = departmentIds.join(',');
  const scopeKey = entry?.scopeKey;
  // Does the server say the entry's scope? (An older backend does not: then every case is offered.)
  const knowsScope = typeof scopeKey === 'string';
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
            const report = await kbConsolidationService.getCases({
              departmentIds: departmentsKey ? departmentsKey.split(',').map(Number) : [],
              search: query,
              page: 1,
              pageSize: MOVE_SEARCH_PAGE,
            });
            // The server matches and pages TOPICS (headers): a topic matches by its label or by any
            // of its cases (question, and on a newer backend the case number), and then brings ALL
            // its cases. Only a case that matches itself — or whose topic label matches — is a
            // candidate, so a sibling case is neither offered nor counted.
            const needle = query.trim().toLowerCase();
            const hit = (text: string | null | undefined) =>
              (text ?? '').toLowerCase().includes(needle);
            // Same scope only (the server refuses any other: `other_scope`). Report case rows carry
            // the same `scopeKey` as the entry's row; a backend that does not say the entry's
            // scope leaves the list as it is.
            const scoped = knowsScope;
            const seen = new Map<number, KbMoveTarget>();
            const excluded = new Set<number>();
            let numbers = false;
            for (const header of report.headers)
              for (const row of header.rows) {
                if (row.kind !== 'case' || row.caseId === null) continue;
                // Case rows that count their live members come from the backend that also
                // matches case numbers (the same change).
                if (Number.isInteger(row.memberCount)) numbers = true;
                const matches =
                  !needle ||
                  hit(header.label) ||
                  [row.question, ...(row.questions ?? [])].some(hit) ||
                  isCaseNumber(needle, row.caseId, row.casePublicId);
                if (!matches || seen.has(row.caseId)) continue;
                if (scoped && row.scopeKey !== scopeKey) {
                  excluded.add(row.caseId);
                  continue;
                }
                seen.set(row.caseId, {
                  caseId: row.caseId,
                  casePublicId: row.casePublicId,
                  question: row.question ?? null,
                  standardAnswer: row.standardAnswer ?? null,
                });
              }
            if (requestId === latest.current && numbers) setSearchesNumbers(true);
            const otherScope = excluded.size;
            const targets = [...seen.values()];
            if (requestId !== latest.current) return;
            setFound({
              targets,
              more: report.pagination.totalPages > 1,
              otherScope: scoped ? otherScope : null,
            });
          } catch (err) {
            if (requestId !== latest.current) return;
            setFound(null);
            setError(getApiErrorMessage(err) ?? 'Could not search the cases.');
          } finally {
            if (requestId === latest.current) setLoading(false);
          }
        })();
      },
      query ? SEARCH_DELAY_MS : 0
    );
    return () => clearTimeout(timer);
  }, [open, query, departmentsKey, scopeKey, knowsScope, entryId]);

  const close = () => {
    latest.current += 1;
    setQuery('');
    setPicked(null);
    setFound(null);
    setLoading(false);
    onClose();
  };

  const answer = picked ? excerpt(picked.standardAnswer) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {picked
            ? `Move into case ${kbRef(picked.casePublicId, picked.caseId)}?`
            : 'Move into a case'}
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
              {picked.question && (
                <p className="break-words">
                  <span className="text-muted-foreground">Case question: </span>
                  {picked.question}
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">
                <span className="text-muted-foreground">Case answer: </span>
                {answer ?? '—'}
              </p>
              <p className="text-muted-foreground">
                The case keeps its own answer; this entry is then served through it. To undo, open
                the case and use Remove from case — the entry then comes back as Pending, for
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
            {knowsScope
              ? 'Cases of this entry’s own mailbox or department, in the departments shown.'
              : 'Cases in the departments shown. Only a case of the entry’s own mailbox or department accepts it.'}
          </p>
          <Label htmlFor="move-case-search">Find a case</Label>
          <Input
            id="move-case-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              searchesNumbers
                ? 'Exact case number, or words of a question or topic'
                : 'Words of a question or topic'
            }
          />
          {error ? (
            <Alert variant="danger" className="mt-3">
              {error}
            </Alert>
          ) : loading || found === null ? (
            <div className="flex justify-center py-4" role="status" aria-busy="true">
              <Spinner />
            </div>
          ) : found.targets.length === 0 ? (
            <p className="py-4 text-sm text-center text-muted-foreground">
              {query.trim()
                ? `No case ${knowsScope ? "of this entry's scope " : ''}matches “${query.trim()}”.`
                : `No case ${knowsScope ? 'of this entry’s scope ' : ''}to move it into.`}
            </p>
          ) : (
            <ul className="overflow-auto mt-3 space-y-1 max-h-72" aria-label="Cases">
              {found.targets.map((target) => (
                <li key={target.caseId}>
                  <Button
                    variant="ghost"
                    className="justify-start w-full h-auto text-left whitespace-normal"
                    onClick={() => setPicked(target)}
                  >
                    <span className="font-medium">
                      Case {kbRef(target.casePublicId, target.caseId)}
                    </span>
                    {target.question && (
                      <span className="ml-2 text-muted-foreground">{target.question}</span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!error && !loading && found !== null && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {found.otherScope !== null && found.otherScope > 0 && (
                <p>
                  {found.otherScope === 1
                    ? '1 matching case serves another mailbox or department and is not offered.'
                    : `${found.otherScope} matching cases serve another mailbox or department and are not offered.`}
                </p>
              )}
              {found.more && (
                <p>Only the first {MOVE_SEARCH_PAGE} topics are searched — narrow the search.</p>
              )}
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
};
