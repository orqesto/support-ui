import { useState } from 'react';
import { AlertTriangle, Trash2, StopCircle, Database, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import systemService from '@/services/system.service';

type ConfirmDialog = {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  requiresTyping?: boolean;
  onConfirm: () => Promise<void>;
};

export const SystemManagementSettings = () => {
  const { hasPermission } = usePermissions();
  const canManageSystem = hasPermission(Permission.MANAGE_ORGANIZATION);
  const [loading, setLoading] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    open: false,
    title: '',
    description: '',
    onConfirm: async () => {},
  });

  // Permission guard - show access denied if user doesn't have permission
  if (!canManageSystem) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 dark:bg-red-950/20 rounded-lg border-2 border-red-500 dark:border-red-800 p-8 text-center">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            You don't have permission to access System Management. This section is restricted to
            organization administrators only.
          </p>
        </div>
      </div>
    );
  }

  const handleAction = (
    title: string,
    description: string,
    action: () => Promise<void>,
    confirmText?: string,
    requiresTyping = false
  ) => {
    setConfirmDialog({
      open: true,
      title,
      description,
      confirmText,
      requiresTyping,
      onConfirm: action,
    });
    setConfirmInput('');
  };

  const executeAction = async () => {
    setLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog({ ...confirmDialog, open: false });
      setNotification({ type: 'success', message: 'Action completed successfully' });
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Action failed',
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setLoading(false);
      setConfirmInput('');
    }
  };

  const handleStopQueues = () => {
    void handleAction(
      'Stop All Queues',
      'This will pause all background processing. Messages and tickets will not be processed until queues are restarted.',
      async () => {
        await systemService.stopQueues();
      }
    );
  };

  const handleClearQueues = () => {
    void handleAction(
      'Clear All Queues',
      'This will delete all pending jobs from Redis. Any unprocessed messages or tasks will be lost.',
      async () => {
        await systemService.clearQueues();
      },
      'CLEAR QUEUES',
      true
    );
  };

  const handleDeleteMessages = () => {
    const dept = selectedDepartment === 'all' ? undefined : selectedDepartment;
    const scope = dept ? `${dept} department` : 'your organization';
    void handleAction(
      `Delete ${dept ? dept.charAt(0).toUpperCase() + dept.slice(1) : 'All'} Messages`,
      `This will permanently delete all messages for ${scope}. This action cannot be undone.`,
      async () => {
        await systemService.deleteAllMessages(dept);
      },
      'DELETE MESSAGES',
      true
    );
  };

  const handleDeleteTickets = () => {
    const dept = selectedDepartment === 'all' ? undefined : selectedDepartment;
    const scope = dept ? `${dept} department` : 'your organization';
    void handleAction(
      `Delete ${dept ? dept.charAt(0).toUpperCase() + dept.slice(1) : 'All'} Tickets`,
      `This will permanently delete all tickets for ${scope}. This action cannot be undone.`,
      async () => {
        await systemService.deleteAllTickets(dept);
      },
      'DELETE TICKETS',
      true
    );
  };

  const handleDeleteKB = () => {
    const dept = selectedDepartment === 'all' ? undefined : selectedDepartment;
    const scope = dept ? `${dept} department` : 'your organization';
    void handleAction(
      `Delete ${dept ? dept.charAt(0).toUpperCase() + dept.slice(1) : 'All'} Knowledge Base`,
      `This will permanently delete all KB entries and documentation for ${scope}. This action cannot be undone.`,
      async () => {
        await systemService.deleteAllKB(dept);
      },
      'DELETE KB',
      true
    );
  };

  const handleNuclear = () => {
    void handleAction(
      'Nuclear Cleanup',
      'This will permanently delete EVERYTHING for your organization: all messages, tickets, KB entries, attachments, and clear all queues. This action cannot be undone and will reset your organization to a clean state.',
      async () => {
        await systemService.nuclearCleanup('DELETE EVERYTHING');
      },
      'DELETE EVERYTHING',
      true
    );
  };

  const canConfirm = confirmDialog.requiresTyping
    ? confirmInput === confirmDialog.confirmText
    : true;

  return (
    <div className="space-y-6">
      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-lg border ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400'
          }`}
        >
          {notification.message}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">System Management</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Dangerous system operations that affect your entire organization. Use with extreme
          caution.
        </p>
      </div>

      {/* Queue Management */}
      <div className="p-6 bg-white rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <h3 className="flex gap-2 items-center mb-4 font-semibold text-md">
          <StopCircle className="w-5 h-5 text-amber-500" />
          Queue Management
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">Stop All Queues</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pause all background processing (messages, tickets, KB processing)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleStopQueues} className="ml-4">
              Stop Queues
            </Button>
          </div>

          <div className="flex justify-between items-start pt-3 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="font-medium text-orange-600 dark:text-orange-400">Clear All Queues</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Delete all pending jobs from Redis (unprocessed work will be lost)
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearQueues} className="ml-4">
              Clear Queues
            </Button>
          </div>
        </div>
      </div>

      {/* Data Cleanup */}
      <div className="p-6 bg-white rounded-lg border border-red-200 dark:bg-gray-800 dark:border-red-900">
        <h3 className="flex gap-2 items-center mb-4 font-semibold text-md">
          <Database className="w-5 h-5 text-red-500" />
          Data Cleanup
        </h3>

        {/* Department Filter */}
        <div className="mb-4 pb-4 border-b border-red-200 dark:border-red-900">
          <ReactSelect
            label="Department Scope"
            value={selectedDepartment}
            onChange={(value) => setSelectedDepartment(value)}
            options={[
              { value: 'all', label: 'All Departments' },
              { value: 'support', label: 'Support' },
              { value: 'sales', label: 'Sales' },
              { value: 'billing', label: 'Billing' },
              { value: 'hr', label: 'HR' },
              { value: 'general', label: 'General' },
            ]}
            placeholder="Select department scope"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Filter cleanup operations by department. Select "All Departments" to affect the entire
            organization.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">Delete All Messages</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Permanently delete all messages for your organization
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDeleteMessages} className="ml-4">
              <Trash2 className="mr-1 w-4 h-4" />
              Delete Messages
            </Button>
          </div>

          <div className="flex justify-between items-start pt-3 border-t border-red-200 dark:border-red-900">
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">Delete All Tickets</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Permanently delete all tickets for your organization
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDeleteTickets} className="ml-4">
              <Trash2 className="mr-1 w-4 h-4" />
              Delete Tickets
            </Button>
          </div>

          <div className="flex justify-between items-start pt-3 border-t border-red-200 dark:border-red-900">
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                Delete All Knowledge Base
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Permanently delete all KB entries and documentation
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDeleteKB} className="ml-4">
              <Trash2 className="mr-1 w-4 h-4" />
              Delete KB
            </Button>
          </div>
        </div>
      </div>

      {/* Nuclear Zone */}
      <div className="p-6 bg-red-50 rounded-lg border-2 border-red-500 dark:bg-red-950/20 dark:border-red-800">
        <h3 className="flex gap-2 items-center mb-4 font-semibold text-red-600 text-md dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone - Nuclear Cleanup
        </h3>
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This will delete <strong>EVERYTHING</strong> for your organization:
          </p>
          <ul className="space-y-1 text-sm list-disc list-inside text-gray-700 dark:text-gray-300">
            <li>All messages and responses</li>
            <li>All tickets and comments</li>
            <li>All knowledge base entries</li>
            <li>All attachments and files</li>
            <li>All processing queues</li>
            <li>All sync checkpoints</li>
          </ul>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            This action is IRREVERSIBLE. Your organization will be reset to a clean state.
          </p>
          <Button
            variant="destructive"
            size="md"
            onClick={handleNuclear}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            <AlertTriangle className="mr-2 w-4 h-4" />
            Nuclear Cleanup - Delete Everything
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
      >
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            {confirmDialog.title}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">{confirmDialog.description}</p>

            {confirmDialog.requiresTyping && (
              <div>
                <label className="block mb-2 text-sm font-medium">
                  Type{' '}
                  <code className="px-2 py-1 bg-gray-100 rounded dark:bg-gray-800">
                    {confirmDialog.confirmText}
                  </code>{' '}
                  to confirm:
                </label>
                <Input
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  placeholder={confirmDialog.confirmText}
                  className="font-mono"
                />
              </div>
            )}

            <div className="p-3 bg-red-50 rounded border border-red-200 dark:bg-red-950/20 dark:border-red-800">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                ⚠️ This action cannot be undone!
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmDialog({ ...confirmDialog, open: false });
              setConfirmInput('');
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={executeAction} disabled={!canConfirm || loading}>
            {loading ? 'Processing...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
