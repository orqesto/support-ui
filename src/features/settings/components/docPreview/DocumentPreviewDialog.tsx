import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, Globe } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog/Dialog';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Spinner } from '@/components/ui/Spinner';
import { useDepartments } from '@/hooks/useDepartments';
import { useTeamsEnabled } from '@/hooks/useTeamsEnabled';
import { formatDate } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { integrationsService } from '@/services/integrations.service';
import { renderDocumentHtml, splitIntoSections } from '@/components/shared/fileViewer/docMarkdown';
import { joinChunks, seamRuleFor } from './joinChunks';
import { chunkFocus, findFocusBlock, findFocusRange, LARGE_BLOCK_CHARS, markLineStart, sectionsToShow, type ChunkFocus } from './focusSection';

/**
 * Settings → AI → Documentation → eye icon: the document as one readable page.
 *
 * Loaded lazily from DocumentationSettings, so the renderer stays out of the settings chunk
 * until someone opens a preview.
 */

/**
 * The document fields the preview reads (the KB feature's `Documentation` row). Declared here so
 * this file needs no import from that feature; the host passes the row and the content loader.
 */
export type PreviewDocument = {
  id: number;
  title: string;
  documentType: string;
  chunkingStrategy: string | null;
  departmentIds?: number[];
  originalFilename: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  externalSource?: string | null;
  externalUrl?: string | null;
  /** A synced page's place in its source, titles top down (list rows carry it). */
  sourcePath?: string[] | null;
};

type Documentation = PreviewDocument;

type DocumentPreviewDialogProps = {
  doc: PreviewDocument;
  /** The stored chunks in chunk order (`documentationService.getDocumentationContent`). */
  loadChunks: (id: number) => Promise<StoredChunk[]>;
  /**
   * The stored chunk a source link cites, by its index (0-based) or by its id: the preview opens
   * scrolled to where that chunk starts and marks the spot. Not found: it opens at the top.
   */
  focusChunkIndex?: number;
  focusChunkId?: number;
  /**
   * A synced page as Markdown and its path (`GET /api/documentation/:id`). A non-empty
   * `contentMarkdown` is shown formatted instead of the chunks; null, absent (an older backend)
   * or a failed request shows the chunks as before.
   */
  loadFormatted?: (
    id: number
  ) => Promise<{ contentMarkdown: string | null; sourcePath: string[] | null }>;
  onClose: () => void;
};

type ContentState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `markdown`: the text is the source's own Markdown (always rendered, never plain). */
  | { status: 'ready'; text: string; markdown?: boolean; focus: ChunkFocus | null };

type StoredChunk = { content: string; chunkIndex?: number; id?: number };
type Cited = { index?: number; id?: number };

/** Where the cited chunk is (see focusSection); null when no chunk is cited or it is not here. */
const focusOf = (chunks: StoredChunk[], cited: Cited): ChunkFocus | null => {
  let position = -1;
  if (cited.index !== undefined) {
    position = chunks.some((chunk) => typeof chunk.chunkIndex === 'number')
      ? chunks.findIndex((chunk) => chunk.chunkIndex === cited.index)
      : cited.index;
  } else if (cited.id !== undefined) {
    position = chunks.findIndex((chunk) => chunk.id === cited.id);
  }
  return chunkFocus(
    chunks.map((chunk) => chunk.content),
    position
  );
};

/** The mark on the block a source link points at. Written out in full for the CSS build. */
const LINE_FOCUS_CLASSES = ['rounded', 'bg-primary/20', 'text-foreground'];
const FOCUS_CLASSES = ['rounded', 'bg-primary/10', 'outline', 'outline-2', 'outline-offset-4', 'outline-primary/40'];

/** A path as the backend sent it: a non-empty list of titles, else nothing. */
const pathParts = (path: unknown): string[] =>
  Array.isArray(path) ? path.filter((part): part is string => typeof part === 'string' && part !== '') : [];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isConfluence = (doc: Documentation): boolean => doc.externalSource?.split(':')[0] === 'confluence';

/** Plain text and CSV stay as written; everything else is read as the Markdown subset. */
const isPlainText = (doc: Documentation): boolean =>
  doc.mimeType === 'text/plain' || doc.mimeType === 'text/csv';

/** The page link the backend stored for a synced document, if it is a web link. */
const sourcePageUrl = (doc: Documentation): string | null => {
  const url = typeof doc.externalUrl === 'string' ? doc.externalUrl.trim() : '';
  return /^https?:\/\//i.test(url) ? url : null;
};

/**
 * When the document's content source last finished a sync. The backend keeps this per source
 * (the integration), not per document, so it is labelled as the source's. Any failure (an older
 * backend, no access to integrations) leaves it out.
 */
const useSourceLastSynced = (doc: Documentation): string | null => {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const integrationId = isConfluence(doc) ? Number(doc.externalSource?.split(':')[1]) : NaN;
  useEffect(() => {
    if (!Number.isInteger(integrationId)) return undefined;
    let cancelled = false;
    integrationsService
      .getAll({ everyTeam: true })
      .then((response) => {
        const source = (response.data ?? []).find((integration) => integration.id === integrationId);
        const value = source?.lastSyncedAt;
        if (!cancelled && typeof value === 'string' && value) setLastSynced(value);
      })
      .catch((error: unknown) => logger.warn('Could not load the content source for a preview', error));
    return () => {
      cancelled = true;
    };
  }, [integrationId]);
  return lastSynced;
};

/** Rendered-HTML styles: headings, lists, tables, code; prose in the normal font, normal wrapping. */
const RENDERED_CLASSES = [
  'text-[15px] leading-7 text-foreground break-words',
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold',
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:mt-4 [&_h5]:font-semibold [&_h6]:mt-4 [&_h6]:font-semibold',
  '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_a]:text-primary [&_a]:underline',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-6 [&_hr]:border-border',
  '[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-muted [&_code]:rounded [&_code]:px-1',
  '[&_pre]:my-3 [&_pre]:p-3 [&_pre]:bg-muted [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top',
].join(' ');

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <span>
    <span className="text-muted-foreground">{label}: </span>
    {value}
  </span>
);

/** Characters per rendered part; the rest of a long document is added on request. */
const SECTION_CHARS = 50_000;

const RenderedSection = memo(({ raw }: { raw: string }) => {
  const html = useMemo(() => renderDocumentHtml(raw), [raw]);
  return (
    <div
      className={RENDERED_CLASSES}
      // Sanitized in renderDocumentHtml (escaped text + DOMPurify allowlist).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
RenderedSection.displayName = 'RenderedSection';

type DocumentBodyProps = { doc: Documentation; text: string; markdown: boolean; focus: ChunkFocus | null };

const DocumentBody = ({ doc, text, markdown, focus }: DocumentBodyProps) => {
  const plain = !markdown && isPlainText(doc);
  const sections = useMemo(() => (plain ? [] : splitIntoSections(text, SECTION_CHARS)), [plain, text]);
  // A cited chunk far down a long document: its part is rendered from the start.
  const [shown, setShown] = useState(() => sectionsToShow(sections, focus));
  const bodyRef = useRef<HTMLDivElement>(null);
  const plainFocus = useMemo(() => (plain && focus ? findFocusRange(text, focus) : null), [plain, text, focus]);

  // Once, when the text is on the page: go to the cited chunk and mark where it starts.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !focus) return;
    if (plain) {
      body.querySelector<HTMLElement>('[data-doc-focus]')?.scrollIntoView?.({ block: 'start' });
      return;
    }
    const found = findFocusBlock(body, focus);
    if (!found) return;
    // Marked only when the chunk's own line was found; a block at its place is just scrolled to.
    let target = found.element;
    if (found.exact) {
      // A paragraph pages long (text extracted without blank lines): the line inside it.
      const large = (target.textContent ?? '').length > LARGE_BLOCK_CHARS;
      const mark = large && found.line ? markLineStart(target, found.line) : null;
      if (mark) {
        mark.classList.add(...LINE_FOCUS_CLASSES);
        target = mark;
      } else {
        target.classList.add(...FOCUS_CLASSES);
      }
      target.setAttribute('data-doc-focus', '');
    }
    target.classList.add('scroll-mt-6');
    target.scrollIntoView?.({ block: 'start' });
  }, [plain, focus]);

  if (plain) {
    return (
      <div
        ref={bodyRef}
        data-testid="doc-preview-body"
        className="text-[15px] leading-7 whitespace-pre-wrap break-words"
      >
        {plainFocus ? (
          <>
            {text.slice(0, plainFocus.start)}
            <mark data-doc-focus="" className="rounded bg-primary/20 text-foreground scroll-mt-6">
              {text.slice(plainFocus.start, plainFocus.end)}
            </mark>
            {text.slice(plainFocus.end)}
          </>
        ) : (
          text
        )}
      </div>
    );
  }
  const shownChars = sections.slice(0, shown).reduce((sum, section) => sum + section.length, 0);
  return (
    <div ref={bodyRef} data-testid="doc-preview-body">
      {sections.slice(0, shown).map((section, index) => (
        // The parts of one text never reorder: the position is their identity.
        // eslint-disable-next-line react/no-array-index-key
        <RenderedSection key={index} raw={section} />
      ))}
      {shown < sections.length && (
        <div className="flex flex-wrap gap-3 items-center justify-center py-4 text-sm text-muted-foreground">
          <span>
            Showing {Math.round((shownChars / text.length) * 100)}% of a long document.
          </span>
          <Button variant="outline" size="sm" onClick={() => setShown((count) => count + 2)}>
            Show more
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShown(sections.length)}>
            Show all
          </Button>
        </div>
      )}
    </div>
  );
};

export const DocumentPreviewDialog = ({ doc, loadChunks, loadFormatted, focusChunkIndex, focusChunkId, onClose }: DocumentPreviewDialogProps) => {
  const [detailPath, setDetailPath] = useState<string[]>([]);
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const teamsEnabled = useTeamsEnabled();
  const { data: departments } = useDepartments();
  const confluence = isConfluence(doc);
  const pageUrl = confluence ? sourcePageUrl(doc) : null;
  const lastSynced = useSourceLastSynced(doc);
  const listPath = pathParts(doc.sourcePath);
  const sourcePath = listPath.length > 0 ? listPath : detailPath;

  useEffect(() => {
    let cancelled = false;
    const cited: Cited = { index: focusChunkIndex, id: focusChunkId };
    const isCited = focusChunkIndex !== undefined || focusChunkId !== undefined;
    setContent({ status: 'loading' });
    // One request, whoever asks: the text itself, or only the cited chunk of a formatted page.
    let chunksRequest: Promise<StoredChunk[]> | null = null;
    const chunksOnce = () => (chunksRequest ??= loadChunks(doc.id));
    const fromChunks = () =>
      chunksOnce()
        .then((chunks) => {
          if (cancelled) return;
          const text = joinChunks(
            chunks.map((chunk) => chunk.content),
            seamRuleFor(doc.documentType, doc.chunkingStrategy)
          );
          setContent({ status: 'ready', text, focus: focusOf(chunks, cited) });
        })
        .catch((error: unknown) => {
          logger.error('Failed to load documentation content:', error);
          if (!cancelled) setContent({ status: 'error' });
        });
    if (confluence && loadFormatted) {
      loadFormatted(doc.id)
        .then((formatted) => {
          if (cancelled) return;
          setDetailPath(pathParts(formatted.sourcePath));
          const markdown = formatted.contentMarkdown;
          if (!markdown) {
            void fromChunks();
            return;
          }
          const show = (focus: ChunkFocus | null) => {
            if (!cancelled) setContent({ status: 'ready', text: markdown, markdown: true, focus });
          };
          if (!isCited) {
            show(null);
            return;
          }
          // The formatted page has no chunks in it: the cited one is read only to find its place.
          chunksOnce()
            .then((chunks) => show(focusOf(chunks, cited)))
            .catch(() => show(null));
        })
        .catch((error: unknown) => {
          logger.warn('No formatted page for a synced document, showing its chunks', error);
          if (!cancelled) void fromChunks();
        });
    } else {
      void fromChunks();
    }
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.documentType, doc.chunkingStrategy, attempt, loadChunks, loadFormatted, confluence, focusChunkIndex, focusChunkId]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const departmentIds = doc.departmentIds ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="full" className="flex flex-col">
      <DialogHeader className="items-start gap-4 px-6 py-4">
        <div className="flex-1 min-w-0 space-y-2">
          <DialogTitle className="break-words">{doc.title}</DialogTitle>
          {sourcePath.length > 0 && (
            <p data-testid="doc-preview-path" className="text-sm text-muted-foreground break-words">
              {sourcePath.join(' › ')}
            </p>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            {confluence ? (
              <Badge variant="secondary" className="gap-1">
                <BookOpen className="w-3 h-3" />
                Confluence
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <FileText className="w-3 h-3" />
                Uploaded file
              </Badge>
            )}
            {teamsEnabled &&
              (departmentIds.length === 0 ? (
                <Badge variant="secondary" className="gap-1">
                  <Globe className="w-3 h-3" />
                  All teams
                </Badge>
              ) : (
                departmentIds.map((deptId) => (
                  <Badge key={deptId} variant="secondary">
                    {departments?.find((dept) => dept.id === deptId)?.name ?? `Team #${deptId}`}
                  </Badge>
                ))
              ))}
            {pageUrl && (
              <ExternalLink href={pageUrl} size="sm">
                Open in Confluence
              </ExternalLink>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {!confluence && doc.originalFilename && <MetaItem label="File" value={doc.originalFilename} />}
            {typeof doc.size === 'number' && <MetaItem label="Size" value={formatFileSize(doc.size)} />}
            <MetaItem label="Chunks" value={String(doc.chunkCount ?? 0)} />
            {doc.createdAt && (
              <MetaItem label={confluence ? 'Added' : 'Uploaded'} value={formatDate(doc.createdAt)} />
            )}
            {doc.updatedAt && <MetaItem label="Updated" value={formatDate(doc.updatedAt)} />}
            {lastSynced && <MetaItem label="Source last synced" value={formatDate(lastSynced)} />}
          </div>
        </div>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-[100ch]">
          {content.status === 'loading' && (
            <div className="flex gap-3 justify-center items-center py-12 text-muted-foreground" role="status">
              <Spinner size={20} />
              Loading content…
            </div>
          )}
          {content.status === 'error' && (
            <Alert variant="danger" className="flex flex-wrap gap-3 justify-between items-center">
              <span>The content could not be loaded.</span>
              <Button variant="outline" size="sm" onClick={retry}>
                Try again
              </Button>
            </Alert>
          )}
          {content.status === 'ready' &&
            (content.text.trim() === '' ? (
              <Alert role="status">This document has no stored text to show.</Alert>
            ) : (
              <DocumentBody doc={doc} text={content.text} markdown={content.markdown === true} focus={content.focus} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
