import { useEffect, useState } from 'react';
import { Download, FileText, Image, Info, Paperclip, Video, Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AttachmentRelevanceIndicator } from './AttachmentRelevanceIndicator';
import { apiClient } from '@/lib/api-client';
import type { AttachmentMetadata } from '@/types/ai';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

type MessageAttachmentsProps = {
  message: Message;
};

type Attachment = {
  id: number;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  metadata?: AttachmentMetadata;
};

type ApiResponse = {
  success: boolean;
  data: Attachment[];
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) {
    return 'Unknown size';
  }
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) {
    return <Image className="w-4 h-4" />;
  }
  if (mimeType.startsWith('video/')) {
    return <Video className="w-4 h-4" />;
  }
  if (mimeType.startsWith('audio/')) {
    return <Volume2 className="w-4 h-4" />;
  }
  return <FileText className="w-4 h-4" />;
};

export const MessageAttachments = ({ message }: MessageAttachmentsProps) => {
  const [dbAttachments, setDbAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch database attachments (Telegram, uploaded files, etc.)
  useEffect(() => {
    const fetchAttachments = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<ApiResponse>(
          `/api/messages/${message.id}/attachments`
        );
        setDbAttachments(response.data.data ?? []);
      } catch (error) {
        logger.error('Failed to fetch attachments:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchAttachments();
  }, [message.id]);

  // Extract attachments from rawData (for emails with inline attachments)
  const emailAttachments = message.rawData?.attachments as
    | Array<{
        filename: string;
        contentType: string;
        size?: number;
      }>
    | undefined;

  const totalCount = (emailAttachments?.length ?? 0) + dbAttachments.length;

  // Don't render if no attachments
  if (totalCount === 0 && !loading) {
    return null;
  }

  return (
    <div className="pt-6 border-t">
      <h3 className="flex gap-2 items-center mb-3 text-sm font-semibold text-muted-foreground">
        <Paperclip className="w-4 h-4" />
        Attachments
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
          {totalCount}
        </span>
      </h3>
      <div className="space-y-2">
        {/* Database attachments (Telegram, uploaded files) */}
        {dbAttachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex justify-between items-center p-3 rounded-lg border transition-colors bg-muted/50 hover:bg-muted"
          >
            <div className="flex gap-3 items-center min-w-0">
              <div className="p-2 rounded bg-blue-500/10 dark:bg-blue-500/10">
                <div className="text-blue-600 dark:text-blue-400">
                  {getFileIcon(attachment.mimeType)}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{attachment.originalFilename}</p>
                <div className="flex gap-2 items-center text-xs text-muted-foreground">
                  <span>{attachment.mimeType}</span>
                  <span>•</span>
                  <span>{formatFileSize(attachment.size)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-center shrink-0">
              {attachment.metadata?.relevanceToOrg && (
                <AttachmentRelevanceIndicator relevance={attachment.metadata.relevanceToOrg} />
              )}
              <a
                href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}${attachment.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                Download
              </a>
            </div>
          </div>
        ))}

        {/* Email attachments (from rawData) */}
        {emailAttachments?.map((attachment) => (
          <div
            key={attachment.filename}
            className="flex justify-between items-center p-3 rounded-lg border transition-colors bg-muted/50 hover:bg-muted"
          >
            <div className="flex gap-3 items-center min-w-0">
              <div className="p-2 rounded bg-blue-500/10 dark:bg-blue-500/10">
                <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                <div className="flex gap-2 items-center text-xs text-muted-foreground">
                  <span>{attachment.contentType}</span>
                  {attachment.size && (
                    <>
                      <span>•</span>
                      <span>{formatFileSize(attachment.size)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {message.ticketId && (
              <Link
                to={`/tickets?id=${message.ticketId}`}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                View in Ticket
              </Link>
            )}
          </div>
        ))}
      </div>
      {!message.ticketId && emailAttachments && emailAttachments.length > 0 && (
        <div className="p-3 mt-3 rounded-lg border bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/20">
          <p className="flex gap-2 items-start text-xs text-amber-600 dark:text-amber-400">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Email attachments will be available for download once a ticket is created from this
              message.
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
