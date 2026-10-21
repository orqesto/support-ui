import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { KBEntry } from '@/services/kb.service';
import {
  AUTO_UNDO_LABEL,
  AUTO_UNDO_TITLE,
  autoUndoOf,
  type KbAutoRestore,
} from './useKbAutoRestore';

/**
 * The undo of a change the system made by itself ("Changed automatically"): Restore / Undo
 * clean-up / Use it again / Un-approve, by the row's own `autoChange.undo`. Nothing without one.
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
