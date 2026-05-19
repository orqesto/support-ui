import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Download, Eye, FileText, Image, Video, Volume2 } from 'lucide-react';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { apiClient } from '@/lib/api-client';
import { API_BASE_URL, getAuthToken } from '@/lib/config';
import type { AttachmentMetadata } from '@/types/ai';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

export type Attachment = {
  id: number;
  messageId: number | null;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  isOutgoing: boolean | null;
  createdAt: string;
  metadata?: AttachmentMetadata;
};

type MessageAttachmentsProps = {
  message: Message;
  sortedThread?: Message[];
  refreshKey?: number;
  highlightId?: number | null;
  preloadedAttachments?: Attachment[];
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const isImage = (mimeType: string) => mimeType.startsWith('image/');

const getDownloadUrl = (att: Attachment) =>
  `${API_BASE_URL}/api/attachments/${att.id}/download?token=${getAuthToken()}`;

const FileIcon = ({ mimeType }: { mimeType: string }) => {
  const cls = 'w-4 h-4 text-muted-foreground';
  if (mimeType.startsWith('image/')) return <Image className={cls} />;
  if (mimeType.startsWith('video/')) return <Video className={cls} />;
  if (mimeType.startsWith('audio/')) return <Volume2 className={cls} />;
  return <FileText className={cls} />;
};

export const MessageAttachments = ({ message, refreshKey, highlightId, preloadedAttachments }: MessageAttachmentsProps) => {
  const [attachments, setAttachments] = useState<Attachment[]>(preloadedAttachments ?? []);
  const [loading, setLoading] = useState(!preloadedAttachments);
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'error' | 'success' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  useEffect(() => {
    if (preloadedAttachments) {
      setAttachments(preloadedAttachments);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ success: boolean; data: Attachment[] }>(`/api/messages/${message.id}/attachments`)
      .then((res) => {
        if (!cancelled) setAttachments(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [message.id, refreshKey, preloadedAttachments]);

  useEffect(() => {
    if (!highlightId) return;
    setActiveHighlight(highlightId);
    const el = rowRefs.current.get(highlightId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setActiveHighlight(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const handleDownload = async (att: Attachment, inline = false) => {
    try {
      const response = await apiClient.get(`/api/attachments/${att.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      if (inline) {
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = att.originalFilename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      logger.error('Failed to download attachment:', err);
      setAlertDialog({
        open: true,
        title: 'Download Failed',
        description: 'Failed to download attachment. Please try again.',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return <p className="py-4 text-[11px] text-center text-muted-foreground">Loading attachments…</p>;
  }

  if (attachments.length === 0) {
    return <p className="py-4 text-[11px] text-center text-muted-foreground">No attachments</p>;
  }

  return (
    <div className="space-y-1">
      {attachments.map((att) => (
        <div
          key={att.id}
          ref={(el) => { if (el) rowRefs.current.set(att.id, el); else rowRefs.current.delete(att.id); }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group ${
            activeHighlight === att.id
              ? 'bg-primary/10 ring-1 ring-primary/30'
              : 'hover:bg-muted/40'
          }`}
        >
          {/* Thumbnail or icon */}
          <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center bg-muted/60 overflow-hidden">
            {isImage(att.mimeType) ? (
              <img
                src={getDownloadUrl(att)}
                alt={att.originalFilename}
                className="w-full h-full object-cover"
              />
            ) : (
              <FileIcon mimeType={att.mimeType} />
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium truncate leading-tight">{att.originalFilename}</p>
            <p className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1">
              {formatFileSize(att.size)}
              <span className="text-border">·</span>
              {att.isOutgoing ? (
                <span className="inline-flex items-center gap-0.5 text-blue-500 dark:text-blue-400">
                  <ArrowUpRight className="w-2.5 h-2.5" />Sent
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-emerald-500 dark:text-emerald-400">
                  <ArrowDownLeft className="w-2.5 h-2.5" />Received
                </span>
              )}
            </p>
          </div>

          {/* Actions — visible on hover */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {isImage(att.mimeType) && (
              <button
                onClick={() => void handleDownload(att, true)}
                title="View"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => void handleDownload(att)}
              title="Download"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

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
