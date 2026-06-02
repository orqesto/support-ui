import { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { ProcessingSession } from '@/hooks/useEmailProcessing';
import { useMediaQuery } from '@/hooks/useMediaQuery';

type Position = { xPos: number; yPos: number };

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

  // Sanitize sessionKey before using as a localStorage key component
  const safeKey = session.sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Persist state across navigation using localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('emailProcessingWidget_expanded');
    return saved !== null ? saved === 'true' : true;
  });

  // Use session-specific closed state to avoid hiding all widgets
  const [isClosed, setIsClosed] = useState(() => {
    // Check localStorage for this specific session's closed state
    const saved = localStorage.getItem(`emailProcessingWidget_${safeKey}_closed`);
    // Default to false (open) for new sessions
    return saved === 'true' && session.status === 'complete';
  });

  // Track if user manually dismissed (different from auto-close)
  const [userDismissed, setUserDismissed] = useState(() => {
    const saved = localStorage.getItem(`emailProcessingWidget_${safeKey}_dismissed`);
    return saved === 'true';
  });

  // Detect mobile viewport
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Draggable position state - stack widgets vertically with offset based on index
  const WIDGET_HEIGHT = 200; // Approximate height per widget
  const STACK_OFFSET = WIDGET_HEIGHT + 16; // Offset between stacked widgets

  const [position, setPosition] = useState<Position>(() => {
    // On mobile, ignore saved position
    if (isMobile) {
      return { xPos: 0, yPos: 0 };
    }
    const saved = localStorage.getItem(`emailProcessingWidget_${safeKey}_position`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        return parsed;
      } catch {
        return { xPos: window.innerWidth - 336, yPos: 16 + index * STACK_OFFSET };
      }
    }
    return { xPos: window.innerWidth - 336, yPos: 16 + index * STACK_OFFSET };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ xPos: 0, yPos: 0 });

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('emailProcessingWidget_expanded', String(isExpanded));
  }, [isExpanded]);

  // Save closed state per session
  useEffect(() => {
    localStorage.setItem(`emailProcessingWidget_${safeKey}_closed`, String(isClosed));
  }, [isClosed, safeKey, session.sessionKey]);

  // Save user dismissed state
  useEffect(() => {
    localStorage.setItem(`emailProcessingWidget_${safeKey}_dismissed`, String(userDismissed));
  }, [userDismissed, session.sessionKey, safeKey]);

  // Use session data from props instead of hook
  const {
    status,
    total,
    emailTotal,
    current,
    processed,
    analyzed,
    successful,
    failed,
    skipped,
    linkedReplies,
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
    kbMessagesTotal,
  } = session;

  // When in KB-processing mode, use KB-specific totals for the main progress display
  const isKBMode = session.stage === 'kb-processing' && (kbMessagesTotal ?? 0) > 0;
  const effectiveTotal = isKBMode ? (kbMessagesTotal ?? 0) : total;
  const effectiveCurrent = isKBMode ? (session.kbMessagesProcessed ?? 0) : current;

  // Derive fetch-phase progress: during fetch, current=0 but processed tracks fetch count
  const isFetchPhase = session.stage === 'fetching' && effectiveCurrent === 0 && processed > 0;
  const rawCurrent = isFetchPhase ? processed : effectiveCurrent;
  // Cap displayCurrent at total to prevent showing "100 / 52" type issues
  const displayCurrent = effectiveTotal > 0 ? Math.min(rawCurrent, effectiveTotal) : rawCurrent;
  const displayProgress = isFetchPhase
    ? effectiveTotal > 0
      ? Math.min(100, (processed / effectiveTotal) * 100)
      : 0
    : isKBMode
      ? effectiveTotal > 0
        ? Math.min(100, (effectiveCurrent / effectiveTotal) * 100)
        : 0
      : Math.min(100, progress);
  const progressLabel = isFetchPhase
    ? 'Fetching'
    : session.stage === 'finalizing'
      ? 'Finalizing'
      : session.stage === 'analyzing' || isKBMode
        ? 'Analyzing'
        : 'Processing';

  // Save position to localStorage with session-specific key
  useEffect(() => {
    localStorage.setItem(`emailProcessingWidget_${safeKey}_position`, JSON.stringify(position));
  }, [position, safeKey, session.sessionKey]);

  // Drag handlers (desktop only)
  const handleMouseDown = (event: React.MouseEvent) => {
    if (isMobile) return; // No dragging on mobile
    if ((event.target as HTMLElement).closest('button')) {
      return; // Don't drag if clicking buttons or their children (icons, spans)
    }
    setIsDragging(true);
    setDragOffset({
      xPos: event.clientX - position.xPos,
      yPos: event.clientY - position.yPos,
    });
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) {
        return;
      }

      const newX = event.clientX - dragOffset.xPos;
      const newY = event.clientY - dragOffset.yPos;

      // Keep widget within viewport bounds
      const maxX = window.innerWidth - 320; // widget width
      const maxY = window.innerHeight - 100; // minimum height

      setPosition({
        xPos: Math.max(0, Math.min(newX, maxX)),
        yPos: Math.max(0, Math.min(newY, maxY)),
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
      // Mobile: auto-collapse to save space, Desktop: auto-expand to show results
      setIsExpanded(!isMobile);
    }
  }, [status, total, isMobile]);

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
        localStorage.removeItem(`emailProcessingWidget_${safeKey}_dismissed`);
      }
      // Clear the closed state from localStorage when reprocessing
      localStorage.removeItem(`emailProcessingWidget_${safeKey}_closed`);
    }
  }, [status, isProcessing, total, userDismissed, session.sessionKey, safeKey]);

  // Calculate if there are messages still being processed
  const messagesInProgress = Math.max(0, current - (successful ?? 0) - (skipped ?? 0) - failed);

  // If all messages are accounted for, consider it complete even if backend hasn't sent 'complete' event yet
  const allMessagesProcessed = current > 0 && current === total && messagesInProgress === 0;

  // Auto-close after delay when completed (either by status or when all messages processed)
  useEffect(() => {
    if (status === 'complete' || allMessagesProcessed) {
      const backendComplete = status === 'complete';
      let closeDelay: number;

      const hasLinked = (linkedReplies ?? 0) > 0;
      if (total === 0 && !hasLinked) {
        closeDelay = isMobile ? 5000 : 10000; // Nothing happened
      } else if (total === 0 && hasLinked) {
        closeDelay = isMobile ? 10000 : 15000; // Only linked replies
      } else if (backendComplete) {
        closeDelay = isMobile ? 10000 : 15000; // Backend confirmed done
      } else {
        closeDelay = isMobile ? 60000 : 300000; // Frontend detected
      }

      const timer = setTimeout(() => {
        setIsClosed(true);
        setTimeout(() => onClose(session.sessionKey), 1000);
      }, closeDelay);

      return () => clearTimeout(timer);
    }
  }, [status, allMessagesProcessed, total, linkedReplies, session.sessionKey, onClose, isMobile]);

  // Show widget ONLY if there's activity
  const isActivelyProcessing =
    (isProcessing || status === 'started' || status === 'processing') && !allMessagesProcessed;
  const hasRecentActivity = status === 'complete' || status === 'error' || allMessagesProcessed; // Show on complete/error regardless of total

  // Force show if actively processing (ignore isClosed), allow closing only when complete
  // ALWAYS show when processing, even if user closed it before
  const shouldBeVisible = isActivelyProcessing || (hasRecentActivity && !isClosed);

  return (
    <div
      className={
        isMobile
          ? 'fixed right-0 bottom-0 left-0 max-w-full rounded-t-lg border-t shadow-2xl border-x bg-card text-card-foreground'
          : 'fixed z-50 w-80 rounded-lg border shadow-2xl bg-card text-card-foreground'
      }
      style={{
        display: shouldBeVisible ? 'block' : 'none', // Hide with CSS, don't unmount
        ...(isMobile
          ? {
              // Mobile: bottom sheet, fixed offset per widget with proper z-index layering
              bottom: `${index * 52}px`, // Fixed 52px offset per widget
              maxHeight: '70vh',
              zIndex: 50 - index, // Lower widgets have higher z-index (appear on top)
            }
          : {
              // Desktop: draggable
              left: `${position.xPos}px`,
              top: `${position.yPos}px`,
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: 50,
            }),
      }}
    >
      {/* Header - Always visible - Draggable on desktop */}
      <div
        role="button"
        tabIndex={0}
        className={
          isMobile
            ? 'flex justify-between items-center px-3 py-2 border-b select-none bg-muted/30'
            : 'flex justify-between items-center p-3 border-b select-none bg-muted/30 cursor-grab active:cursor-grabbing'
        }
        onMouseDown={isMobile ? undefined : handleMouseDown}
        title={isMobile ? undefined : 'Drag to move widget'}
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
              localStorage.setItem(`emailProcessingWidget_${safeKey}_closed`, 'true');
              localStorage.setItem(`emailProcessingWidget_${safeKey}_dismissed`, 'true');
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
        <div
          className={
            isMobile
              ? 'overflow-y-auto p-2 space-y-2 max-h-[60vh]'
              : 'overflow-y-auto p-3 space-y-3 max-h-96'
          }
        >
          {/* Progress Bar */}
          {effectiveTotal > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{`${progressLabel}: ${displayCurrent} / ${effectiveTotal}`}</span>
                <span>{Math.min(100, Math.round(displayProgress))}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages - Compact */}
          <div className="flex justify-around text-center">
            <div>
              <div className="flex gap-1 justify-center items-center">
                <SourceIcon className="w-3 h-3 text-blue-500" />
                <span className="text-lg font-bold">{(emailTotal ?? total) || 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Found</p>
            </div>
            {/* Show total processed (emails saved to DB) - cap at Found to prevent overflow */}
            {(processed > 0 || current > 0 || (isKBMode && effectiveCurrent > 0)) && (
              <div>
                <div className="flex gap-1 justify-center items-center">
                  <Loader2
                    className={`w-3 h-3 ${isProcessing ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="text-lg font-bold">
                    {Math.min(processed > 0 ? processed : current, (emailTotal ?? total) || 999)}
                  </span>
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
            {sourceType === 'email' && (linkedReplies ?? 0) > 0 && (
              <div>
                <div className="flex gap-1 justify-center items-center">
                  <Mail className="w-3 h-3 text-blue-400" />
                  <span className="text-lg font-bold">{linkedReplies}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Linked</p>
              </div>
            )}
            <div>
              <div className="flex gap-1 justify-center items-center">
                <div className="w-3 h-3 bg-amber-500 rounded-full" />
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

          {/* KB Processing Progress - Show when KB messages are being processed or entries exist */}
          {((kbMessagesTotal ?? 0) > 0 ||
            (kbEntriesTotal ?? 0) > 0 ||
            (kbQAPairs ?? 0) > 0 ||
            (kbDocuments ?? 0) > 0 ||
            (kbStandaloneKnowledge ?? 0) > 0 ||
            session.stage === 'kb-processing') && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1.5 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                Knowledge Base
                {isProcessing && <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />}
              </p>

              {/* KB Message Processing Progress Bar */}
              {session.kbMessagesTotal !== undefined &&
                session.kbMessagesTotal > 0 &&
                (() => {
                  const kbProcessed = session.kbMessagesProcessed ?? 0;
                  const kbTotal = session.kbMessagesTotal;
                  const kbPct = Math.min(100, Math.round((kbProcessed / kbTotal) * 100));
                  return (
                    <div className="mb-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>
                          {session.status === 'complete'
                            ? `Analyzed: ${kbProcessed} / ${kbTotal}`
                            : `Analyzing: ${kbProcessed} messages...`}
                        </span>
                        <span>{kbPct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-purple-200 dark:bg-purple-900">
                        <div
                          className="h-full bg-purple-600 transition-all duration-300 dark:bg-purple-400"
                          style={{ width: `${kbPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

              <div className="flex justify-around text-center">
                {kbEntriesTotal !== undefined && (
                  <div>
                    <div className="flex gap-1 justify-center items-center">
                      <span
                        className={`text-lg font-bold ${
                          kbEntriesTotal > 0
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {kbEntriesTotal}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                )}
                {kbQAPairs !== undefined && (
                  <div>
                    <div className="flex gap-1 justify-center items-center">
                      <span
                        className={`text-lg font-bold ${
                          kbQAPairs > 0
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {kbQAPairs}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Q&A</p>
                  </div>
                )}
                {kbDocuments !== undefined && (
                  <div>
                    <div className="flex gap-1 justify-center items-center">
                      <span
                        className={`text-lg font-bold ${
                          kbDocuments > 0
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {kbDocuments}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Docs</p>
                  </div>
                )}
                {kbStandaloneKnowledge !== undefined && (
                  <div>
                    <div className="flex gap-1 justify-center items-center">
                      <span
                        className={`text-lg font-bold ${
                          kbStandaloneKnowledge > 0
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {kbStandaloneKnowledge}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Info</p>
                  </div>
                )}
              </div>
            </div>
          )}

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
