import { LayoutList, Columns } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type DisplayMode = 'list' | 'kanban';

interface Props {
  displayMode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export function TicketsViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="flex gap-1 items-center">
      <button
        type="button"
        onClick={() => {
          onModeChange('list');
          setSearchParams((params) => { params.delete('mode'); return params; }, { replace: true });
        }}
        className={btnClass(displayMode === 'list')}
      >
        <LayoutList className="w-3.5 h-3.5" />List
      </button>
      <button
        type="button"
        onClick={() => {
          onModeChange('kanban');
          setSearchParams((params) => { params.set('mode', 'kanban'); return params; }, { replace: true });
        }}
        className={btnClass(displayMode === 'kanban')}
      >
        <Columns className="w-3.5 h-3.5" />Kanban
      </button>
    </div>
  );
}
