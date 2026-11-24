import { useMemo } from 'react';
import { FileViewer } from '@/components/shared/fileViewer/FileViewer';
import { documentItem } from '@/components/shared/fileViewer/fileViewerModel';

/**
 * Settings → AI → Documentation → eye icon, for an UPLOADED document: the shared file viewer
 * (the one email attachments open in) over the original file. PDF in the browser's viewer,
 * pictures (a TIFF converted by the backend), Word and Excel through the backend's preview,
 * CSV as a table, Markdown formatted, text as text.
 *
 * Loaded lazily from DocumentationSettings. A document the viewer cannot draw (an old .doc),
 * or whose file the backend does not serve (missing, or a backend older than the documentation
 * file routes), goes to the text read from it (`onShowText` → the #1022 preview).
 */
export type ViewedDocument = {
  id: number;
  originalFilename: string;
  title: string;
  mimeType: string;
  size: number;
};

type DocumentFileViewerProps = {
  doc: ViewedDocument;
  onClose: () => void;
  onShowText: () => void;
};

const noop = () => undefined;

export const DocumentFileViewer = ({ doc, onClose, onShowText }: DocumentFileViewerProps) => {
  const items = useMemo(
    () => [
      documentItem({
        id: doc.id,
        name: doc.originalFilename || doc.title,
        mimeType: doc.mimeType,
        size: doc.size,
      }),
    ],
    [doc.id, doc.originalFilename, doc.title, doc.mimeType, doc.size]
  );
  return (
    <FileViewer
      items={items}
      index={0}
      onIndexChange={noop}
      onClose={onClose}
      onTextFallback={onShowText}
    />
  );
};

export default DocumentFileViewer;
