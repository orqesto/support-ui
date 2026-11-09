/**
 * The eye in a thread or ticket header (spec §5.3): how many OTHER agents are on it, warning-coloured
 * while one writes a reply; press for who and what they do. Popover on desktop, bottom sheet on a
 * phone. Unavailable presence renders nothing — never "0". When the server capped a ticket's watch
 * the eye shows only the cap note, with no count.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { MOBILE_SCRIM, MOBILE_SHEET } from '../components/relatedStyles';
import { ICON_BTN, PHONE_ICON_BTN } from '../components/messageDetailHeader/headerStyles';
import { PRESENCE_STATE_RANK, type PresenceState, type PresenceViewer } from './presence.types';
import { useOrgMemberNames, type PresenceAgent } from './useOrgMemberNames';

export interface PresenceEyeProps {
  viewers: PresenceViewer[];
  available: boolean;
  isPhone: boolean;
  /** The server refused the watch for its cap (usePresenceWatch `capped`). */
  capped?: boolean;
  /** "presence for the latest 50 of N threads" — shown in the list, or alone when capped. */
  capNote?: string;
}

export const STATE_COPY: Record<PresenceState, string> = {
  writing_reply: 'writing a reply…',
  writing_note: 'writing a note',
  viewing: 'viewing',
  away: 'away',
};

const POPOVER_WIDTH = 260;

/** "since 3 min"; under a minute it is "just now". */
export const sinceCopy = (since: string, now: number): string => {
  const minutes = Math.floor((now - Date.parse(since)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `since ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `since ${hours} h`;
};

export const agentCountLabel = (count: number): string =>
  `${count} other ${count === 1 ? 'agent' : 'agents'} in this thread`;

function ViewerList({ viewers, capNote }: { viewers: PresenceViewer[]; capNote?: string }) {
  const agentOf = useOrgMemberNames();
  const now = Date.now();
  const rows = viewers
    .map((viewer) => ({ viewer, agent: agentOf(viewer.userId) }))
    .sort(
      (left, right) =>
        PRESENCE_STATE_RANK[right.viewer.state] - PRESENCE_STATE_RANK[left.viewer.state] ||
        left.agent.name.localeCompare(right.agent.name)
    );
  return (
    <div className="p-1.5">
      {rows.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-0.5">
          {rows.map(({ viewer, agent }) => (
            <ViewerRow key={viewer.userId} viewer={viewer} agent={agent} now={now} />
          ))}
        </ul>
      )}
      {capNote && (
        <p className="m-0 px-2 pt-1.5 pb-1 text-[11.5px] text-muted-foreground">{capNote}</p>
      )}
    </div>
  );
}

function ViewerRow({
  viewer,
  agent,
  now,
}: {
  viewer: PresenceViewer;
  agent: PresenceAgent;
  now: number;
}) {
  const away = viewer.state === 'away';
  const note = viewer.state === 'writing_note';
  return (
    <li
      data-state={viewer.state}
      className={`flex items-center gap-2 px-2 py-1.5 rounded max-sm:min-h-[46px] ${away ? 'opacity-50' : ''}`}
    >
      <span
        aria-hidden
        className={`flex-none grid place-items-center w-6 h-6 rounded-full text-[10px] font-semibold text-white ${agent.colour} ${away ? 'grayscale' : ''}`}
      >
        {agent.initials}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[12.5px] font-medium text-foreground">
          {agent.name}
        </span>
        <span
          className={`block text-[11.5px] ${
            viewer.state === 'writing_reply'
              ? 'font-medium text-warning'
              : note
                ? 'text-muted-foreground/70'
                : 'text-muted-foreground'
          }`}
        >
          {STATE_COPY[viewer.state]}
        </span>
      </span>
      <span className="flex-none text-[11px] text-muted-foreground">
        {sinceCopy(viewer.since, now)}
      </span>
    </li>
  );
}

export function PresenceEye({ viewers, available, isPhone, capped, capNote }: PresenceEyeProps) {
  const [open, setOpen] = useState(false);
  const capOnly = !available && !!capped;
  if (!capOnly && (!available || viewers.length === 0)) return null;
  if (capOnly && !capNote) return null;

  const shown = capOnly ? [] : viewers;
  const writingReply = shown.some((viewer) => viewer.state === 'writing_reply');
  const label = capOnly ? (capNote as string) : agentCountLabel(shown.length);
  const list = <ViewerList viewers={shown} capNote={capNote} />;
  const button = (toggle: () => void, expanded: boolean) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={`${ICON_BTN} ${PHONE_ICON_BTN} w-auto min-w-[30px] gap-1 px-1.5 max-sm:min-w-11 ${
        writingReply ? 'text-warning bg-warning-muted' : ''
      }`}
    >
      <span className="inline-flex items-center gap-1">
        <Eye className="w-[15px] h-[15px]" />
        {!capOnly && (
          <span className="text-[11.5px] font-semibold tabular-nums">{shown.length}</span>
        )}
      </span>
    </button>
  );

  if (isPhone) {
    return (
      <>
        {button(() => setOpen((val) => !val), open)}
        {open &&
          createPortal(
            <>
              <button
                type="button"
                aria-label="Close"
                className={`${MOBILE_SCRIM} cursor-default`}
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-label={label}
                data-testid="presence-sheet"
                className={`rounded-lg border border-border bg-card shadow-lg ${MOBILE_SHEET}`}
              >
                {list}
              </div>
            </>,
            document.body
          )}
      </>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      ariaLabel={label}
      width={POPOVER_WIDTH}
      align="end"
      trigger={({ open: expanded, toggle }) => button(toggle, expanded)}
    >
      {list}
    </Popover>
  );
}
