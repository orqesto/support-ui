import { MessageSquare, Users, LayoutDashboard } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type DisplayMode = 'threads' | 'contacts' | 'kanban';

interface Props {
  displayMode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export function MessagesViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const handleThreads = () => {
    onModeChange('threads');
    setSearchParams((params) => { params.delete('mode'); params.delete('sender'); return params; }, { replace: true });
  };

  const handleContacts = () => {
    onModeChange('contacts');
    setSearchParams((params) => { params.set('mode', 'contacts'); return params; }, { replace: true });
  };

  const handleKanban = () => {
    onModeChange('kanban');
    setSearchParams((params) => { params.set('mode', 'kanban'); params.delete('sender'); return params; }, { replace: true });
  };

  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="flex gap-1 items-center mb-2">
      <Button type="button" variant="ghost" onClick={handleThreads} className={`${btnClass(displayMode === 'threads')} h-auto`} title="Thread view — grouped by reply chain">
        <MessageSquare className="w-3.5 h-3.5" />Threads
      </Button>
      <Button type="button" variant="ghost" onClick={handleContacts} className={`${btnClass(displayMode === 'contacts')} h-auto`} title="Contacts view — grouped by sender with conversations by subject">
        <Users className="w-3.5 h-3.5" />Contacts
      </Button>
      <Button type="button" variant="ghost" onClick={handleKanban} className={`${btnClass(displayMode === 'kanban')} h-auto`} title="Kanban view — grouped by SLA and workflow status">
        <LayoutDashboard className="w-3.5 h-3.5" />Kanban
      </Button>
    </div>
  );
}
