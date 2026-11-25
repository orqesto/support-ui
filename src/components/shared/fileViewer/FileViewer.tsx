import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { attachmentDisplayUrl, isTiffMime } from '@/lib/attachmentUrl';
import { getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { attachmentFileService, type AttachmentPreview } from '@/services/attachmentFile.service';
import { documentFileService } from '@/services/documentFile.service';
import { useAuthStore } from '@/stores/authStore';
import { FileCard, CsvView, MarkdownView, OfficePreview, TextView } from './FileViewerParts';
import {
  TEXT_PREVIEW_MAX_BYTES,
  itemFile,
  itemKind,
  itemName,
  previewErrorMessage,
  safeBlobType,
  shownMimeType,
  type ViewerItem,
  type ViewerKind,
} from './fileViewerModel';
import { ZoomableImage } from './ZoomableImage';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** An image the browser loads itself from `url`; `ready` once it has. */
  | { status: 'image'; url: string; ready: boolean }
  | { status: 'blob'; url: string }
  | { status: 'text'; text: string }
  | { status: 'office'; preview: AttachmentPreview }
  | { status: 'card'; message: string };

const NO_PREVIEW = 'No preview is available for this file type.';

/**
 * Where the picture of an image item comes from without a fetch of our own: an inline image's
 * own proxy url, or the attachment's browser-loadable download url — the SAME url the thread
 * thumbnail used, so a picture the agent just saw is usually already in the browser's cache.
 * Jira-hosted bytes have no such url and go through apiClient instead.
 */
const directImageUrl = (item: ViewerItem, organizationId: number | null): string | null => {
  if (item.type === 'inline') return item.src;
  // A document's bytes need the workspace header and its team check: fetched, never a url.
  if (item.type === 'document' || item.jiraHosted) return null;
  // A TIFF: the display copy; an older backend's TIFF fails to load and the card offers Download.
  return attachmentDisplayUrl(item.attachment.id, organizationId, item.attachment.mimeType);
};

/** A mail attachment TIFF, shown from the backend's display copy (review 1.1.330 GAP-TIFF). */
const isTiffAttachment = (item: ViewerItem): boolean =>
  item.type === 'attachment' && !item.jiraHosted && isTiffMime(item.attachment.mimeType);

/** `display`: the bytes to SHOW (a document's TIFF as WEBP); Download asks for the original. */
const fetchItemBlob = async (item: ViewerItem, display = false): Promise<Blob | null> => {
  if (item.type === 'inline') return attachmentFileService.getInlineImageBlob(item.src);
  if (item.type === 'document') return documentFileService.getBlob(item.document.id, display);
  return attachmentFileService.getBlob(
    item.attachment.id,
    item.jiraHosted,
    display && isTiffAttachment(item)
  );
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** A blob's text — `Blob.text()` where the platform has it, FileReader where it does not. */
const blobText = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
        reader.readAsText(blob);
      });

/** How long a url handed to a new tab stays valid — long enough for that tab to load it. */
const NEW_TAB_URL_TTL_MS = 60_000;

type FileViewerProps = {
  /** Everything the agent can step through, in order. Empty renders nothing. */
  items: ViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /**
   * A documentation upload has the text the knowledge base read from it. Given this, a document
   * the viewer cannot draw (an old .doc, a type with no preview) or whose file the backend does
   * not have or serve (404: missing, or a backend older than the documentation file routes)
   * goes straight to that text; any other failure offers it on the card.
   */
  onTextFallback?: (item: ViewerItem) => void;
};

/**
 * The file viewer: one item at a time over the page, as large as the screen allows, with
 * previous/next across the whole list, Download and Open in new tab.
 *
 * ⚠️ Only the CURRENT item is fetched (and the neighbouring pictures warmed); a thread with
 * forty photos costs one photo per step. Object urls are revoked when the item changes.
 *
 * Closing unmounts only this dialog: the page behind is never re-rendered or scrolled, and
 * focus goes back to what opened the viewer without scrolling to it.
 */
export const FileViewer = ({
  items,
  index,
  onIndexChange,
  onClose,
  onTextFallback,
}: FileViewerProps) => {
  const organizationId = useAuthStore((state) => state.selectedOrganizationId) ?? null;
  const count = items.length;
  const current = count > 0 ? items[Math.min(Math.max(index, 0), count - 1)] : null;
  const position = current ? items.indexOf(current) : -1;
  const kind: ViewerKind | null = current ? itemKind(current) : null;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  const go = useCallback(
    (step: 1 | -1) => {
      const next = position + step;
      if (next >= 0 && next < count) onIndexChange(next);
    },
    [position, count, onIndexChange]
  );

  // Focus returns to the opener on close — without scrolling the thread to it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // ←/→ step through the list. Not while a media element or a field has the keys (a video uses
  // the arrows to seek). Escape is the Dialog's own (topmost layer only).
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, video, audio, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [current, go]);

  // Load the current item — and only it.
  const currentKey = current?.key;
  useEffect(() => {
    if (!current || !kind) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    const textFallback = current.type === 'document' ? onTextFallback : undefined;
    const fail = (err: unknown) => {
      logger.error('Failed to load file preview:', err);
      if (cancelled) return;
      if (textFallback && getErrorStatus(err) === 404) {
        textFallback(current);
        return;
      }
      setLoaded({ status: 'error', message: previewErrorMessage(err) });
    };
    const file = itemFile(current);

    if (kind === 'image') {
      const direct = directImageUrl(current, organizationId);
      if (direct) {
        setLoaded({ status: 'image', url: direct, ready: false });
        return;
      }
    }
    if (kind === 'other' && textFallback) {
      textFallback(current);
      return;
    }
    if (kind === 'other' || (!file && kind !== 'image')) {
      setLoaded({ status: 'card', message: NO_PREVIEW });
      return;
    }
    if ((kind === 'docx' || kind === 'xlsx') && current.type !== 'inline') {
      if (current.type === 'attachment' && current.jiraHosted) {
        setLoaded({ status: 'card', message: NO_PREVIEW });
        return;
      }
      setLoaded({ status: 'loading' });
      (current.type === 'document'
        ? documentFileService.getPreview(current.document.id)
        : attachmentFileService.getPreview(current.attachment.id)
      )
        .then((preview) => {
          if (!cancelled) setLoaded({ status: 'office', preview });
        })
        .catch(fail);
      return () => {
        cancelled = true;
      };
    }
    const textual = kind === 'text' || kind === 'csv' || kind === 'markdown';
    if (textual && (file?.size ?? 0) > TEXT_PREVIEW_MAX_BYTES) {
      setLoaded({
        status: 'card',
        message: 'This file is too large to preview. Download it to open it.',
      });
      return;
    }

    setLoaded({ status: 'loading' });
    fetchItemBlob(current, true)
      .then(async (blob) => {
        if (cancelled) return;
        if (!blob) throw new Error('No bytes for this item');
        if (textual) {
          const text = await blobText(blob);
          if (!cancelled) setLoaded({ status: 'text', text });
          return;
        }
        // Re-typed with the file's OWN type: the endpoint serves generic bytes, and an object
        // url without `application/pdf` makes the browser download instead of render.
        const typed = new Blob([blob], { type: safeBlobType(shownMimeType(current), kind) });
        createdUrl = URL.createObjectURL(typed);
        setLoaded(
          kind === 'image'
            ? { status: 'image', url: createdUrl, ready: false }
            : { status: 'blob', url: createdUrl }
        );
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // The item is identified by its key; the object itself may be re-created by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, kind, organizationId, onTextFallback]);

  // Warm the neighbouring PICTURES only — never a document or a video.
  useEffect(() => {
    if (position < 0) return;
    for (const neighbour of [items[position - 1], items[position + 1]]) {
      if (!neighbour || itemKind(neighbour) !== 'image') continue;
      const url = directImageUrl(neighbour, organizationId);
      if (url) new Image().src = url;
    }
  }, [items, position, organizationId]);

  if (!current || !kind) return null;
  const name = itemName(current);
  const mimeType = shownMimeType(current);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await fetchItemBlob(current);
      if (blob) saveBlob(blob, name);
      else
        window.open(directImageUrl(current, organizationId) ?? '', '_blank', 'noopener,noreferrer');
    } catch (err) {
      logger.error('Failed to download file:', err);
      setLoaded({ status: 'error', message: 'The download failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const openInNewTab = async () => {
    if (current.type === 'inline') {
      window.open(current.src, '_blank', 'noopener,noreferrer');
      return;
    }
    // Opened NOW, inside the click, so a popup blocker lets it through; pointed at the bytes
    // once they arrive. The bytes are typed by `safeBlobType`: a customer's html or svg must
    // never become a live page in our origin — those download instead.
    const tab = window.open('', '_blank');
    try {
      const existing = loadedRef.current;
      let url: string;
      if (existing.status === 'blob') {
        url = existing.url;
      } else {
        const blob = await fetchItemBlob(current, true);
        if (!blob) throw new Error('No bytes for this item');
        // A TIFF's display copy is typed as what arrived: WEBP, or an older backend's TIFF.
        const type =
          isTiffAttachment(current) && blob.type.startsWith('image/') ? blob.type : mimeType;
        url = URL.createObjectURL(new Blob([blob], { type: safeBlobType(type, kind) }));
        setTimeout(() => URL.revokeObjectURL(url), NEW_TAB_URL_TTL_MS);
      }
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
    } catch (err) {
      tab?.close();
      logger.error('Failed to open file in a new tab:', err);
      setLoaded({ status: 'error', message: previewErrorMessage(err) });
    }
  };

  const card = (message: string, tone: 'neutral' | 'error') => (
    <FileCard
      name={name}
      size={itemFile(current)?.size ?? null}
      message={message}
      tone={tone}
      onDownload={() => void download()}
      onOpenInTab={() => void openInNewTab()}
      extraAction={
        current.type === 'document' && onTextFallback
          ? { label: 'Show the text read from it', onClick: () => onTextFallback(current) }
          : undefined
      }
    />
  );

  const renderBody = () => {
    switch (loaded.status) {
      case 'loading':
        return (
          <div
            className="flex h-full items-center justify-center"
            role="status"
            aria-label="Loading"
          >
            <Spinner size={28} />
          </div>
        );
      case 'error':
        return card(loaded.message, 'error');
      case 'card':
        return card(loaded.message, 'neutral');
      case 'image':
        return (
          <>
            <ZoomableImage
              key={current.key}
              src={loaded.url}
              alt={name}
              hidden={!loaded.ready}
              onLoad={() =>
                setLoaded((state) => (state.status === 'image' ? { ...state, ready: true } : state))
              }
              onError={() =>
                setLoaded({
                  status: 'error',
                  message:
                    'This picture could not be shown — it may be damaged or missing. Download it to try.',
                })
              }
              onBackgroundClick={onClose}
              onSwipe={go}
            />
            {!loaded.ready && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                role="status"
                aria-label="Loading"
              >
                <Spinner size={28} />
              </div>
            )}
          </>
        );
      case 'text':
        if (kind === 'csv') return <CsvView text={loaded.text} />;
        return kind === 'markdown' ? (
          <MarkdownView text={loaded.text} />
        ) : (
          <TextView text={loaded.text} />
        );
      case 'office':
        return <OfficePreview preview={loaded.preview} />;
      case 'blob':
        if (kind === 'pdf') {
          return (
            <iframe src={loaded.url} title={name} className="w-full h-full border-0 bg-card" />
          );
        }
        if (kind === 'video') {
          return (
            <div className="flex h-full items-center justify-center p-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- customer-sent file; no captions exist */}
              <video src={loaded.url} controls className="max-w-full max-h-full" />
            </div>
          );
        }
        return (
          <div className="flex h-full items-center justify-center p-4">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- customer-sent file; no captions exist */}
            <audio src={loaded.url} controls className="w-full max-w-md" />
          </div>
        );
    }
  };

  const navButton =
    'absolute top-1/2 -translate-y-1/2 z-10 rounded-full border border-border bg-card/90 shadow-sm w-11 h-11';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="full"
      className="flex flex-col h-[95vh] overflow-hidden max-sm:mx-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
    >
      <div
        data-testid="file-viewer"
        className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card max-sm:pt-[max(0.375rem,env(safe-area-inset-top))]"
      >
        <div className="flex-1 min-w-0 px-1">
          <h2 className="font-display text-sm font-medium truncate text-foreground" title={name}>
            {name}
          </h2>
          {count > 1 && (
            <p className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
              {position + 1} of {count}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void download()}
          isLoading={busy}
          aria-label="Download"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void openInNewTab()}
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
      <div className="relative flex-1 min-h-0 bg-sunken">
        {renderBody()}
        {count > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous file"
              title="Previous (←)"
              disabled={position <= 0}
              onClick={() => go(-1)}
              className={`${navButton} left-2`}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next file"
              title="Next (→)"
              disabled={position >= count - 1}
              onClick={() => go(1)}
              className={`${navButton} right-2`}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
};
