import { useMemo } from 'react';
import type { Attachment } from '@/types/ai';
import { FileViewer } from './fileViewer/FileViewer';
import { attachmentItem } from './fileViewer/fileViewerModel';

/**
 * Which attachments the browser can render itself. Everything else keeps the
 * download-only affordance — offering a preview that immediately fails is worse
 * than not offering one. (The thread and the Files tab use the wider `isViewable`:
 * they reach the backend's Word/Excel preview, which a Jira-hosted ticket file cannot.)
 */
export const isPreviewable = (mimeType: string): boolean =>
  mimeType.startsWith('image/') ||
  mimeType === 'application/pdf' ||
  mimeType.startsWith('video/') ||
  mimeType.startsWith('audio/');

type AttachmentPreviewDialogProps = {
  /** The attachment to preview; null renders nothing (dialog closed). */
  attachment: Attachment | null;
  onClose: () => void;
  /**
   * The attachment is hosted in Jira: download it through `/api/attachments/jira/:id/download`
   * instead of the standard per-attachment endpoint. A flag, not a path, so every request path
   * this component builds is a literal the /api guard can read.
   */
  jiraHosted?: boolean;
};

const noop = () => {};

/**
 * In-app preview for ONE attachment — a PDF order confirmation, a photo of a damaged parcel —
 * without forcing a download first. The ticket screens use it; it is the shared `FileViewer`
 * with a list of one (see there for how bytes are fetched and typed).
 */
export const AttachmentPreviewDialog = ({
  attachment,
  onClose,
  jiraHosted = false,
}: AttachmentPreviewDialogProps) => {
  const items = useMemo(
    () => (attachment ? [attachmentItem(attachment, jiraHosted)] : []),
    [attachment, jiraHosted]
  );
  if (!attachment) return null;
  return <FileViewer items={items} index={0} onIndexChange={noop} onClose={onClose} />;
};
