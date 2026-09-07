import { MessageSquare, Users, LayoutDashboard } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type DisplayMode = 'threads' | 'contacts' | 'kanban';

interface Props {
  displayMode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

/**
 * Threads / Contacts / Kanban as one segmented track.
 *
 * It used to be a row of its own — three ghost buttons plus `mb-2`, 40px — under the filter
 * card. Now it sits at the right end of the filter card's saved-views row, which was half
 * empty, and "which slice of the inbox am I looking at" is the same class of control as a
 * saved view. The track is 30px tall so it fits the 28px pill row without growing it by more
 * than 2px. The 40px it gave back is lane height on the one screen where that is the working
 * area (Kanban space audit, 2026-09-07).
 */
export function MessagesViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const handleThreads = () => {
    onModeChange('threads');
    setSearchParams(
      (params) => {
        params.delete('mode');
        params.delete('sender');
        return params;
      },
      { replace: true }
    );
  };

  const handleContacts = () => {
    onModeChange('contacts');
    setSearchParams(
      (params) => {
        params.set('mode', 'contacts');
        return params;
      },
      { replace: true }
    );
  };

  const handleKanban = () => {
    onModeChange('kanban');
    setSearchParams(
      (params) => {
        params.set('mode', 'kanban');
        params.delete('sender');
        return params;
      },
      { replace: true }
    );
  };

  const segment = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[5px] text-[12px] transition-colors ${
      active
        ? 'bg-card text-foreground font-semibold shadow-sm ring-1 ring-border'
        : 'text-muted-foreground font-medium hover:text-foreground'
    }`;

  return (
    <div
      role="group"
      aria-label="View"
      className="flex gap-0.5 p-0.5 rounded-md bg-background border border-border/70"
    >
      <button
        type="button"
        aria-pressed={displayMode === 'threads'}
        onClick={handleThreads}
        className={segment(displayMode === 'threads')}
        title="Thread view — grouped by reply chain"
      >
        <MessageSquare className="w-3 h-3" />
        Threads
      </button>
      <button
        type="button"
        aria-pressed={displayMode === 'contacts'}
        onClick={handleContacts}
        className={segment(displayMode === 'contacts')}
        title="Contacts view — grouped by sender with conversations by subject"
      >
        <Users className="w-3 h-3" />
        Contacts
      </button>
      <button
        type="button"
        aria-pressed={displayMode === 'kanban'}
        onClick={handleKanban}
        className={segment(displayMode === 'kanban')}
        title="Kanban view — grouped by SLA and workflow status"
      >
        <LayoutDashboard className="w-3 h-3" />
        Kanban
      </button>
    </div>
  );
}
