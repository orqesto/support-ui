import type { ContactProfile } from '@/types/api';
import { LABEL } from '@/components/messages/messageDetailConstants';
import { customerSince, lifetimeLabel } from './contactFacts';

/**
 * v3 Customer tab: how long they have been a customer and how much of their history is still
 * open — the same rules as the contact drawer (contactFacts.ts). Rows render only when known.
 */
export function ContactFactRows({ contact }: { contact: ContactProfile }) {
  const since = customerSince(contact);
  const lifetime = lifetimeLabel(contact.stats);
  if (!since && !lifetime) return null;
  return (
    <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 mb-3">
      {since && (
        <>
          <span className={`self-center ${LABEL} text-muted-foreground`}>SINCE</span>
          <span className="text-[11px] truncate self-center">{sinceLabel(since)}</span>
        </>
      )}
      {lifetime && (
        <>
          <span className={`self-center ${LABEL} text-muted-foreground`}>LIFETIME</span>
          <span className="text-[11px] truncate self-center">{lifetime}</span>
        </>
      )}
    </div>
  );
}

/** "March 2024" (v3): the month a relationship began, not a clock time. */
const sinceLabel = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};
