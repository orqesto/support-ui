import { LayoutList, Columns } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type DisplayMode = 'list' | 'kanban';

interface Props {
  displayMode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export function TicketsViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const btnClass = 'flex items-center gap-1.5 px-3 py-1.5 h-auto rounded text-sm';

  return (
    <div className="flex gap-1 items-center">
      <Button
        type="button"
        variant={displayMode === 'list' ? 'primary' : 'ghost'}
        onClick={() => {
          onModeChange('list');
          setSearchParams((params) => { params.delete('mode'); return params; }, { replace: true });
        }}
        className={btnClass}
      >
        <LayoutList className="w-3.5 h-3.5" />List
      </Button>
      <Button
        type="button"
        variant={displayMode === 'kanban' ? 'primary' : 'ghost'}
        onClick={() => {
          onModeChange('kanban');
          setSearchParams((params) => { params.set('mode', 'kanban'); return params; }, { replace: true });
        }}
        className={btnClass}
      >
        <Columns className="w-3.5 h-3.5" />Kanban
      </Button>
    </div>
  );
}
