import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Mail, MessageSquare, X, CheckCircle } from 'lucide-react';
import { useTelegramProcessing } from '@/hooks/useTelegramProcessing';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { useProcessingStore } from '@/stores/processingStore';

type EmailProcessingEvent = {
  type: 'started' | 'found' | 'processing' | 'processed' | 'complete' | 'error';
  data?: {
    error?: string;
    [key: string]: unknown;
  };
};

export const ProcessingStatusWidget = () => {
  const { tasks, removeTask, addTask } = useProcessingStore();
  const {
    isProcessing: isTelegramProcessing,
    activeBots,
    totalProcessed,
    currentMessage,
  } = useTelegramProcessing(true);
  const [completedTasks, setCompletedTasks] = useState<Array<{ id: string; message: string }>>([]);
  const [, setTick] = useState(0); // Force re-render for duration updates
  const hasEmailTaskRef = useRef(false);

  const handleRemoveTask = useCallback(
    (taskId: string, taskMessage: string) => {
      removeTask(taskId);
      setCompletedTasks((prev) => [...prev, { id: taskId, message: taskMessage }]);
    },
    [removeTask]
  );

  // Auto-manage tasks based on WebSocket email processing events
  useEffect(() => {
    const handleEmailProcessing = (event: unknown) => {
      const emailEvent = event as EmailProcessingEvent;

      if (emailEvent.type === 'started') {
        // Backend started email polling - add task if not already present
        // Check store directly to handle React StrictMode double-mounting
        const currentTasks = useProcessingStore.getState().tasks;
        const existingEmailTask = currentTasks.find((t) => t.type === 'email');

        if (!existingEmailTask) {
          addTask('email', 'Checking emails');
          hasEmailTaskRef.current = true;
        } else {
          console.warn('📧 [ProcessingWidget] Email task already exists, skipping');
        }
      } else if (emailEvent.type === 'complete') {
        // Email polling completed - mark as complete

        if (hasEmailTaskRef.current) {
          // Add to completed tasks to show "Complete!" message
          setCompletedTasks((prev) => [
            ...prev,
            { id: 'email-complete', message: 'Checking emails' },
          ]);
          hasEmailTaskRef.current = false;

          // Remove any active email tasks from store
          const currentTasks = useProcessingStore.getState().tasks;
          const emailTasks = currentTasks.filter((t) => t.type === 'email');
          emailTasks.forEach((task) => removeTask(task.id));
        }
      } else if (emailEvent.type === 'error') {
        // Error occurred - remove task
        console.warn('📧 [ProcessingWidget] Error - removing email task');
        hasEmailTaskRef.current = false;

        const currentTasks = useProcessingStore.getState().tasks;
        const emailTasks = currentTasks.filter((t) => t.type === 'email');
        emailTasks.forEach((task) => removeTask(task.id));
      }
    };

    subscribeToEvent('email:processing', handleEmailProcessing);

    return () => {
      unsubscribeFromEvent('email:processing', handleEmailProcessing);
    };
    // hasEmailTask accessed via closure is intentional - we want stable subscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTask, removeTask]);

  // Auto-remove completed tasks after 10 seconds
  useEffect(() => {
    if (completedTasks.length > 0) {
      const timer = setTimeout(() => {
        setCompletedTasks([]);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [completedTasks]);

  // Update duration display every second when tasks are active
  useEffect(() => {
    if (tasks.length > 0) {
      const interval = setInterval(() => {
        setTick((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [tasks.length]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'telegram':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Loader2 className="w-4 h-4" />;
    }
  };

  const formatDuration = (startedAt: Date) => {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  // if (!isProcessing && completedTasks.length === 0) {
  //   return null;
  // }

  return (
    <div className="fixed right-4 bottom-4 z-50 space-y-2 max-w-sm">
      {/* Active Processing Tasks */}
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex gap-3 items-center p-4 bg-white rounded-lg border border-gray-200 shadow-lg dark:bg-gray-800 dark:border-gray-700 animate-in slide-in-from-bottom-2"
        >
          <div className="flex-shrink-0 text-blue-600 animate-spin dark:text-blue-400">
            <Loader2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-2 items-center">
              <div className="text-gray-600 dark:text-gray-400">{getIcon(task.type)}</div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.message}</p>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {task.type === 'telegram' && isTelegramProcessing ? (
                <>
                  {currentMessage ? (
                    <>Processing: {currentMessage.sender.substring(0, 20)}...</>
                  ) : (
                    <>
                      Active bots: {activeBots} • Processed: {totalProcessed}
                    </>
                  )}
                </>
              ) : (
                <>Processing... {formatDuration(task.startedAt)}</>
              )}
            </p>
          </div>
          <button
            onClick={() => handleRemoveTask(task.id, task.message)}
            className="flex-shrink-0 p-1 text-gray-400 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* Completed Tasks */}
      {completedTasks.map((completed) => (
        <div
          key={completed.id}
          className="flex gap-3 items-center p-4 bg-green-50 rounded-lg border border-green-200 shadow-lg dark:bg-green-950/20 dark:border-green-800 animate-in slide-in-from-bottom-2"
        >
          <div className="flex-shrink-0 text-green-600 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              {completed.message} - Complete!
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
