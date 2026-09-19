import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/config';
import type { Attachment } from '@/types/ai';

/**
 * One attachment in a thread bubble — a picture when it is a picture.
 *
 * ⛔ Why this exists: an attached photo rendered as a paperclip and a filename, so an agent
 * could not see what the customer had sent without downloading it. The FILES tab has shown
 * thumbnails all along (`MessageAttachments.tsx`), so the thread was the odd one out, and the
 * thread is where the conversation is actually read.
 *
 * 🔑 Measured before building it, on staging workspace 21: of 50 conversations, **17 carry
 * attachments and 24 of those are images** — the largest group. Sizes: median 137KB, 18 of 24
 * under 500KB, three above 2MB, largest 4.1MB.
 *
 * Those numbers decide the design. There is no image library in the backend — adding one means
 * a native dependency in a container already tuned around a 1522MB heap ceiling — so there is
 * no server-side thumbnail to ask for, and the original bytes are what we have. `loading="lazy"`
 * is therefore load-bearing rather than decoration: nothing is fetched until the agent scrolls
 * to it, and at a 137KB median that is cheap. The 4.1MB outlier costs 4.1MB once, when someone
 * actually looks at it.
 *
 * ⚠️ One of the 24 reported a size of ZERO bytes, and a missing file answers 404. Either would
 * render as a broken image, so a failure falls back to the filename chip that was there before:
 * the worst case is what everyone already had, never a broken frame.
 */
export const ThreadAttachmentChip = ({
  attachment,
  onOpen,
  className,
}: {
  attachment: Attachment;
  onOpen?: (id: number) => void;
  /** The bubble's own colours — agent and customer sides differ. */
  className: string;
}) => {
  const [previewFailed, setPreviewFailed] = useState(false);
  const isImage = (attachment.mimeType ?? '').toLowerCase().startsWith('image/');
  const showPreview = isImage && !previewFailed;

  if (!showPreview) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => onOpen?.(attachment.id)}
        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 h-auto rounded transition-colors ${className}`}
      >
        <Paperclip className="w-2.5 h-2.5" />
        {attachment.originalFilename}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen?.(attachment.id)}
      // `h-auto` and no padding: the picture is the control, not a label with an icon.
      className={`flex flex-col items-start gap-0.5 p-1 h-auto rounded transition-colors ${className}`}
      // The filename still has to be reachable for a screen reader and on hover, because the
      // picture replaces the text that used to carry it.
      aria-label={attachment.originalFilename}
      title={attachment.originalFilename}
    >
      <img
        src={`${API_BASE_URL}/api/attachments/${attachment.id}/download`}
        alt={attachment.originalFilename}
        loading="lazy"
        decoding="async"
        onError={() => setPreviewFailed(true)}
        className="max-h-24 max-w-[12rem] rounded object-contain"
      />
      <span className="text-[10px] max-w-[12rem] truncate">{attachment.originalFilename}</span>
    </Button>
  );
};
