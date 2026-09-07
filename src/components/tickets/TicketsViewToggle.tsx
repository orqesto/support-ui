import { LayoutList, Columns } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import type { TicketsDisplayMode } from '@/types';

interface Props {
  displayMode: TicketsDisplayMode;
  onModeChange: (mode: TicketsDisplayMode) => void;
}

const SEGMENTS: Segment<TicketsDisplayMode>[] = [
  { value: 'list', label: 'List', icon: LayoutList },
  { value: 'kanban', label: 'Kanban', icon: Columns },
];

/** List / Kanban — the same `SegmentedControl` the Messages switch uses, so the two inboxes match. */
export function TicketsViewToggle({ displayMode, onModeChange }: Props) {
  const [, setSearchParams] = useSearchParams();

  const select = (mode: TicketsDisplayMode) => {
    onModeChange(mode);
    setSearchParams(
      (params) => {
        if (mode === 'list') params.delete('mode');
        else params.set('mode', mode);
        return params;
      },
      { replace: true }
    );
  };

  return (
    <SegmentedControl ariaLabel="View" value={displayMode} onChange={select} segments={SEGMENTS} />
  );
}
