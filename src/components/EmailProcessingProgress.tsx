import { useState, useEffect } from 'react';
import { Mail, CheckCircle, XCircle, Loader2, Globe, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { integrationsService } from '@/services/integrations.service';
import { useAuthStore } from '@/stores/authStore';
import { useEmailProcessing } from '../hooks/useEmailProcessing';
import { Button } from './ui/Button';

type Position = { x: number; y: number };

export const EmailProcessingProgress = () => {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [hasEmailIntegrations, setHasEmailIntegrations] = useState(false);
  
  // Persist state across navigation using localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('emailProcessingWidget_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  
  const [isClosed, setIsClosed] = useState(() => {
    const saved = localStorage.getItem('emailProcessingWidget_closed');
    return saved === 'true';
  });

  // Draggable position state
  const [position, setPosition] = useState<Position>(() => {
    const saved = localStorage.getItem('emailProcessingWidget_position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Position;
        return parsed;
      } catch {
        return { x: window.innerWidth - 336, y: 16 };
      }
    }
    return { x: window.innerWidth - 336, y: 16 }; // Default: bottom-right
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('emailProcessingWidget_expanded', String(isExpanded));
  }, [isExpanded]);

  // Save closed state to localStorage and reset after some time
  useEffect(() => {
    localStorage.setItem('emailProcessingWidget_closed', String(isClosed));
    
    // Auto-reopen widget when new processing starts (don't stay closed forever)
    if (isClosed) {
      const timer = setTimeout(() => {
        setIsClosed(false);
      }, 300000); // Reopen after 5 minutes
      
      return () => clearTimeout(timer);
    }
  }, [isClosed]);

  // Check if ANY organization has email integrations (system-wide)
  useEffect(() => {
    const checkIntegrations = async () => {
      try {
        const hasIntegrations = await integrationsService.hasAnyEmailIntegrations();
        setHasEmailIntegrations(hasIntegrations);
      } catch (error) {
        console.error('Failed to check integrations:', error);
        setHasEmailIntegrations(false);
      }
    };

    checkIntegrations().catch((error) => {
      console.error('Failed to check integrations:', error);
    });
  }, []); // Only check once on mount, not on org change

  // Show widget if admin and has email integrations (any org)
  // Subscribe to events if admin (to see progress even when org is selected)
  const shouldShow = isAdmin && hasEmailIntegrations;
  const shouldSubscribe = isAdmin && hasEmailIntegrations;

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
  } = useEmailProcessing(shouldSubscribe);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem('emailProcessingWidget_position', JSON.stringify(position));
  }, [position]);

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

  // Auto-reopen when processing starts
  useEffect(() => {
    if (status === 'started' || status === 'processing' || isProcessing) {
      setIsClosed(false); // Show widget when processing starts
    }
  }, [status, isProcessing]);

  // Don't render if:
  // - No integrations configured
  // - Status is idle AND widget was manually closed
  // - Widget was manually closed AND processing is not active
  if (!shouldShow) {
    return null;
  }
  
  // Hide only if idle AND manually closed, OR if manually closed AND not processing
  if (status === 'idle' || (isClosed && !isProcessing && status !== 'processing')) {
    return null;
  }

  return (
    <div
      className="fixed z-50 w-80 shadow-2xl rounded-lg border bg-card text-card-foreground"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Header - Always visible - Draggable */}
      <div
        role="button"
        tabIndex={0}
        className="flex items-center justify-between p-3 border-b bg-muted/30 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        title="Drag to move widget"
      >
        <div className="flex items-center gap-2 flex-1">
          {isProcessing || status === 'processing' || status === 'started' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : status === 'complete' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : status === 'error' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold truncate">
            {isProcessing || status === 'processing' || status === 'started'
              ? 'Processing'
              : status === 'complete'
                ? 'Complete'
                : status === 'error'
                  ? 'Failed'
                  : 'Ready'}
          </span>
          {selectedOrganizationId && (
            <span title="System-wide stats">
              <Globe className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsClosed(true)}
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
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
              <div className="flex items-center justify-center gap-1">
                <Mail className="h-3 w-3 text-blue-500" />
                <span className="text-lg font-bold">{total}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Found</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
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
              className="cursor-pointer hover:opacity-75 transition-opacity disabled:cursor-default disabled:opacity-100"
              title={failed > 0 ? 'Click to view failed messages' : 'No failed messages'}
            >
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-3 w-3 text-red-500" />
                <span className="text-lg font-bold">{failed}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {failed > 0 ? 'Failed (click)' : 'Failed'}
              </p>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {status === 'complete' && !error && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded text-xs">
              ✅ Processed {processed} email{processed !== 1 ? 's' : ''}
              {failed > 0 && ` (${failed} failed)`}
            </div>
          )}

          {/* Performance Timing */}
          {status === 'complete' && (fetchTime !== undefined || processTime !== undefined || totalTime) && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">⚡ Performance</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {fetchTime !== undefined && fetchTime > 0 ? (
                  <div>
                    <p className="text-xs font-mono font-semibold">
                      {fetchTime < 1000 ? `${fetchTime}ms` : `${(fetchTime / 1000).toFixed(1)}s`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Fetch</p>
                  </div>
                ) : null}
                {processTime !== undefined && processTime > 0 ? (
                  <div>
                    <p className="text-xs font-mono font-semibold">
                      {processTime < 1000
                        ? `${processTime}ms`
                        : `${(processTime / 1000).toFixed(1)}s`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Process</p>
                  </div>
                ) : null}
                {totalTime && totalTime > 0 ? (
                  <div>
                    <p className="text-xs font-mono font-semibold text-blue-600">
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
