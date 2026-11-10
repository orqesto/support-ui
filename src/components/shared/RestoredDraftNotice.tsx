import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * One line over an editor whose text came back from this browser (useUnsentDraft): says why there
 * is text the agent did not just type, and offers to throw it away. Files are never kept — when the
 * draft had some, it says to attach them again, so nothing goes out without them unnoticed.
 */
export function RestoredDraftNotice({
  onDiscard,
  label = 'Restored your unsent text',
  fileCount = 0,
}: {
  onDiscard: () => void;
  label?: string;
  fileCount?: number;
}) {
  return (
    <div
      data-testid="restored-draft-notice"
      className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
      {fileCount > 0 && (
        <span className="text-warning">
          — attach your {fileCount === 1 ? 'file' : `${fileCount} files`} again
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={onDiscard}
      >
        Discard
      </Button>
    </div>
  );
}
