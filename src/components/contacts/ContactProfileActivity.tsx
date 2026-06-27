import { Mail, StickyNote, Ticket } from 'lucide-react';
import { formatAge } from '@/lib/utils';

export type ActivityItem = {
  key: string;
  kind: 'message' | 'ticket' | 'note';
  at: string;
  title: string;
  meta: string;
  status?: string;
  onClick?: () => void;
};

const STATUS_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  open: { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-300', label: 'Open' },
  in_progress: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-300', label: 'In progress' },
  awaiting_response: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-300', label: 'Awaiting' },
  client_replied: { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-300', label: 'Replied' },
  resolved: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-300', label: 'Resolved' },
  closed: { dot: 'bg-muted-foreground', text: 'text-muted-foreground', label: 'Closed' },
};

const RING = {
  message: 'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300',
  ticket: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
  note: 'bg-muted text-muted-foreground',
};

const KIND_ICON = { message: Mail, ticket: Ticket, note: StickyNote };

/** Unified, reverse-chronological feed of messages + tickets + notes for a contact. */
export function ContactProfileActivity({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return <p className="py-8 text-sm text-center text-muted-foreground">No activity yet.</p>;
  }
  return (
    <div>
      {activity.map((item, idx) => {
        const Icon = KIND_ICON[item.kind];
        // Fall back to a neutral pill (humanized status) for statuses not in the
        // map (e.g. new / spam / suspicious) so the row never silently drops it.
        const style = item.status
          ? (STATUS_STYLE[item.status] ?? {
              dot: 'bg-muted-foreground',
              text: 'text-muted-foreground',
              label: item.status.replace(/_/g, ' '),
            })
          : null;
        const last = idx === activity.length - 1;
        return (
          <div key={item.key} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <span className={`grid place-items-center w-7 h-7 rounded-full ${RING[item.kind]}`}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              {!last && <span className="w-px flex-1 my-1 bg-border" />}
            </div>
            <div className="flex-1 min-w-0 pb-5">
              <div className="flex gap-2 justify-between items-start">
                <button
                  type="button"
                  onClick={item.onClick}
                  disabled={!item.onClick}
                  className={`text-[12.5px] font-medium leading-snug text-left text-foreground ${
                    item.onClick ? 'hover:text-primary' : 'cursor-default'
                  }`}
                >
                  {item.title}
                </button>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums flex-shrink-0 mt-0.5">
                  {formatAge(item.at)}
                </span>
              </div>
              <div className="flex gap-2 items-center mt-1.5">
                <span className="text-[11px] font-mono truncate text-muted-foreground">{item.meta}</span>
                {style && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-medium flex-shrink-0 ${style.text}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
