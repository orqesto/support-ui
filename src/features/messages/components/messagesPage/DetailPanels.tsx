import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The split pane beside the list (Messages list v2). Moved unchanged from MessagesPage. */
export const SplitDetailPane = ({ detail }: { detail: ReactNode }) => (
  <aside
    aria-label="Thread detail"
    className="flex flex-col flex-[0_0_58%] min-w-0 overflow-hidden border-l border-border bg-card"
  >
    {detail ?? (
      <div className="grid flex-1 place-items-center p-5 text-center text-[13px] text-muted-foreground">
        <p>
          Select a thread to read it here.
          <br />
          <span className="text-xs">J / K move between threads.</span>
        </p>
      </div>
    )}
  </aside>
);

/** The slide-over and its backdrop (list layout, the board, contacts). Moved unchanged from MessagesPage. */
export const DetailSlideOver = ({
  detail,
  onBackdropClick,
}: {
  detail: ReactNode;
  onBackdropClick: () => void;
}) => (
  <>
    {/* Backdrop — dims the list, click to close. Route through the panel's
        prompt-aware close so an unread triage thread still asks "Mark as
        read?" here, matching the header X. Falls back to a direct close if
        the panel hasn't registered a handler yet. */}
    <button
      type="button"
      aria-label="Close"
      className={cn(
        'fixed inset-0 z-20 cursor-default bg-black/25 dark:bg-black/50',
        // Leave the sidebar undimmed: offset by its current width (set by the shell).
        'lg:left-[var(--sidebar-w,16rem)]'
      )}
      onClick={onBackdropClick}
    />

    {/* Detail panel — slides in from right, full viewport height. Never on a phone:
        there every selection opens the full page (usePhoneOpensMessageAsPage). */}
    <div
      className="fixed right-0 bottom-0 w-full sm:w-[40rem] z-[60] border-l border-border bg-background flex flex-col overflow-hidden shadow-2xl transition-[top] duration-300"
      style={{ top: 'var(--mobile-header-h, 0px)' }}
    >
      {detail}
    </div>
  </>
);
