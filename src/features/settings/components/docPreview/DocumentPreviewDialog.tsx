import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { renderDocumentHtml, splitIntoSections } from './docMarkdown';
import { joinChunks, seamRuleFor } from './joinChunks';

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
};

type Documentation = PreviewDocument;

type DocumentPreviewDialogProps = {
  doc: PreviewDocument;
  /** The stored chunks in chunk order (`documentationService.getDocumentationContent`). */
  loadChunks: (id: number) => Promise<{ content: string }[]>;
  onClose: () => void;
};

type ContentState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; text: string };

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

const DocumentBody = ({ doc, text }: { doc: Documentation; text: string }) => {
  const plain = isPlainText(doc);
  const sections = useMemo(() => (plain ? [] : splitIntoSections(text, SECTION_CHARS)), [plain, text]);
  const [shown, setShown] = useState(1);
  if (plain) {
    return (
      <div data-testid="doc-preview-body" className="text-[15px] leading-7 whitespace-pre-wrap break-words">
        {text}
      </div>
    );
  }
  const shownChars = sections.slice(0, shown).reduce((sum, section) => sum + section.length, 0);
  return (
    <div data-testid="doc-preview-body">
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

export const DocumentPreviewDialog = ({ doc, loadChunks, onClose }: DocumentPreviewDialogProps) => {
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const teamsEnabled = useTeamsEnabled();
  const { data: departments } = useDepartments();
  const confluence = isConfluence(doc);
  const pageUrl = confluence ? sourcePageUrl(doc) : null;
  const lastSynced = useSourceLastSynced(doc);

  useEffect(() => {
    let cancelled = false;
    setContent({ status: 'loading' });
    loadChunks(doc.id)
      .then((chunks) => {
        if (cancelled) return;
        const text = joinChunks(
          chunks.map((chunk) => chunk.content),
          seamRuleFor(doc.documentType, doc.chunkingStrategy)
        );
        setContent({ status: 'ready', text });
      })
      .catch((error: unknown) => {
        logger.error('Failed to load documentation content:', error);
        if (!cancelled) setContent({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.documentType, doc.chunkingStrategy, attempt, loadChunks]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const departmentIds = doc.departmentIds ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="full" className="flex flex-col">
      <DialogHeader className="items-start gap-4 px-6 py-4">
        <div className="flex-1 min-w-0 space-y-2">
          <DialogTitle className="break-words">{doc.title}</DialogTitle>
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
              <DocumentBody doc={doc} text={content.text} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
