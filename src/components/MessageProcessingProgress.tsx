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

  // Auto-reopen widget after some time if closed
  useEffect(() => {
    if (isClosed) {
      const timer = setTimeout(() => {
        setIsClosed(false);
      }, 300000); // Reopen after 5 minutes

      return () => clearTimeout(timer);
    }
  }, [isClosed]);

  // Use session data from props instead of hook
  const {
    status,
    total,
    current,
    processed,
    failed,
    error,
    progress,
    isProcessing,
    fetchTime,
    processTime,
    totalTime,
    integrationName,
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
  useEffect(() => {
    if (status === 'started' || status === 'processing' || isProcessing) {
      setIsClosed(false);
      // Clear the closed state from localStorage when reprocessing
      localStorage.removeItem(`emailProcessingWidget_${session.sessionKey}_closed`);
    }
  }, [status, isProcessing, session.sessionKey]);

  // Auto-close after delay when completed
  // Keep widget open to show AI analysis phase which happens asynchronously
  useEffect(() => {
    if (status === 'complete') {
      // If no messages found (total === 0), close after 30 seconds
      // If messages were processed (total > 0), keep open for 2 minutes to show AI analysis results
      const closeDelay = total === 0 ? 30000 : 120000; // 30s for no messages, 2 min for processed messages

      const timer = setTimeout(() => {
        setIsClosed(true);
      }, closeDelay);

      return () => clearTimeout(timer);
    }
  }, [status, total]);

  // Show widget ONLY if there's activity
  const isActivelyProcessing = isProcessing || status === 'started' || status === 'processing';
  const hasRecentActivity = status === 'complete' || status === 'error'; // Show on complete/error regardless of total

  // Force show if actively processing (ignore isClosed), allow closing only when complete
  // ALWAYS show when processing, even if user closed it before
  const shouldBeVisible = isActivelyProcessing || (hasRecentActivity && !isClosed);

  // Debug log for visibility issues
  if (import.meta.env.DEV) {
    console.log(`[MessageProcessingProgress] ${integrationName}:`, {
      status,
      isProcessing,
      isActivelyProcessing,
      hasRecentActivity,
      isClosed,
      shouldBeVisible,
      total,
      current,
    });
  }

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
          {isProcessing || status === 'processing' || status === 'started' ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : status === 'complete' ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : status === 'error' ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold truncate" title={integrationName}>
            {integrationName.length > 20
              ? integrationName.substring(0, 17) + '...'
              : integrationName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {isProcessing || status === 'processing' || status === 'started'
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
              localStorage.setItem(`emailProcessingWidget_${session.sessionKey}_closed`, 'true');
              // Notify parent to remove this session after delay
              setTimeout(() => onClose(session.sessionKey), 300000); // Auto-remove after 5 min
            }}
            disabled={isActivelyProcessing}
            className="p-0 w-6 h-6"
            title={isActivelyProcessing ? 'Cannot close while processing' : 'Close widget'}
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
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
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
            <div>
              <div className="flex gap-1 justify-center items-center">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-lg font-bold">{processed}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Processed</p>
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
              <p className="text-[10px] text-muted-foreground">
                {failed > 0 ? 'Failed (click)' : 'Failed'}
              </p>
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
              {processed > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded text-xs flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI analysis in progress (embeddings, spam detection, categorization)...
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
