import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Lightbulb, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type UseLearningNotificationsResult } from '@/hooks/useLearningNotifications';

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const deltaSec = Math.max(0, (Date.now() - then) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
};

// Lean operational surface for engine activity (P1 #46). Mirrors
// SLANotificationBell's open-anchored panel pattern. Shows the top N
// auto-actions + pending suggestions with a "View all" link to the
// existing Settings → AI inbox.
const PANEL_PEEK_LIMIT = 5;

export const LearningNotificationBell = ({
  notifications,
  suggestions,
  unreadCount,
  fetchError,
  isOrgAdmin,
  markAllRead,
}: UseLearningNotificationsResult) => {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top?: number; bottom?: number; left: number }>({
    left: 0,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Acknowledge unread items once the panel actually renders (not on every
  // open/close). Same pattern as SLANotificationBell.
  useEffect(() => {
    if (open && unreadCount > 0) markAllRead();
  }, [open]);

  // Hide the bell entirely for non-admins — the underlying endpoints return
  // empty for them anyway, no point taking up header real estate.
  if (!isOrgAdmin) return null;

  // Navigate to Settings → AI → Engine Activity (where pending suggestions +
  // auto-actions render). Closes the panel. Deep-link goes via the hash
  // `#ai/learning` so the AIConfigSettings child picks the right sub-tab
  // without a click-through (see SettingsPage hash parser). Optional
  // `focusSuggestionId` becomes a `?focus=<id>` search param so a future
  // LearningSuggestionsSettings can scroll the row into view; harmless if unread.
  const goToAiSettings = (focusSuggestionId?: number) => {
    const search = focusSuggestionId ? `?focus=${focusSuggestionId}` : '';
    navigate(`/settings${search}#ai/learning`);
    setOpen(false);
  };

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 360;
      const panelHeight = 400;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
        setPanelPos({ top: rect.bottom + 8, left });
      } else {
        setPanelPos({ bottom: window.innerHeight - rect.top + 8, left });
      }
    }
    setOpen((prev) => !prev);
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate('/settings#ai');
  };

  const totalItems = notifications.length + suggestions.length;

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="flex relative justify-center items-center w-8 h-8 rounded-md transition-colors hover:bg-accent text-foreground/70 hover:text-foreground"
        title="Engine activity & suggestions"
        aria-label="Learning engine notifications"
      >
        <Sparkles className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex justify-center items-center w-4 h-4 text-[10px] font-bold leading-none text-white bg-violet-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ top: panelPos.top, bottom: panelPos.bottom, left: panelPos.left }}
          className="fixed z-50 w-[360px] rounded-lg border shadow-lg bg-card border-border"
        >
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Engine activity</span>
            <div className="flex gap-1 items-center">
              <button
                onClick={handleViewAll}
                className="px-2 py-0.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                View all
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex justify-center items-center w-6 h-6 rounded transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 space-y-2 max-h-96">
            {fetchError ? (
              <p className="px-2 py-4 text-xs text-center text-muted-foreground">
                Couldn&apos;t load engine activity — retrying…
              </p>
            ) : totalItems === 0 ? (
              <p className="px-2 py-6 text-xs text-center text-muted-foreground">
                No new auto-actions or suggestions.
              </p>
            ) : (
              <>
                {notifications.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-1 text-[11px] font-medium tracking-wider uppercase text-muted-foreground">
                      Auto-actions ({notifications.length})
                    </p>
                    {notifications.slice(0, PANEL_PEEK_LIMIT).map((notif) => (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="flex gap-2 items-start p-2 w-full text-sm text-left rounded border bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors cursor-pointer"
                      >
                        <Wand2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-violet-500" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-foreground">{notif.summary}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {notif.domain} · {notif.actionType} ·{' '}
                            {formatRelativeTime(notif.createdAt)}
                          </p>
                        </div>
                      </button>
                    ))}
                    {notifications.length > PANEL_PEEK_LIMIT && (
                      <button
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="px-1 text-[11px] text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        +{notifications.length - PANEL_PEEK_LIMIT} more — View all
                      </button>
                    )}
                  </div>
                )}

                {suggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-1 pt-2 text-[11px] font-medium tracking-wider uppercase text-muted-foreground">
                      Pending suggestions ({suggestions.length})
                    </p>
                    {suggestions.slice(0, PANEL_PEEK_LIMIT).map((sug) => {
                      const summary =
                        typeof sug.payload.title === 'string'
                          ? sug.payload.title
                          : typeof sug.payload.summary === 'string'
                            ? sug.payload.summary
                            : `${sug.suggestionType} (${sug.evidenceCount} signals)`;
                      return (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => goToAiSettings(sug.id)}
                          className="flex gap-2 items-start p-2 w-full text-sm text-left rounded border bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                        >
                          <Lightbulb className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <div className="flex-1 min-w-0">
                            <p className={cn('truncate text-foreground')}>{summary}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {sug.domain} · {formatRelativeTime(sug.createdAt)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {suggestions.length > PANEL_PEEK_LIMIT && (
                      <button
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="px-1 text-[11px] text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        +{suggestions.length - PANEL_PEEK_LIMIT} more — View all
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
