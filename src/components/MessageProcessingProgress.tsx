import { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { ProcessingSession } from '@/hooks/useEmailProcessing';

type Position = { x: number; y: number };

type Props = {
  session: ProcessingSession;
  index: number; // For stacking multiple widgets
  onClose: (sessionKey: string) => void; // Use sessionKey instead of integrationId
  icon?: LucideIcon; // Custom icon for different sources
  sourceType?: string; // 'email', 'telegram', 'slack', etc.
};

export const MessageProcessingProgress = ({
  session,
  index,
  onClose,
  icon = Mail,
  sourceType = 'message',
}: Props) => {
  const navigate = useNavigate();
  const SourceIcon = icon;

  // Persist state across navigation using localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('emailProcessingWidget_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  // Use session-specific closed state to avoid hiding all widgets
  const [isClosed, setIsClosed] = useState(() => {
    // Check localStorage for this specific session's closed state
    const saved = localStorage.getItem(`emailProcessingWidget_${session.sessionKey}_closed`);
    // Default to false (open) for new sessions
    return saved === 'true' && session.status === 'complete';
  });

  // Track if user manually dismissed (different from auto-close)
  const [userDismissed, setUserDismissed] = useState(() => {
    const saved = localStorage.getItem(`emailProcessingWidget_${session.sessionKey}_dismissed`);
    return saved === 'true';
  });

  // Draggable position state - stack widgets vertically with offset based on index
  const WIDGET_HEIGHT = 200; // Approximate height per widget
  const STACK_OFFSET = WIDGET_HEIGHT + 16; // Offset between stacked widgets

  const [position, setPosition] = useState<Position>(() => {
    const saved = localStorage.getItem(`emailProcessingWidget_${session.sessionKey}_position`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        return parsed;
      } catch {
        return { x: window.innerWidth - 336, y: 16 + index * STACK_OFFSET };
      }
    }
    return { x: window.innerWidth - 336, y: 16 + index * STACK_OFFSET };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('emailProcessingWidget_expanded', String(isExpanded));
  }, [isExpanded]);

  // Save closed state per session
  useEffect(() => {
    localStorage.setItem(`emailProcessingWidget_${session.sessionKey}_closed`, String(isClosed));
  }, [isClosed, session.sessionKey]);

  // Save user dismissed state
  useEffect(() => {
    localStorage.setItem(
      `emailProcessingWidget_${session.sessionKey}_dismissed`,
      String(userDismissed)
    );
  }, [userDismissed, session.sessionKey]);

  // Use session data from props instead of hook
  const {
    status,
    total,
    current,
    processed,
    analyzed,
    successful,
    failed,
    skipped,
    error,
    progress,
    isProcessing,
    fetchTime,
    processTime,
    totalTime,
    integrationName,
    kbEntriesTotal,
    kbQAPairs,
    kbStandaloneKnowledge,
    kbDocuments,
  } = session;

  // Save position to localStorage with session-specific key
  useEffect(() => {
    localStorage.setItem(
      `emailProcessingWidget_${session.sessionKey}_position`,
      JSON.stringify(position)
    );
  }, [position, session.sessionKey]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') {
      return; // Don't drag if clicking buttons
    }
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) {
        return;
      }

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep widget within viewport bounds
      const maxX = window.innerWidth - 320; // widget width
      const maxY = window.innerHeight - 100; // minimum height

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Auto-expand and reopen when processing completes with results
  useEffect(() => {
    if (status === 'complete' && total > 0) {
      setIsClosed(false);
      setIsExpanded(true); // Auto-expand to show performance results
    }
  }, [status, total]);

  // Auto-reopen when processing starts (even if widget was closed)
  // Only auto-reopen if:
  // 1. Not user dismissed OR
  // 2. New messages found (total > 0)
  useEffect(() => {
    const hasNewMessages = total > 0;
    const shouldReopen =
      (status === 'started' || status === 'processing' || isProcessing) &&
      (!userDismissed || hasNewMessages);

    if (shouldReopen) {
      setIsClosed(false);
      // Clear dismissed flag if new messages found
      if (hasNewMessages) {
        setUserDismissed(false);
        localStorage.removeItem(`emailProcessingWidget_${session.sessionKey}_dismissed`);
      }
      // Clear the closed state from localStorage when reprocessing
      localStorage.removeItem(`emailProcessingWidget_${session.sessionKey}_closed`);
    }
  }, [status, isProcessing, total, userDismissed, session.sessionKey]);

  // Calculate if there are messages still being processed
  const messagesInProgress = Math.max(0, current - (successful ?? 0) - (skipped ?? 0) - failed);

  // If all messages are accounted for, consider it complete even if backend hasn't sent 'complete' event yet
  const allMessagesProcessed = current > 0 && current === total && messagesInProgress === 0;

  // Auto-close after delay when completed (either by status or when all messages processed)
  useEffect(() => {
    if (status === 'complete' || allMessagesProcessed) {
      // If no messages found (total === 0), close after 30 seconds
      // If messages were processed (total > 0), keep open for 5 minutes to show results
      const closeDelay = total === 0 ? 30000 : 300000; // 30s for no messages, 5 min for processed messages

      const timer = setTimeout(() => {
        setIsClosed(true);
        // Actually remove the session from parent after a short delay
        setTimeout(() => onClose(session.sessionKey), 1000);
      }, closeDelay);

      return () => clearTimeout(timer);
    }
  }, [status, allMessagesProcessed, total, session.sessionKey, onClose]);

  // Show widget ONLY if there's activity
  const isActivelyProcessing =
    (isProcessing || status === 'started' || status === 'processing') && !allMessagesProcessed;
  const hasRecentActivity = status === 'complete' || status === 'error' || allMessagesProcessed; // Show on complete/error regardless of total

  // Force show if actively processing (ignore isClosed), allow closing only when complete
  // ALWAYS show when processing, even if user closed it before
  const shouldBeVisible = isActivelyProcessing || (hasRecentActivity && !isClosed);

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border shadow-2xl bg-card text-card-foreground"
      style={{
        display: shouldBeVisible ? 'block' : 'none', // Hide with CSS, don't unmount
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Header - Always visible - Draggable */}
      <div
        role="button"
        tabIndex={0}
        className="flex justify-between items-center p-3 border-b select-none bg-muted/30 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        title="Drag to move widget"
      >
        <div className="flex flex-1 gap-2 items-center">
          {allMessagesProcessed || status === 'complete' ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : status === 'error' ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : isProcessing || status === 'processing' || status === 'started' ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold truncate" title={integrationName}>
            {integrationName.length > 20
              ? integrationName.substring(0, 17) + '...'
              : integrationName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {allMessagesProcessed
              ? 'Complete'
              : isProcessing || status === 'processing' || status === 'started'
                ? 'Processing'
                : status === 'complete'
                  ? 'Complete'
                  : status === 'error'
                    ? 'Failed'
                    : 'Ready'}
          </span>
        </div>
        <div className="flex gap-1 items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0 w-6 h-6"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsClosed(true);
              setUserDismissed(true); // Prevent reopening on empty polls
              localStorage.setItem(`emailProcessingWidget_${session.sessionKey}_closed`, 'true');
              localStorage.setItem(`emailProcessingWidget_${session.sessionKey}_dismissed`, 'true');
              // Remove session immediately when manually closed
              setTimeout(() => onClose(session.sessionKey), 1000);
            }}
            className="p-0 w-6 h-6"
            title={
              isActivelyProcessing
                ? 'Hide widget (processing continues in background)'
                : "Close widget (won't reappear until new messages found)"
            }
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="overflow-y-auto p-3 space-y-3 max-h-96">
          {/* Progress Bar */}
          {total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  Processing: {current} / {total}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages - Compact */}
          <div className="flex justify-around text-center">
            <div>
              <div className="flex gap-1 justify-center items-center">
                <SourceIcon className="w-3 h-3 text-blue-500" />
                <span className="text-lg font-bold">{total}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Found</p>
            </div>
            {/* Show total processed (emails saved to DB) */}
            {(processed > 0 || current > 0) && (
              <div>
                <div className="flex gap-1 justify-center items-center">
                  <Loader2
                    className={`w-3 h-3 ${isProcessing ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="text-lg font-bold">{processed > 0 ? processed : current}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Processed</p>
              </div>
            )}
            <div>
              <div className="flex gap-1 justify-center items-center">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-lg font-bold">{analyzed ?? successful ?? 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Analyzed</p>
            </div>
            <div>
              <div className="flex gap-1 justify-center items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                <span className="text-lg font-bold">{skipped ?? 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Skipped</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (failed > 0) {
                  navigate('/messages');
                }
              }}
              disabled={failed === 0}
              className="transition-opacity cursor-pointer hover:opacity-75 disabled:cursor-default disabled:opacity-100"
              title={failed > 0 ? 'Click to view failed messages' : 'No failed messages'}
            >
              <div className="flex gap-1 justify-center items-center">
                <XCircle className="w-3 h-3 text-red-500" />
                <span className="text-lg font-bold">{failed}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Failed</p>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 text-sm rounded bg-destructive/10 text-destructive">
              {error}
            </div>
          )}

          {/* Success Message */}
          {status === 'complete' && !error && (
            <div className="space-y-1.5">
              <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded text-xs">
                ✅ Processed {processed} {sourceType}
                {processed !== 1 ? 's' : ''}
                {failed > 0 && ` (${failed} failed)`}
              </div>

              {/* KB Entries Stats */}
              {kbEntriesTotal !== undefined && kbEntriesTotal > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-3 py-1.5 rounded text-xs">
                  📚 KB: {kbEntriesTotal} {kbEntriesTotal === 1 ? 'entry' : 'entries'}
                  {kbQAPairs !== undefined && kbQAPairs > 0 && ` (${kbQAPairs} Q&A`}
                  {kbStandaloneKnowledge !== undefined &&
                    kbStandaloneKnowledge > 0 &&
                    `, ${kbStandaloneKnowledge} knowledge`}
                  {kbDocuments !== undefined && kbDocuments > 0 && `, ${kbDocuments} docs`}
                  {(kbQAPairs ?? 0) + (kbStandaloneKnowledge ?? 0) + (kbDocuments ?? 0) > 0 && ')'}
                </div>
              )}
            </div>
          )}

          {/* Performance Timing */}
          {status === 'complete' &&
            (fetchTime !== undefined || processTime !== undefined || totalTime) && (
              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">⚡ Performance</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {fetchTime !== undefined && fetchTime > 0 ? (
                    <div>
                      <p className="font-mono text-xs font-semibold">
                        {fetchTime < 1000 ? `${fetchTime}ms` : `${(fetchTime / 1000).toFixed(1)}s`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Fetch</p>
                    </div>
                  ) : null}
                  {processTime !== undefined && processTime > 0 ? (
                    <div>
                      <p className="font-mono text-xs font-semibold">
                        {processTime < 1000
                          ? `${processTime}ms`
                          : `${(processTime / 1000).toFixed(1)}s`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Process</p>
                    </div>
                  ) : null}
                  {totalTime && totalTime > 0 ? (
                    <div>
                      <p className="font-mono text-xs font-semibold text-blue-600">
                        {totalTime < 1000 ? `${totalTime}ms` : `${(totalTime / 1000).toFixed(1)}s`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                  ) : null}
                </div>
                {processTime !== undefined && processTime > 0 && total > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                    Avg: {Math.round(processTime / total)}ms/msg
                  </p>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
