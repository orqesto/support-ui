/**
 * The small presence badge on an inbox row or kanban card (spec §5.3): an eye, or a pen while
 * someone else writes a reply, with up to two initials and "+n". Away-only viewers show greyed.
 * Presence unavailable, or nobody else there ⇒ nothing (never "0").
 *
 * The row subscribes to its own conversation only. The member list is not fetched to draw a row:
 * initials come from what is already cached (a count when a name is not known yet), and the
 * hover tooltip, which mounts only while open, is what asks for it.
 */
import { memo, useMemo } from 'react';
import { Eye, PenLine } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';
import { PRESENCE_STATE_RANK } from './presence.types';
import { agentCountLabel, STATE_COPY } from './PresenceEye';
import { NO_VIEWERS, usePresenceSummaryStore, type SummaryUser } from './presenceSummaryStore';
import { useOrgMemberNames } from './useOrgMemberNames';

const MAX_INITIALS = 2;

const byStrength = (left: SummaryUser, right: SummaryUser): number =>
  PRESENCE_STATE_RANK[right.state] - PRESENCE_STATE_RANK[left.state] || left.userId - right.userId;

function Names({ others }: { others: SummaryUser[] }) {
  const agentOf = useOrgMemberNames(); // mounted only while the tooltip is open
  return (
    <span className="flex flex-col gap-0.5 text-left">
      {others.map((user) => (
        <span key={user.userId} className={user.state === 'away' ? 'opacity-60' : ''}>
          <span className="font-medium">{agentOf(user.userId).name}</span>
          {' · '}
          <span>{STATE_COPY[user.state]}</span>
        </span>
      ))}
    </span>
  );
}

function Badge({ others }: { others: SummaryUser[] }) {
  const agentOf = useOrgMemberNames({ fetch: false });
  const writing = others.some((user) => user.state === 'writing_reply');
  const awayOnly = others.every((user) => user.state === 'away');
  const shown = others.slice(0, MAX_INITIALS).map((user) => agentOf(user.userId));
  const named = shown.every((agent) => agent.known);
  const more = others.length - MAX_INITIALS;
  const Icon = writing ? PenLine : Eye;
  return (
    <Tooltip content={<Names others={others} />} size="sm">
      <span
        data-testid="row-presence"
        data-variant={writing ? 'writing' : awayOnly ? 'away' : 'viewing'}
        role="img"
        aria-label={agentCountLabel(others.length)}
        onPointerDown={(event) => event.stopPropagation()}
        className={`inline-flex items-center gap-1 h-[22px] px-1.5 rounded-full text-[10px] font-semibold shrink-0 ${
          writing
            ? 'text-warning bg-warning-muted'
            : awayOnly
              ? 'text-muted-foreground/60 bg-muted/50 grayscale'
              : 'text-muted-foreground bg-muted'
        }`}
      >
        <Icon className="w-3 h-3" aria-hidden />
        {named ? (
          <>
            <span aria-hidden>{shown.map((agent) => agent.initials).join(' ')}</span>
            {more > 0 && <span aria-hidden>+{more}</span>}
          </>
        ) : (
          <span aria-hidden className="tabular-nums">
            {others.length}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

const RowPresenceView = ({ conversationId }: { conversationId: number }) => {
  const myId = useAuthStore((store) => store.user?.id);
  // One conversation's entry: the same array while it is unchanged, a shared empty list otherwise.
  const entry = usePresenceSummaryStore((store) =>
    store.available ? (store.byConversation[conversationId] ?? NO_VIEWERS) : NO_VIEWERS
  );
  const others = useMemo(
    () => entry.filter((user) => user.userId !== myId).sort(byStrength),
    [entry, myId]
  );
  if (others.length === 0) return null;
  return <Badge others={others} />;
};

export const RowPresence = memo(RowPresenceView);
