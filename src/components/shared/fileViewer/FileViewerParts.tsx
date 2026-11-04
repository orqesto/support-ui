import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { AlertTriangle, Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import type { AttachmentPreview } from '@/services/attachmentFile.service';
import { CSV_MAX_ROWS, parseCsv } from './fileViewerModel';

export const formatBytes = (bytes?: number | null): string | null => {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * A DEDICATED sanitizer for document previews. The shared DOMPurify instance carries the thread's
 * hooks — one of them deletes every image that is not our mail-image proxy, which would strip
 * the pictures mammoth embeds in a Word file as data urls. A fresh instance has no hooks.
 */
const DOC_IMAGE_SRC = /^data:image\/[a-z0-9.+-]+[;,]/i;
const DOC_LINK_HREF = /^(?:https?:|mailto:)/i;
let documentPurifier: ReturnType<typeof DOMPurify> | null = null;
const purifier = () => {
  if (!documentPurifier) {
    documentPurifier = DOMPurify(window);
    documentPurifier.addHook('afterSanitizeAttributes', (node: Element) => {
      // Pictures: mammoth embeds a Word file's images as `data:image/...` — those, and only
      // those, survive on an <img>. Any other source (a remote url would be a read receipt, a
      // `data:text/html` is not a picture) is dropped with its image.
      if (node.tagName === 'IMG') {
        if (!DOC_IMAGE_SRC.test(node.getAttribute('src') ?? '')) node.remove();
        return;
      }
      if (node.tagName !== 'A' || !node.hasAttribute('href')) return;
      // Links: http(s) and mailto only — never `javascript:` or any `data:`.
      if (!DOC_LINK_HREF.test(node.getAttribute('href') ?? '')) {
        node.removeAttribute('href');
        return;
      }
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    });
  }
  return documentPurifier;
};

/**
 * A Word document's html is the CUSTOMER's content: sanitized before it touches the page. No
 * `style`, no forms, no frames — a document preview needs headings, lists, tables and pictures.
 */
export const sanitizeDocumentHtml = (html: string): string =>
  purifier().sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object'],
    FORBID_ATTR: ['style', 'class', 'id'],
  });

const DOCUMENT_PROSE =
  'mx-auto max-w-3xl px-6 py-5 text-[13.5px] leading-relaxed text-foreground break-words ' +
  '[&_p]:my-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:my-3 [&_h2]:text-lg [&_h2]:font-semibold ' +
  '[&_h2]:my-3 [&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal ' +
  '[&_ol]:pl-6 [&_img]:max-w-full [&_img]:h-auto [&_a]:text-primary [&_a]:underline ' +
  '[&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 ' +
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1';

export const TruncatedNotice = ({ children }: { children: React.ReactNode }) => (
  <p
    role="note"
    className="px-3 py-1.5 text-[11.5px] text-muted-foreground bg-sunken border-b border-border"
  >
    {children}
  </p>
);

/**
 * A grid of display strings. A plain semantic table on purpose: this is a document being SHOWN
 * (a spreadsheet's cells), not a list of records — DataTable's search, paging and card layout
 * have nothing to act on here.
 */
export const CellGrid = ({ rows }: { rows: string[][] }) => {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (rows.length === 0 || width === 0) {
    return <p className="p-6 text-sm text-center text-muted-foreground">This sheet is empty.</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="text-[12px] border-collapse font-mono">
        <tbody>
          {rows.map((row, rowIndex) => (
            // Rows are positional and never reorder — the index IS the identity.
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex} className={rowIndex === 0 ? 'bg-sunken font-semibold' : undefined}>
              {Array.from({ length: width }, (_unused, cellIndex) => (
                <td
                  // eslint-disable-next-line react/no-array-index-key
                  key={cellIndex}
                  className="px-2 py-1 border border-border whitespace-pre-wrap align-top max-w-[24rem]"
                >
                  {row[cellIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const CsvView = ({ text }: { text: string }) => {
  const { rows, truncated } = useMemo(() => parseCsv(text), [text]);
  return (
    <div className="flex flex-col min-h-0 h-full bg-card">
      {truncated && (
        <TruncatedNotice>
          Showing the first {CSV_MAX_ROWS} rows — download for the rest.
        </TruncatedNotice>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <CellGrid rows={rows} />
      </div>
    </div>
  );
};

export const TEXT_SHOWN_CHARS = 200_000;

export const TextView = ({ text }: { text: string }) => (
  <div className="flex flex-col min-h-0 h-full bg-card">
    {text.length > TEXT_SHOWN_CHARS && (
      <TruncatedNotice>Showing the start of this file — download for the rest.</TruncatedNotice>
    )}
    <pre className="flex-1 min-h-0 overflow-auto p-4 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground">
      {text.slice(0, TEXT_SHOWN_CHARS)}
    </pre>
  </div>
);

export const OfficePreview = ({ preview }: { preview: AttachmentPreview }) => {
  const [sheetIndex, setSheetIndex] = useState(0);
  const html = useMemo(
    () => (preview.kind === 'html' ? sanitizeDocumentHtml(preview.html) : ''),
    [preview]
  );
  const notice = preview.truncated ? (
    <TruncatedNotice>
      This preview is shortened — the file is larger than the preview shows. Download it for
      everything.
    </TruncatedNotice>
  ) : null;

  if (preview.kind === 'html') {
    return (
      <div className="flex flex-col min-h-0 h-full bg-card">
        {notice}
        <div className="flex-1 min-h-0 overflow-auto">
          {html.trim() ? (
            // Sanitized above by a hook-free DOMPurify instance (sanitizeDocumentHtml).
            <div
              data-testid="document-preview"
              className={DOCUMENT_PROSE}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="p-6 text-sm text-center text-muted-foreground">
              This document has no text to show.
            </p>
          )}
        </div>
      </div>
    );
  }

  const sheets = preview.sheets;
  const current = sheets[Math.min(sheetIndex, Math.max(sheets.length - 1, 0))];
  return (
    <div className="flex flex-col min-h-0 h-full bg-card" data-testid="sheet-preview">
      {notice}
      {sheets.length > 1 && (
        <div className="px-2 overflow-x-auto">
          <Tabs
            variant="simple"
            size="sm"
            tabs={sheets.map((sheet, index) => ({ id: String(index), label: sheet.name }))}
            activeTab={String(sheetIndex)}
            onTabChange={(id) => setSheetIndex(Number(id))}
          />
        </div>
      )}
      {current?.truncated && !preview.truncated && (
        <TruncatedNotice>This sheet is shortened — download for every row.</TruncatedNotice>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        {current ? (
          <CellGrid rows={current.rows} />
        ) : (
          <p className="p-6 text-sm text-center text-muted-foreground">This file has no sheets.</p>
        )}
      </div>
    </div>
  );
};

/** What the viewer shows when it cannot show the file itself — always with a way to get it. */
export const FileCard = ({
  name,
  size,
  message,
  tone = 'neutral',
  onDownload,
  onOpenInTab,
}: {
  name: string;
  size?: number | null;
  message: string;
  tone?: 'neutral' | 'error';
  onDownload: () => void;
  onOpenInTab?: () => void;
}) => {
  const Icon = tone === 'error' ? AlertTriangle : FileText;
  const sizeLabel = formatBytes(size);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        role={tone === 'error' ? 'alert' : undefined}
        className="flex flex-col gap-3 items-center max-w-sm w-full p-6 text-center rounded-lg border border-border bg-card"
      >
        <Icon
          className={`w-10 h-10 ${tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
        />
        <div className="min-w-0 w-full">
          <p className="text-sm font-medium text-foreground break-words">{name}</p>
          {sizeLabel && <p className="text-xs text-muted-foreground">{sizeLabel}</p>}
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="primary" size="md" onClick={onDownload}>
            <Download className="mr-1.5 w-4 h-4" />
            Download
          </Button>
          {onOpenInTab && (
            <Button variant="outline" size="md" onClick={onOpenInTab}>
              <ExternalLink className="mr-1.5 w-4 h-4" />
              Open in new tab
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
