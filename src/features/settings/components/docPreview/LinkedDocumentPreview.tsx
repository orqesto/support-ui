import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { logger } from '@/lib/logger';
import DocumentPreviewDialog, { type PreviewDocument } from './DocumentPreviewDialog';

const DocumentFileViewer = lazy(() => import('./DocumentFileViewer'));

/**
 * The document a source link names, for someone who cannot open Settings › AI › Documentation
 * (an agent): the same preview, read-only, with nothing of the documentation manager around it.
 * The backend serves one document to whoever works on threads, inside their teams.
 */

type Documentation = PreviewDocument;

/** The KB feature's document reads (`documentationService`), passed in by the page. */
export type LinkedDocumentLoaders = {
  getDocumentation: (id: number) => Promise<Documentation>;
  getDocumentationContent: (id: number) => Promise<{ content: string; chunkIndex?: number; id?: number }[]>;
  getDocumentationFormatted: (
    id: number
  ) => Promise<{ contentMarkdown: string | null; sourcePath: string[] | null }>;
};

type LinkedDocumentPreviewProps = {
  docId: number;
  loaders: LinkedDocumentLoaders;
  /** The cited chunk, by index or by id: the text preview opens at it. */
  chunkIndex?: number;
  chunkId?: number;
};

type State = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; doc: Documentation };

const isConfluence = (doc: Documentation): boolean => doc.externalSource?.split(':')[0] === 'confluence';

/** Where closing the preview goes: the link opened a tab of its own, so there is no page behind it. */
const AFTER_CLOSE = '/threads';

export const LinkedDocumentPreview = ({ docId, loaders, chunkIndex, chunkId }: LinkedDocumentPreviewProps) => {
  const { getDocumentation } = loaders;
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  // With a cited chunk the text is shown (the original file has no chunks); a synced page is text.
  const cited = chunkIndex !== undefined || chunkId !== undefined;
  const [showText, setShowText] = useState(cited);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getDocumentation(docId)
      .then((doc) => {
        if (!cancelled) setState({ status: 'ready', doc });
      })
      .catch((error: unknown) => {
        // 404: deleted, or another team's. 403: a backend from before agents could read documents.
        logger.warn('The linked document could not be opened', error);
        if (!cancelled) setState({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [docId, getDocumentation]);

  const close = useCallback(() => void navigate(AFTER_CLOSE, { replace: true }), [navigate]);
  const toText = useCallback(() => setShowText(true), []);

  if (state.status === 'loading') {
    return (
      <div className="flex gap-3 justify-center items-center py-16 text-muted-foreground" role="status">
        <Spinner size={20} />
        Opening the document…
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div className="p-6 mx-auto max-w-2xl">
        <Alert role="status" className="flex flex-wrap gap-3 justify-between items-center">
          <span>
            This document cannot be opened. It may have been deleted, or it belongs to a team you are
            not a member of.
          </span>
          <Link to={AFTER_CLOSE} className="underline text-primary">
            Back to threads
          </Link>
        </Alert>
      </div>
    );
  }
  const { doc } = state;
  if (!showText && !isConfluence(doc)) {
    return (
      <Suspense fallback={null}>
        <DocumentFileViewer doc={doc} onClose={close} onShowText={toText} />
      </Suspense>
    );
  }
  return (
    <DocumentPreviewDialog
      doc={doc}
      loadChunks={loaders.getDocumentationContent}
      loadFormatted={loaders.getDocumentationFormatted}
      focusChunkIndex={chunkIndex}
      focusChunkId={chunkId}
      onClose={close}
    />
  );
};

export default LinkedDocumentPreview;
