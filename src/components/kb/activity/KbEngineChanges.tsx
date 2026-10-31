import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { apiErrorMessage } from '@/lib/apiError';
import { kbRef } from '@/lib/kbConsolidation';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { kbService, type KBEntry, type KbAutoChange } from '@/services/kb.service';
import { listEntryVersions } from '@/services/kbEngine.service';
import type { KbEntryText, KbEntryVersion } from '@/services/kbEngine.types';
import {
  AUTO_CHANGE_KIND_LABELS,
  AUTO_UNDO_LABEL,
  AUTO_UNDO_TITLE,
  UNDO_BLOCKED_TEXT,
  autoUndoOf,
  runAutoUndo,
  undoBlocked,
} from '../useKbAutoRestore';
import { formatPercent, formatWhen, preview } from '../autoActions/kbAutoFormat';
import { snapshotStateText } from './kbActivityCopy';

/** The latest engine changes shown in the panel; the rest are on Live answers › Changed by the engine. */
export const ENGINE_CHANGES_SHOWN = 10;
export const ALL_CHANGES_HREF = '/knowledge-base?view=live&status=auto_changed';

const ACTION_KEY: Record<KbAutoChange['action'], string> = {
  remove: 'auto:remove',
  hold: 'auto:hold',
  cleanPersonalData: 'auto:cleanPersonalData',
  approveMined: 'auto:approveMined',
  approveCaptures: 'auto:approveCaptures',
};

/** The one-line reason: how sure the engine was, when it has a score. */
const reasonLine = (change: KbAutoChange): string =>
  change.confidence !== null
    ? `Why: the engine was ${formatPercent(change.confidence)} sure`
    : 'Why: it met the rule of this automatic action';

const textOf = (text: KbEntryText | undefined): string | null =>
  text ? (text.answer ?? text.documentContent ?? text.content ?? null) : null;

/** The text in force at `index`: versions store text only when their write changed it. */
const textAt = (versions: KbEntryVersion[], index: number): string | null => {
  for (let at = index; at >= 0; at -= 1) {
    const found = textOf(versions[at].snapshot.text);
    if (found !== null) return found;
  }
  for (const version of versions) {
    const before = textOf(version.snapshot.textBefore);
    if (before !== null) return before;
  }
  return null;
};

type BeforeAfter = { before: string; after: string } | 'none' | { error: string };

/** Before / after of the engine's change, from the entry's versions. */
export const beforeAfterOf = (versions: KbEntryVersion[], action: KbAutoChange['action']) => {
  let engineAt = -1;
  versions.forEach((version, index) => {
    if (version.actorKind === 'engine' && version.reason === ACTION_KEY[action]) engineAt = index;
  });
  if (engineAt < 0) return 'none' as const;
  const engine = versions[engineAt];
  if (engine.snapshot.textRedacted) {
    return { before: 'Text removed (personal data)', after: 'Text removed (personal data)' };
  }
  const textChanged = engine.snapshot.text !== undefined && !engine.snapshot.textUnchanged;
  if (textChanged) {
    const before =
      textOf(engine.snapshot.textBefore) ?? (engineAt > 0 ? textAt(versions, engineAt - 1) : null);
    const after = textOf(engine.snapshot.text);
    if (before !== null && after !== null)
      return { before: preview(before, 300), after: preview(after, 300) };
  }
  const previous = engineAt > 0 ? versions[engineAt - 1].snapshot : null;
  if (!previous) return 'none' as const;
  return { before: snapshotStateText(previous), after: snapshotStateText(engine.snapshot) };
};

const ChangeRow = ({
  entry,
  busy,
  onUndo,
}: {
  entry: KBEntry;
  busy: boolean;
  onUndo: (entry: KBEntry) => void;
}) => {
  const change = entry.autoChange;
  const [shown, setShown] = useState<BeforeAfter | null>(null);
  const [loading, setLoading] = useState(false);
  if (!change) return null;
  const kind = autoUndoOf(entry);
  const blocked = undoBlocked(entry);

  const toggleBeforeAfter = async () => {
    if (shown) {
      setShown(null);
      return;
    }
    setLoading(true);
    try {
      setShown(beforeAfterOf(await listEntryVersions(entry.id), change.action));
    } catch (error) {
      logger.error('Failed to read the entry versions:', error);
      setShown({ error: apiErrorMessage(error, 'Could not read its history. Try again.') });
    } finally {
      setLoading(false);
    }
  };

  const undoButton = kind && (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy || blocked}
      title={blocked ? undefined : AUTO_UNDO_TITLE[kind]}
      aria-label={`${AUTO_UNDO_LABEL[kind]}: ${entry.title}`}
      onClick={() => onUndo(entry)}
    >
      <Undo2 className="mr-1 w-3 h-3" aria-hidden="true" />
      Undo
    </Button>
  );

  return (
    <li
      className="flex flex-wrap gap-x-3 gap-y-1 items-start text-sm"
      data-testid="kb-engine-change"
    >
      <span className="w-full shrink-0 text-muted-foreground sm:w-36">{formatWhen(change.at)}</span>
      <div className="flex-1 min-w-[12rem] space-y-1">
        <p className="break-words text-foreground">
          <span className="font-medium">Engine</span> ·{' '}
          {AUTO_CHANGE_KIND_LABELS[change.action].replace(/ by the engine/, '')}:{' '}
          <Link
            to={`/knowledge-base?view=live&status=auto_changed&id=${entry.id}`}
            className="underline-offset-2 hover:underline"
          >
            {kbRef(entry.publicId ?? null, entry.id)} {preview(entry.title ?? '', 90)}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">{reasonLine(change)}</p>
        <Button
          variant="ghost"
          size="sm"
          className="px-1 h-7 text-xs"
          onClick={() => void toggleBeforeAfter()}
          isLoading={loading}
          aria-expanded={shown !== null}
        >
          {shown ? 'Hide before / after' : 'Before / after'}
        </Button>
        {shown && typeof shown === 'object' && 'error' in shown && (
          <p className="text-xs text-destructive" data-testid="kb-before-after-error">
            {shown.error}
          </p>
        )}
        {shown === 'none' && (
          <p className="text-xs text-muted-foreground">
            No before / after: this change was made before the engine kept versions.
          </p>
        )}
        {shown && typeof shown === 'object' && 'before' in shown && (
          <dl className="grid gap-1 text-xs sm:grid-cols-2" data-testid="kb-engine-before-after">
            <div className="p-2 rounded border bg-muted/30">
              <dt className="font-medium text-muted-foreground">Before</dt>
              <dd className="whitespace-pre-wrap break-words">{shown.before}</dd>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <dt className="font-medium text-muted-foreground">After</dt>
              <dd className="whitespace-pre-wrap break-words">{shown.after}</dd>
            </div>
          </dl>
        )}
      </div>
      {undoButton &&
        (blocked ? (
          <Tooltip content={UNDO_BLOCKED_TEXT}>
            <span tabIndex={0} aria-label={UNDO_BLOCKED_TEXT}>
              {undoButton}
            </span>
          </Tooltip>
        ) : (
          undoButton
        ))}
    </li>
  );
};

/**
 * "Changed by the engine": the latest automatic changes (the KB list's `status=auto_changed`),
 * each with the actor "Engine", a one-line reason, before / after from the entry's versions (on
 * request), and Undo by the change's own undo kind. Read when shown, never on a page load.
 */
export const KbEngineChanges = ({ onUndone }: { onUndone?: () => void }) => {
  const [entries, setEntries] = useState<KBEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const inFlight = useRef(new Set<number>());
  const latest = useRef(0);

  const read = useCallback(async () => {
    const requestId = ++latest.current;
    setError(null);
    try {
      const response = await kbService.getAll({
        status: 'auto_changed',
        page: 1,
        limit: ENGINE_CHANGES_SHOWN,
      });
      if (requestId !== latest.current) return;
      if (response?.data?.filters?.autoChangedStatus !== true) {
        setEntries([]);
        setError('This server does not list the engine’s changes yet.');
        return;
      }
      setEntries(response.data.entries.filter((entry) => entry.autoChange));
      setTotal(response.data.pagination.total);
    } catch (err) {
      if (requestId !== latest.current) return;
      logger.error('Failed to read the engine changes:', err);
      setEntries([]);
      setError(apiErrorMessage(err, 'Could not read the engine’s changes.'));
    }
  }, []);

  useEffect(() => {
    void read();
    return () => {
      latest.current += 1;
    };
  }, [read]);

  const undo = (entry: KBEntry) => {
    const kind = autoUndoOf(entry);
    if (!kind || undoBlocked(entry) || inFlight.current.has(entry.id)) return;
    inFlight.current.add(entry.id);
    setPending(new Set(inFlight.current));
    runAutoUndo(entry, kind)
      .then(
        (done) => {
          toast.success(done);
          onUndone?.();
        },
        (err: unknown) => {
          toast.error(`Could not ${AUTO_UNDO_LABEL[kind].toLowerCase()}`, {
            description: apiErrorMessage(err, 'Please try again.'),
          });
        }
      )
      .finally(() => {
        inFlight.current.delete(entry.id);
        setPending(new Set(inFlight.current));
        void read();
      });
  };

  return (
    <section className="space-y-2" aria-label="Changed by the engine">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <h3 className="text-sm font-semibold text-foreground">Changed by the engine</h3>
        {total > ENGINE_CHANGES_SHOWN && (
          <Link to={ALL_CHANGES_HREF} className="text-xs font-medium underline">
            All {total} changes
          </Link>
        )}
      </div>
      {error && (
        <Alert variant="warning" className="py-2 text-sm">
          {error}
        </Alert>
      )}
      {entries === null ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        !error && (
          <p className="text-sm text-muted-foreground">
            The engine has changed nothing in the last 90 days.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <ChangeRow key={entry.id} entry={entry} busy={pending.has(entry.id)} onUndo={undo} />
          ))}
        </ul>
      )}
    </section>
  );
};
