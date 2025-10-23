/* eslint-disable no-console */
import { useState, useEffect, useCallback } from 'react';
import { Paperclip, Download, File, Trash2, Eye, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { API_BASE_URL, getAuthToken } from '@/lib/config';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '../lib/socketManager';
import { commentsService, type Attachment } from '../services/comments.service';
import { AlertDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { Dialog, DialogHeader, DialogTitle } from './ui/Dialog';

type TicketAttachmentsProps = {
  ticketId: number;
};

export const TicketAttachments = ({ ticketId }: TicketAttachmentsProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ id: number; name: string } | null>(
    null
  );

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const fetchAttachments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await commentsService.getTicketAttachments(ticketId);
      if (response.success && response.data) {
        setAttachments(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch ticket attachments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchAttachments().catch((error) => {
      console.error('Failed to fetch attachments:', error);
    });

    // Set up WebSocket to listen for updates
    getSocket();

    const handleUpdate = (data: unknown) => {
      const eventData = data as { ticketId: number };
      if (eventData.ticketId === ticketId) {
        // eslint-disable-next-line no-console
        console.log('📎 Attachments updated via WebSocket');
        fetchAttachments().catch((error) => {
          console.error('Failed to fetch attachments:', error);
        });
      }
    };

    subscribeToEvent('ticket:comments:updated', handleUpdate);

    return () => {
      unsubscribeFromEvent('ticket:comments:updated', handleUpdate);
      releaseSocket();
    };
  }, [ticketId, fetchAttachments]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (isLoading) {
    return <div className="py-4 text-sm text-muted-foreground">Loading attachments...</div>;
  }

  if (attachments.length === 0) {
    return null; // Don't show section if no attachments
  }

  const getAttachmentUrl = (attachment: Attachment) => {
    const token = getAuthToken();

    // If it's a Jira attachment (has externalId AND starts with https://), use the proxy endpoint
    if (attachment.externalId && attachment.url.startsWith('http')) {
      return `${API_BASE_URL}/api/attachments/jira/${attachment.id}/download?token=${token}`;
    }

    // Otherwise, it's a local file (from email or app) - serve directly
    return `${API_BASE_URL}${attachment.url}`;
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const getAttachmentSource = (attachment: Attachment) => {
    // If URL is external (Jira URL), it came from Jira originally
    if (attachment.url.startsWith('http')) {
      return 'Jira';
    }
    // If local file with email- prefix, came from email
    if (attachment.url.includes('email-')) {
      return 'Email';
    }
    // Otherwise, uploaded via app
    return 'Uploaded';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();

      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      await apiClient.post(`/api/tickets/${ticketId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSelectedFiles([]);
      await fetchAttachments(); // Refresh list
    } catch (error) {
      console.error('Failed to upload attachments:', error);
      setAlertDialog({
        open: true,
        title: 'Upload Failed',
        description: 'Failed to upload attachments. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteClick = (attachmentId: number, filename: string) => {
    setAttachmentToDelete({ id: attachmentId, name: filename });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!attachmentToDelete) {
      return;
    }

    console.log('Deleting attachment:', attachmentToDelete);

    try {
      await apiClient.delete(`/api/attachments/${attachmentToDelete.id}`);
      console.log('Delete successful');

      setDeleteDialogOpen(false);
      setAttachmentToDelete(null);
      await fetchAttachments(); // Refresh list
    } catch (error: unknown) {
      console.error('Failed to delete attachment:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to delete attachment. Please try again.';
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: errorMsg,
        variant: 'error',
      });
      setDeleteDialogOpen(false);
      setAttachmentToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-6 border-t">
        <p className="text-sm text-muted-foreground">Loading attachments...</p>
      </div>
    );
  }

  if (attachments.length === 0 && selectedFiles.length === 0) {
    return null; // Don't show section if no attachments
  }

  return (
    <div className="pt-6 border-t">
      <div className="flex justify-between items-center mb-4">
        <h3 className="flex gap-2 items-center text-base font-semibold">
          <Paperclip className="w-4 h-4" />
          Attachments
          <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            {attachments.length}
          </span>
        </h3>

        {/* Upload Actions */}
        <div className="flex gap-2 items-center">
          <label
            className="p-2 text-gray-600 rounded cursor-pointer hover:bg-gray-100"
            title="Add attachment"
          >
            <Plus className="w-4 h-4" />
            <input type="file" multiple onChange={handleFileSelect} className="hidden" />
          </label>
        </div>
      </div>

      {/* Upload Progress */}
      {selectedFiles.length > 0 && (
        <div className="p-3 mb-3 bg-blue-50 rounded-md border border-blue-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-blue-900">{selectedFiles.length} file(s) selected</span>
            <Button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {attachments.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-2 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  Size
                </th>
                <th className="px-4 py-2 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                  Date added
                </th>
                <th className="px-4 py-2 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attachments.map((attachment) => (
                <tr key={attachment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center">
                      {isImage(attachment.mimeType) ? (
                        <img
                          src={getAttachmentUrl(attachment)}
                          alt={attachment.originalFilename}
                          className="object-cover w-10 h-10 rounded"
                        />
                      ) : (
                        <File className="w-10 h-10 text-gray-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {attachment.originalFilename}
                        </p>
                        <span className="text-xs text-gray-500">
                          {getAttachmentSource(attachment)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatFileSize(attachment.size)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(attachment.createdAt).toLocaleString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end items-center">
                      {isImage(attachment.mimeType) && (
                        <Button
                          onClick={() => window.open(getAttachmentUrl(attachment), '_blank')}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <a
                        href={getAttachmentUrl(attachment)}
                        download={attachment.originalFilename}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>

                      {/* Only show delete for non-Jira attachments (local uploads and email) */}
                      {!attachment.url.startsWith('http') && (
                        <Button
                          onClick={() =>
                            handleDeleteClick(attachment.id, attachment.originalFilename)
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Attachment</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <p className="mb-4 text-sm text-gray-600">
            Are you sure you want to delete &quot;{attachmentToDelete?.name}&quot;?
            {attachmentToDelete &&
              attachments.find((a) => a.id === attachmentToDelete.id)?.externalId && (
                <span className="block mt-2 font-medium text-red-600">
                  This will also delete the file from Jira.
                </span>
              )}
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setAttachmentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
