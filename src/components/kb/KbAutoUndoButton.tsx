import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { KBEntry } from '@/services/kb.service';
import {
  AUTO_CHANGE_KIND_LABELS,
  AUTO_UNDO_LABEL,
  AUTO_UNDO_TITLE,
  UNDO_BLOCKED_TEXT,
  autoUndoOf,
  undoBlocked,
  type KbAutoRestore,
} from './useKbAutoRestore';

/**
 * The undo of a change the system made by itself ("Changed automatically"): Restore / Undo
 * clean-up / Use it again / Send back to Not live yet, by the row's own `autoChange.undo` (by version when the change
 * has one: `runAutoUndo`). Disabled, with the reason, when someone changed the entry after the engine.
 * Nothing without an undo.
 */
export const KbAutoUndoButton = ({
  entry,
  autoRestore,
  className,
}: {
  entry: KBEntry;
  autoRestore?: KbAutoRestore;
  className?: string;
}) => {
  const kind = autoRestore ? autoUndoOf(entry) : null;
  if (!autoRestore || !kind) return null;
  if (undoBlocked(entry))
    return (
      <Tooltip content={UNDO_BLOCKED_TEXT}>
        <span tabIndex={0} aria-label={UNDO_BLOCKED_TEXT}>
          <Button size="sm" variant="outline" className={className} disabled>
            <RotateCcw className="mr-1 w-4 h-4" aria-hidden="true" />
            {AUTO_UNDO_LABEL[kind]}
          </Button>
        </span>
      </Tooltip>
    );
  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      title={AUTO_UNDO_TITLE[kind]}
      disabled={autoRestore.pending.has(entry.id)}
      onClick={() => autoRestore.undo(entry)}
    >
      <RotateCcw className="mr-1 w-4 h-4" aria-hidden="true" />
      {AUTO_UNDO_LABEL[kind]}
    </Button>
  );
};

/** Which automatic change a "Changed automatically" row is. Nothing on any other list. */
export const KbAutoChangeKind = ({
  entry,
  autoRestore,
}: {
  entry: KBEntry;
  autoRestore?: KbAutoRestore;
}) => {
  if (!autoRestore || !entry.autoChange) return null;
  return (
    <Badge variant="secondary" className="shrink-0">
      {AUTO_CHANGE_KIND_LABELS[entry.autoChange.action]}
    </Badge>
  );
};
