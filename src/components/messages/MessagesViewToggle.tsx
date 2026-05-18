import { MessageSquare, Users, LayoutDashboard } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type DisplayMode = 'threads' | 'contacts' | 'kanban';

interface Props {
  displayMode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export function MessagesViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const handleThreads = () => {
    onModeChange('threads');
    setSearchParams((p) => { p.delete('mode'); p.delete('sender'); return p; }, { replace: true });
  };

  const handleContacts = () => {
    onModeChange('contacts');
    setSearchParams((p) => { p.set('mode', 'contacts'); return p; }, { replace: true });
  };

  const handleKanban = () => {
    onModeChange('kanban');
    setSearchParams((p) => { p.set('mode', 'kanban'); p.delete('sender'); return p; }, { replace: true });
  };

  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="flex gap-1 items-center mb-2">
      <button type="button" onClick={handleThreads} className={btnClass(displayMode === 'threads')} title="Thread view — grouped by reply chain">
        <MessageSquare className="w-3.5 h-3.5" />Threads
      </button>
      <button type="button" onClick={handleContacts} className={btnClass(displayMode === 'contacts')} title="Contacts view — grouped by sender with conversations by subject">
        <Users className="w-3.5 h-3.5" />Contacts
      </button>
      <button type="button" onClick={handleKanban} className={btnClass(displayMode === 'kanban')} title="Kanban view — grouped by SLA and workflow status">
        <LayoutDashboard className="w-3.5 h-3.5" />Kanban
      </button>
    </div>
  );
}
