import type { ReactNode } from 'react';
import {
  GitBranch,
  Hash,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useTicketDisplayId } from './TicketRef';
import { Tooltip } from '@/components/ui/Tooltip';
import { Card } from '@/components/ui/Card';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import type { Ticket } from '@/types';

/* Pieces of the ticket page's sidebar and chrome (Tickets v3), kept out of TicketDetail. */

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

/** "20 Oct, 14:30" — the sidebar's dates. */
export const shortStamp = (date: string) => {
  const when = new Date(date);
  return `${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${when
    .toTimeString()
    .slice(0, 5)}`;
};

/** A labelled value in the sidebar's two-column grid; `full` spans both columns. */
export const field = (label: string, value: ReactNode, full = false) => (
  <div className={`grid gap-1 min-w-0 ${full ? 'col-span-2' : ''}`}>
    <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
    <div className="flex items-center gap-[7px] min-h-8 min-w-0 text-[13px] font-medium">
      {value}
    </div>
  </div>
);

export const sectionTitle = (text: string) => (
  <h4 className="m-0 font-display text-[10.5px] font-semibold tracking-[0.09em] uppercase text-muted-foreground">
    {text}
  </h4>
);

/** Managed in Jira (and where), or not yet with a way to push it. */
export const JiraSection = ({
  ticket,
  onPushToJira,
  isPushingToJira,
}: {
  ticket: Ticket;
  onPushToJira?: () => void;
  isPushingToJira?: boolean;
}) => (
  <section className="grid gap-3 px-[18px] py-4">
    {sectionTitle('Jira')}
    <Card
      variant="ghost"
      padding="none"
      className="flex gap-[9px] items-center px-3 py-2.5 rounded-[9px] bg-muted text-[12.5px] leading-[1.45] text-muted-foreground"
    >
      {ticket.externalId ? (
        <>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>
            <b className="text-foreground">Managed in Jira</b> as{' '}
            {ticket.externalUrl ? (
              <ExternalLink href={ticket.externalUrl}>{ticket.externalId}</ExternalLink>
            ) : (
              ticket.externalId
            )}
            . Title, status, priority and category change there and sync here.
          </span>
        </>
      ) : (
        <>
          <Send className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Not in Jira.</span>
          {onPushToJira && (
            <Button size="sm" variant="outline" onClick={onPushToJira} isLoading={isPushingToJira}>
              Push to Jira
            </Button>
          )}
        </>
      )}
    </Card>
  </section>
);

/** The ticket's ⋯ menu in the sheet / full-page bar. An action without a handler is not offered. */
export const TicketMoreMenu = ({
  linkCopied,
  onCopyLink,
  copyIdOf,
  onMove,
  onPushToJira,
  onDelete,
}: {
  linkCopied: boolean;
  onCopyLink: () => void;
  /** The ticket whose shown id "Copy ID" copies (`ACME-SUP-T-42`); absent: no item. */
  copyIdOf?: { id: number; reference?: string | null };
  onMove?: () => void;
  onPushToJira?: () => void;
  onDelete?: () => void;
}) => (
  <Menu
    ariaLabel="More actions"
    align="end"
    width={250}
    trigger={({ open, toggle }) => (
      <Tooltip content={open ? null : 'More actions'} size="sm">
        <Button
          variant="ghost"
          size="sm"
          aria-label="More actions"
          aria-expanded={open}
          onClick={toggle}
          className="p-0 w-8 h-8"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </Tooltip>
    )}
  >
    <MenuItem icon={<LinkIcon className="w-3.5 h-3.5" />} onSelect={onCopyLink}>
      {linkCopied ? 'Link copied' : 'Copy link'}
    </MenuItem>
    {copyIdOf && <CopyTicketIdItem ticket={copyIdOf} />}
    {onMove && (
      <MenuItem icon={<GitBranch className="w-3.5 h-3.5" />} onSelect={onMove}>
        Move team…
      </MenuItem>
    )}
    {onPushToJira && (
      <MenuItem icon={<Send className="w-3.5 h-3.5" />} onSelect={onPushToJira}>
        Push to Jira
      </MenuItem>
    )}
    {onDelete && (
      <>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 className="w-3.5 h-3.5" />} onSelect={onDelete}>
          Delete ticket…
        </MenuItem>
      </>
    )}
  </Menu>
);

/** "Copy ID" — the shown id, with the workspace code (read only when the ticket has a number). */
const CopyTicketIdItem = ({ ticket }: { ticket: { id: number; reference?: string | null } }) => {
  const shownId = useTicketDisplayId(ticket);
  return (
    <MenuItem
      icon={<Hash className="w-3.5 h-3.5" />}
      onSelect={() => {
        navigator.clipboard
          .writeText(shownId)
          .then(() => toast.success(`Copied ${shownId}`))
          // The browser refused the clipboard (no backend involved): log it, as Copy link does.
          .catch((err: unknown) => logger.error('Failed to copy the ticket ID:', err));
      }}
    >
      Copy ID
    </MenuItem>
  );
};
