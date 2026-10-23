import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * "3 new messages — show": what arrived while the list was open waits here instead of moving the
 * rows under the agent's cursor. One bar for Tickets and Threads; nothing renders at 0.
 */
export const NewItemsBar = ({
  count,
  noun,
  onShow,
}: {
  count: number;
  /** Singular and plural: ['ticket', 'tickets']. */
  noun: [string, string];
  onShow: () => void;
}) =>
  count > 0 ? (
    <div className="flex justify-center">
      <Button size="sm" className="rounded-full shadow-lg" onClick={onShow}>
        <ArrowUp className="mr-1.5 w-3.5 h-3.5" />
        {count} new {count === 1 ? noun[0] : noun[1]} — show
      </Button>
    </div>
  ) : null;
