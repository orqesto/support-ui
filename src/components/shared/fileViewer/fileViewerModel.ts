import { getErrorStatus } from '@/lib/errorMessages';
import type { Attachment } from '@/types/ai';

/**
 * One thing the file viewer can show: a stored attachment, or an image that sits inside a
 * message's text (its `src` is already the browser-loadable proxy url the bubble rendered).
 */
export type ViewerItem =
  | {
      type: 'attachment';
      /** Stable within one opened list: `att:<id>`. */
      key: string;
      attachment: Attachment;
      /** Bytes live in Jira: downloaded through the Jira endpoint, no server-side preview. */
      jiraHosted?: boolean;
    }
  | {
      type: 'inline';
      key: string;
      src: string;
      name: string;
    };

export type ViewerKind =
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'text'
  | 'csv'
  | 'docx'
  | 'xlsx'
  | 'other';

export const attachmentItem = (attachment: Attachment, jiraHosted = false): ViewerItem => ({
  type: 'attachment',
  key: `att:${attachment.id}`,
  attachment,
  jiraHosted,
});

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** A mime that says nothing about the bytes — the filename is the better witness then. */
const isGenericMime = (mime: string): boolean =>
  mime === '' ||
  mime === 'application/octet-stream' ||
  mime === 'binary/octet-stream' ||
  mime === 'application/binary' ||
  mime === 'application/unknown';

const EXTENSION_KINDS: Record<string, ViewerKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  avif: 'image',
  pdf: 'pdf',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  txt: 'text',
  log: 'text',
  csv: 'csv',
  docx: 'docx',
  xlsx: 'xlsx',
};

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
};

/**
 * What the viewer does with a file. Decided by mime type, and by the filename extension only
 * when the mime is generic — the same rule the backend preview endpoint uses, so a file the
 * viewer sends to `/preview` is one the endpoint agrees it can read.
 *
 * Old `.doc`/`.xls` are deliberately `other`: nothing in the stack reads them (owner decision).
 */
export const viewerKindOf = (mimeType: string | null | undefined, filename = ''): ViewerKind => {
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (isGenericMime(mime)) return EXTENSION_KINDS[extensionOf(filename)] ?? 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'text/csv' || mime === 'application/csv') return 'csv';
  if (mime === 'text/plain') return extensionOf(filename) === 'csv' ? 'csv' : 'text';
  if (mime === DOCX_MIME) return 'docx';
  if (mime === XLSX_MIME) return 'xlsx';
  return 'other';
};

export const itemKind = (item: ViewerItem): ViewerKind =>
  item.type === 'inline'
    ? 'image'
    : viewerKindOf(item.attachment.mimeType, item.attachment.originalFilename);

export const itemName = (item: ViewerItem): string =>
  item.type === 'inline' ? item.name : item.attachment.originalFilename;

/** Anything the viewer can do better than the "no preview" card for. */
export const isViewable = (mimeType: string | null | undefined, filename = ''): boolean =>
  viewerKindOf(mimeType, filename) !== 'other';

/**
 * The type an attachment's bytes may carry when the BROWSER is asked to show them (an object
 * url opened in a tab, an iframe). Customer bytes must never become an active document in our
 * origin: html, svg, xml and script would run with the console's session. Everything outside
 * this list is handed over as `application/octet-stream`, which the browser downloads.
 */
export const safeBlobType = (mimeType: string | null | undefined, kind: ViewerKind): string => {
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'image' && mime.startsWith('image/') && mime !== 'image/svg+xml') return mime;
  if ((kind === 'video' || kind === 'audio') && /^(video|audio)\//.test(mime)) return mime;
  if (kind === 'text' || kind === 'csv') return 'text/plain';
  return 'application/octet-stream';
};

/** Text files bigger than this are not read into the page; the card offers Download. */
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
/** CSV rows rendered as a table — the rest is a "first N rows" notice. */
export const CSV_MAX_ROWS = 500;

/**
 * A small RFC-4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes.
 * Enough to SHOW a csv; it is not an importer. Stops at `maxRows`.
 */
export const parseCsv = (
  text: string,
  maxRows = CSV_MAX_ROWS
): { rows: string[][]; truncated: boolean } => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;
  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };
  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') quoted = false;
      else field += char;
      index += 1;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      pushRow();
      if (rows.length >= maxRows) {
        return { rows, truncated: index + 1 < text.length };
      }
    } else field += char;
    index += 1;
  }
  if (field !== '' || row.length > 0) pushRow();
  return { rows, truncated: false };
};

/**
 * The words an agent sees when a preview fails, by the backend's status. Every one is followed
 * by a Download button, so each says what is wrong rather than only that something is.
 */
export const previewErrorMessage = (err: unknown): string => {
  switch (getErrorStatus(err)) {
    case 413:
      return 'This file is too large to preview (over 15 MB). Download it to open it.';
    case 415:
      return 'This file type cannot be previewed. Download it to open it.';
    case 422:
      return 'This file could not be read — it may be damaged or password-protected. Download it to open it.';
    case 404:
      return 'This file could not be found.';
    case 403:
      return 'You do not have access to this file.';
    default:
      return 'Could not load the preview — try downloading instead.';
  }
};

/** Below this, on either side, an image in a message is a pixel, an icon or a logo — not content. */
export const MIN_VIEWABLE_IMAGE_PX = 48;

const numericAttribute = (img: HTMLImageElement, name: 'width' | 'height'): number | null => {
  const raw = img.getAttribute(name);
  if (raw === null) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && !raw.trim().endsWith('%') ? value : null;
};

/**
 * Does pressing this image in a message open the viewer?
 *
 * Not when it is inside a link (a banner, a "view order" button — the click belongs to the
 * link), and not when it is tiny on either side: the size the sender declared, the size the
 * browser rendered, or the size of the picture itself once loaded. Tracking pixels and social
 * icons fall out of all three. An image with no declared size that has not loaded yet counts as
 * viewable — it is not clickable at zero size anyway.
 */
export const isViewableInlineImage = (img: HTMLImageElement): boolean => {
  if (!img.getAttribute('src')) return false;
  if (img.closest('a')) return false;
  const small = (value: number | null) =>
    value !== null && value > 0 && value < MIN_VIEWABLE_IMAGE_PX;
  const declaredZero = (value: number | null) => value === 0;
  const width = numericAttribute(img, 'width');
  const height = numericAttribute(img, 'height');
  if (small(width) || small(height) || declaredZero(width) || declaredZero(height)) return false;
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    if (img.naturalWidth < MIN_VIEWABLE_IMAGE_PX || img.naturalHeight < MIN_VIEWABLE_IMAGE_PX) {
      return false;
    }
  }
  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    if (rect.width < MIN_VIEWABLE_IMAGE_PX || rect.height < MIN_VIEWABLE_IMAGE_PX) return false;
  }
  return true;
};

/**
 * A name for an image that has none of its own: its alt text, else the last path segment of
 * the original url the proxy carries in `?src=`, else its content id.
 */
export const inlineImageName = (img: HTMLImageElement): string => {
  const alt = img.getAttribute('alt')?.trim();
  if (alt) return alt;
  const src = img.getAttribute('src') ?? '';
  try {
    const url = new URL(src, window.location.href);
    const original = url.searchParams.get('src');
    if (original) {
      const segment = new URL(original).pathname.split('/').filter(Boolean).pop();
      if (segment) return decodeURIComponent(segment);
    }
    const cid = url.searchParams.get('cid');
    if (cid) return cid;
  } catch {
    // A src that is not a url: fall through to the generic name.
  }
  return 'Image';
};
