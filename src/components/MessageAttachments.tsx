import { Download, Info, Paperclip } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Message } from '../types';

type MessageAttachmentsProps = {
  message: Message;
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

export const MessageAttachments = ({ message }: MessageAttachmentsProps) => {
  // Extract attachments from rawData (for emails)
  const emailAttachments = message.rawData?.attachments as
    | Array<{
        filename: string;
        contentType: string;
        size?: number;
      }>
    | undefined;

  // Don't render if no attachments
  if (!emailAttachments || emailAttachments.length === 0) {
    return null;
  }

  return (
    <div className="pt-6 border-t">
      <h3 className="flex gap-2 items-center mb-3 text-sm font-semibold text-muted-foreground">
        <Paperclip className="w-4 h-4" />
        Attachments
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
          {emailAttachments.length}
        </span>
      </h3>
      <div className="space-y-2">
        {emailAttachments.map((attachment) => (
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
      {!message.ticketId && (
        <div className="p-3 mt-3 rounded-lg border bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/20">
          <p className="flex gap-2 items-start text-xs text-amber-600 dark:text-amber-400">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Attachments will be available for download once a ticket is created from this message.
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
