import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Download, FileText, Image, Info, Paperclip, Video, Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AttachmentRelevanceIndicator } from './AttachmentRelevanceIndicator';
import { apiClient } from '@/lib/api-client';
import { API_BASE_URL, getAuthToken } from '@/lib/config';
import type { AttachmentMetadata } from '@/types/ai';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

type MessageAttachmentsProps = {
  message: Message;
  sortedThread?: Message[];
  refreshKey?: number;
};

type Attachment = {
  id: number;
  messageId: number | null;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  isOutgoing: boolean | null;
  metadata?: AttachmentMetadata;
};

type ApiResponse = {
  success: boolean;
  data: Attachment[];
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (mimeType.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (mimeType.startsWith('audio/')) return <Volume2 className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
};

type DbAttachmentRowProps = {
  attachment: Attachment;
};

const DbAttachmentRow = ({ attachment }: DbAttachmentRowProps) => (
  <div className="flex justify-between items-center p-3 rounded-lg border transition-colors bg-muted/50 hover:bg-muted">
    <div className="flex gap-3 items-center min-w-0">
      <div className="p-2 rounded bg-blue-500/10">
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
        href={`${API_BASE_URL}/api/attachments/${attachment.id}/download?token=${getAuthToken()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors whitespace-nowrap"
      >
        <Download className="w-3 h-3" />
        Download
      </a>
    </div>
  </div>
);

type EmailAttachment = { filename: string; contentType: string; size?: number };

type EmailAttachmentRowProps = {
  attachment: EmailAttachment;
  ticketId?: number;
};

const EmailAttachmentRow = ({ attachment, ticketId }: EmailAttachmentRowProps) => (
  <div className="flex justify-between items-center p-3 rounded-lg border transition-colors bg-muted/50 hover:bg-muted">
    <div className="flex gap-3 items-center min-w-0">
      <div className="p-2 rounded bg-blue-500/10">
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
    {ticketId && (
      <Link
        to={`/tickets?id=${ticketId}`}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors whitespace-nowrap"
      >
        <Download className="w-3 h-3" />
        View in Ticket
      </Link>
    )}
  </div>
);

type SectionProps = {
  label: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
};

const AttachmentSection = ({ label, icon, count, children }: SectionProps) => (
  <div className="space-y-2">
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icon}
      <span>{label}</span>
      <span className="px-1.5 py-0.5 bg-muted rounded-full text-xs">{count}</span>
    </div>
    {children}
  </div>
);

export const MessageAttachments = ({ message, sortedThread, refreshKey }: MessageAttachmentsProps) => {
  const [dbAttachments, setDbAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, [message.id, refreshKey]);

  // Collect email attachments from all thread messages, tagged with direction
  const allEmailAttachments: { attachment: EmailAttachment; isOutgoing: boolean; ticketId?: number }[] = [];
  const threadMessages = sortedThread ?? [message];
  for (const msg of threadMessages) {
    const emailAtts = msg.rawData?.attachments as EmailAttachment[] | undefined;
    if (emailAtts?.length) {
      for (const att of emailAtts) {
        allEmailAttachments.push({
          attachment: att,
          isOutgoing: msg.isOutgoing === true,
          ticketId: msg.ticketId ?? undefined,
        });
      }
    }
  }

  const receivedDb = dbAttachments.filter((a) => !a.isOutgoing);
  const sentDb = dbAttachments.filter((a) => a.isOutgoing);
  const receivedEmail = allEmailAttachments.filter((a) => !a.isOutgoing);
  const sentEmail = allEmailAttachments.filter((a) => a.isOutgoing);

  const receivedCount = receivedDb.length + receivedEmail.length;
  const sentCount = sentDb.length + sentEmail.length;
  const totalCount = receivedCount + sentCount;

  // No-ticket warning applies only to received email attachments
  const noTicketReceivedEmail = receivedEmail.filter((a) => !a.ticketId);

  if (totalCount === 0 && !loading) return null;

  return (
    <div className="pt-6 border-t">
      <h3 className="flex gap-2 items-center mb-3 text-sm font-semibold text-muted-foreground">
        <Paperclip className="w-4 h-4" />
        Attachments
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
          {totalCount}
        </span>
      </h3>

      <div className="space-y-4">
        {/* Received */}
        {receivedCount > 0 && (
          <AttachmentSection
            label="Received"
            icon={<ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />}
            count={receivedCount}
          >
            <div className="space-y-2">
              {receivedDb.map((a) => <DbAttachmentRow key={a.id} attachment={a} />)}
              {receivedEmail.map((a) => (
                <EmailAttachmentRow
                  key={a.attachment.filename}
                  attachment={a.attachment}
                  ticketId={a.ticketId}
                />
              ))}
            </div>
          </AttachmentSection>
        )}

        {/* Sent */}
        {sentCount > 0 && (
          <AttachmentSection
            label="Sent"
            icon={<ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />}
            count={sentCount}
          >
            <div className="space-y-2">
              {sentDb.map((a) => <DbAttachmentRow key={a.id} attachment={a} />)}
              {sentEmail.map((a) => (
                <EmailAttachmentRow
                  key={a.attachment.filename}
                  attachment={a.attachment}
                  ticketId={a.ticketId}
                />
              ))}
            </div>
          </AttachmentSection>
        )}

      </div>

      {noTicketReceivedEmail.length > 0 && (
        <div className="p-3 mt-3 rounded-lg border bg-amber-500/10 border-amber-500/20">
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
