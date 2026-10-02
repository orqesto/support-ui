import { MessageSquare, Users, LayoutDashboard } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import type { MessagesDisplayMode } from '@/types';

interface Props {
  displayMode: MessagesDisplayMode;
  onModeChange: (mode: MessagesDisplayMode) => void;
  /** `md` in the page header (Messages list v2); `sm` where it shares a 28px row. */
  size?: 'sm' | 'md';
  className?: string;
}

const SEGMENTS: Segment<MessagesDisplayMode>[] = [
  {
    value: 'threads',
    label: 'Threads',
    icon: MessageSquare,
    title: 'Thread view — grouped by reply chain',
  },
  {
    value: 'contacts',
    label: 'Contacts',
    icon: Users,
    title: 'Contacts view — grouped by sender with conversations by subject',
  },
  {
    value: 'kanban',
    label: 'Kanban',
    icon: LayoutDashboard,
    title: 'Kanban view — grouped by SLA and workflow status',
  },
];

/**
 * Threads / Contacts / Kanban.
 *
 * Messages list v2 (2026-10-02): it now sits in the page header beside the title and the
 * surface count — the view is the first thing the header says, the filters are below it.
 *
 * It used to be a row of its own — three ghost buttons plus `mb-2`, 40px — under the filter
 * card. Now it sits at the right end of the filter card's saved-views row, which was half
 * empty, and "which slice of the inbox am I looking at" is the same class of control as a
 * saved view. The 40px it gave back is lane height on the one screen where that is the
 * working area (Kanban space audit, 2026-09-07). The look is `SegmentedControl`, shared with
 * the Tickets switch.
 */
export function MessagesViewToggle({ displayMode, onModeChange, size, className }: Props) {
  const [, setSearchParams] = useSearchParams();

  const select = (mode: MessagesDisplayMode) => {
    onModeChange(mode);
    // The URL is the bookmarkable record of the view; `sender` belongs to the contacts view only.
    setSearchParams(
      (params) => {
        if (mode === 'threads') {
          params.delete('mode');
          params.delete('sender');
        } else {
          params.set('mode', mode);
          if (mode === 'kanban') params.delete('sender');
        }
        return params;
      },
      { replace: true }
    );
  };

  return (
    <SegmentedControl
      ariaLabel="View"
      value={displayMode}
      onChange={select}
      segments={SEGMENTS}
      size={size}
      className={className}
    />
  );
}
