import { useEffect, useState } from 'react';
import { Loader2, Mail, MessageSquare, X, CheckCircle } from 'lucide-react';
import { useProcessingStore } from '@/stores/processingStore';

export const ProcessingStatusWidget = () => {
  const { tasks, isProcessing, removeTask } = useProcessingStore();
  const [completedTasks, setCompletedTasks] = useState<
    Array<{ id: string; message: string }>
  >([]);

  // Auto-remove completed tasks after 3 seconds
  useEffect(() => {
    if (completedTasks.length > 0) {
      const timer = setTimeout(() => {
        setCompletedTasks([]);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [completedTasks]);

  const handleRemoveTask = (taskId: string, taskMessage: string) => {
    removeTask(taskId);
    setCompletedTasks((prev) => [...prev, { id: taskId, message: taskMessage }]);
  };

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

  if (!isProcessing && completedTasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {/* Active Processing Tasks */}
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-3 p-4 rounded-lg shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 animate-in slide-in-from-bottom-2"
        >
          <div className="flex-shrink-0 text-blue-600 dark:text-blue-400 animate-spin">
            <Loader2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-gray-600 dark:text-gray-400">{getIcon(task.type)}</div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {task.message}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Processing... {formatDuration(task.startedAt)}
            </p>
          </div>
          <button
            onClick={() => handleRemoveTask(task.id, task.message)}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
          className="flex items-center gap-3 p-4 rounded-lg shadow-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 animate-in slide-in-from-bottom-2"
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
