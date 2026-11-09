import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * One line over an editor whose text came back from this browser (useUnsentDraft): says why there
 * is text the agent did not just type, and offers to throw it away.
 */
export function RestoredDraftNotice({
  onDiscard,
  label = 'Restored your unsent text',
}: {
  onDiscard: () => void;
  label?: string;
}) {
  return (
    <div
      data-testid="restored-draft-notice"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
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
