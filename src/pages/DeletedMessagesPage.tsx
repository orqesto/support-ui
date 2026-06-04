import { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertCircle, RefreshCw } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

type DeletedMessage = {
  id: number;
  sender: string;
  subject: string | null;
  channel: string;
  departmentId: number | null;
  deletedAt: string | null;
  createdAt: string;
};

type DeletedMessagesResponse = {
  messages: DeletedMessage[];
  count: number;
  limit: number;
  offset: number;
};

const LIMIT = 25;

export const DeletedMessagesPage = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  const [messages, setMessages] = useState<DeletedMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [permanentDeleteResult, setPermanentDeleteResult] = useState<string | null>(null);
  const [confirmPermanentDeleteOpen, setConfirmPermanentDeleteOpen] = useState(false);

  const fetchMessages = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * LIMIT;
      const response = await apiClient.get<{ data: DeletedMessagesResponse }>(
        `/api/messages/deleted?limit=${LIMIT}&offset=${offset}`
      );
      setMessages(response.data.data.messages);
      setTotal(response.data.data.count);
    } catch (err) {
      logger.error('Error fetching deleted messages:', err);
      setError('Failed to load deleted messages.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMessages(currentPage);
  }, [currentPage, fetchMessages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRestore = async (messageId: number) => {
    setRestoringId(messageId);
    setRestoreError(null);
    try {
      await apiClient.post(`/api/messages/${messageId}/restore`);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      logger.error('Error restoring message:', err);
      setRestoreError(`Failed to restore message #${messageId}.`);
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!isAdmin) return;
    setIsPermanentDeleting(true);
    setPermanentDeleteResult(null);
    try {
      const response = await apiClient.delete<{
        data: { deletedCount: number; olderThanDays: number };
      }>(`/api/messages/deleted/permanent?olderThanDays=${olderThanDays}`);
      const { deletedCount } = response.data.data;
      setPermanentDeleteResult(
        `Permanently deleted ${deletedCount} message${deletedCount !== 1 ? 's' : ''} older than ${olderThanDays} days.`
      );
      await fetchMessages(1);
      setCurrentPage(1);
    } catch (err) {
      logger.error('Error permanently deleting messages:', err);
      setPermanentDeleteResult('Failed to permanently delete messages.');
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-6 w-full max-w-7xl">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="flex gap-2 items-center text-2xl font-bold">
              <Trash2 className="w-7 h-7" />
              Deleted Messages
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Soft-deleted messages that can be restored
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMessages(currentPage)}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="flex gap-3 items-start p-4 rounded-lg border border-destructive/30 bg-destructive/10">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {restoreError && (
          <div className="flex gap-3 items-start p-4 rounded-lg border border-destructive/30 bg-destructive/10">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{restoreError}</p>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 w-10 h-10 rounded-full border-b-2 animate-spin border-primary" />
                <p className="text-sm text-muted-foreground">Loading deleted messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center">
                <Trash2 className="mx-auto mb-4 w-12 h-12 text-muted-foreground/30" />
                <p className="text-muted-foreground">No deleted messages found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 font-medium text-left text-muted-foreground">
                          Subject / Sender
                        </th>
                        <th className="px-4 py-3 font-medium text-left text-muted-foreground">
                          Channel
                        </th>
                        <th className="px-4 py-3 font-medium text-left text-muted-foreground">
                          Department
                        </th>
                        <th className="px-4 py-3 font-medium text-left text-muted-foreground">
                          Deleted At
                        </th>
                        <th className="px-4 py-3 font-medium text-right text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {messages.map((msg) => (
                        <tr key={msg.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium truncate max-w-xs">
                              {msg.subject ?? '(no subject)'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {msg.sender}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize text-muted-foreground">{msg.channel}</span>
                          </td>
                          <td className="px-4 py-3">
                            <DepartmentBadge departmentId={msg.departmentId} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {msg.deletedAt ? formatDate(msg.deletedAt) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestore(msg.id)}
                              disabled={restoringId === msg.id}
                            >
                              {restoringId === msg.id ? (
                                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4 mr-1.5" />
                              )}
                              Restore
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      total={total}
                      limit={LIMIT}
                      onPageChange={handlePageChange}
                      loading={isLoading}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Permanent Deletion (Admin)</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Permanently removes soft-deleted messages older than the specified number of days.
                This action cannot be undone.
              </p>
              <div className="flex gap-3 items-center">
                <label className="text-sm text-muted-foreground whitespace-nowrap">
                  Older than
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={olderThanDays}
                  onChange={(event) =>
                    setOlderThanDays(Math.max(1, parseInt(event.target.value, 10) || 1))
                  }
                  className="px-3 py-1.5 w-24 text-sm rounded-md border border-input bg-background"
                />
                <label className="text-sm text-muted-foreground">days</label>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmPermanentDeleteOpen(true)}
                  disabled={isPermanentDeleting}
                >
                  {isPermanentDeleting ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Permanently Delete
                </Button>
              </div>
              {permanentDeleteResult && (
                <p className="mt-2 text-sm text-muted-foreground">{permanentDeleteResult}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <ConfirmDialog
        open={confirmPermanentDeleteOpen}
        onOpenChange={setConfirmPermanentDeleteOpen}
        onConfirm={() => void handlePermanentDelete()}
        title="Permanently delete messages?"
        description={`This will permanently delete all soft-deleted messages older than ${olderThanDays} days. This action cannot be undone.`}
        confirmText="Permanently delete"
        variant="danger"
      />
    </Layout>
  );
};
