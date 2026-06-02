import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, FileText, CheckCircle, Clock } from 'lucide-react';
import { DocumentationUploadForm } from '@/components/settings/DocumentationUploadForm';
import { DocumentationList } from '@/components/settings/DocumentationList';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
} from '@/components/ui/Dialog/Dialog';
import {
  documentationService,
  type Documentation,
  type DocumentType,
  type DocumentationProgress,
} from '@/services/documentation.service';
import { logger } from '@/lib/logger';

export const DocumentationSettings = () => {
  const [docs, setDocs] = useState<Documentation[]>([]);
  const [stats, setStats] = useState<{
    totalDocs: number;
    totalChunks: number;
    totalReferences: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState<'department' | 'organization'>('department');
  const [documentType, setDocumentType] = useState<DocumentType>('general');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<
    Record<
      string,
      { status: 'pending' | 'uploading' | 'success' | 'error'; progress: number; error?: string }
    >
  >({});
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; docId: number | null }>({
    open: false,
    docId: null,
  });
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  const [viewerDialog, setViewerDialog] = useState<{
    open: boolean;
    doc: Documentation | null;
    content: string;
    loading: boolean;
  }>({
    open: false,
    doc: null,
    content: '',
    loading: false,
  });
  const [docProgress, setDocProgress] = useState<Record<number, DocumentationProgress>>({});
  const docsRef = useRef<Documentation[]>([]);
  docsRef.current = docs;
  const fetchingProgressRef = useRef(false);
  const loadingRef = useRef(false);

  const [searchParams] = useSearchParams();
  const rawDocId = searchParams.get('docId');
  const highlightDocId =
    rawDocId !== null
      ? isNaN(parseInt(rawDocId, 10))
        ? undefined
        : parseInt(rawDocId, 10)
      : undefined;

  const loadDocumentation = useCallback(async (isInitialLoad = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      if (isInitialLoad) setLoading(true);
      const [docsData, statsData] = await Promise.all([
        documentationService.listDocumentation(),
        documentationService.getStats(),
      ]);
      setDocs(docsData);
      setStats(statsData);
    } catch (error) {
      logger.error('Failed to load documentation:', error);
    } finally {
      loadingRef.current = false;
      if (isInitialLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocumentation(true);
  }, [loadDocumentation]);

  useEffect(() => {
    if (highlightDocId && !loading && docs.length > 0) {
      const el = document.getElementById(`doc-${highlightDocId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightDocId, loading, docs.length]);

  const processingDocIds = docs
    .filter((doc) => doc.status === 'processing')
    .map((doc) => doc.id)
    .sort()
    .join(',');

  useEffect(() => {
    const ids = docs.filter((doc) => doc.status === 'processing').map((doc) => doc.id);

    if (ids.length === 0) return;

    const fetchProgress = async () => {
      if (fetchingProgressRef.current) return;
      fetchingProgressRef.current = true;
      try {
        const progressPromises = ids.map(async (id) => {
          try {
            const progress = await documentationService.getProgress(id);
            return { id, progress };
          } catch (error) {
            logger.error(`Failed to fetch progress for doc ${id}:`, error);
            return null;
          }
        });

        const results = await Promise.all(progressPromises);
        const newProgress: Record<number, DocumentationProgress> = {};
        results.forEach((result) => {
          if (result) {
            newProgress[result.id] = result.progress;
          }
        });
        setDocProgress(newProgress);
      } finally {
        fetchingProgressRef.current = false;
      }
    };

    void fetchProgress();

    const interval = setInterval(() => {
      void fetchProgress();
      void loadDocumentation(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [processingDocIds, loadDocumentation, docs]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
      event.target.value = '';
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files || []);
    const validTypes = ['.pdf', '.txt', '.md', '.docx', '.doc', '.xlsx', '.xls', '.csv'];
    const validFiles = files.filter((file) => {
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      return validTypes.includes(fileExt);
    });

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setUploading(true);

      const progress: Record<
        string,
        { status: 'pending' | 'uploading' | 'success' | 'error'; progress: number; error?: string }
      > = {};
      selectedFiles.forEach((file) => {
        progress[file.name] = { status: 'pending', progress: 0 };
      });
      setUploadProgress(progress);

      const uploadPromises = selectedFiles.map(async (file) => {
        try {
          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: { status: 'uploading', progress: 0 },
          }));

          const title = file.name.replace(/\.[^/.]+$/, '');

          await documentationService.uploadDocumentation(
            file,
            title,
            '',
            visibility,
            documentType,
            (progressEvent) => {
              setUploadProgress((prev) => ({
                ...prev,
                [file.name]: { status: 'uploading', progress: progressEvent.progress ?? 0 },
              }));
            }
          );

          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: { status: 'success', progress: 100 },
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          const isOCRError =
            errorMessage.toLowerCase().includes('only images') ||
            errorMessage.toLowerCase().includes('scanned') ||
            errorMessage.toLowerCase().includes('no extractable text');

          const userFriendlyError = isOCRError
            ? '📄 Scanned PDF detected! Use Knowledge Base sources (they have OCR) or convert to text-searchable PDF first.'
            : errorMessage;

          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: {
              status: 'error',
              progress: 0,
              error: userFriendlyError,
            },
          }));
          throw error;
        }
      });

      await Promise.allSettled(uploadPromises);

      setTimeout(() => {
        setSelectedFiles([]);
        setUploadProgress({});
        setVisibility('department');
        setDocumentType('general');
      }, 2000);

      await loadDocumentation();
    } catch (error) {
      logger.error('Failed to upload documentation:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeleteDialog({ open: true, docId: id });
  };

  const handleToggleDoc = (id: number) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedDocs.size === docs.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(docs.map((doc) => doc.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDocs.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedDocs).map((id) => documentationService.deleteDocumentation(id))
      );
      setSelectedDocs(new Set());
      await loadDocumentation();
    } catch (error) {
      logger.error('Failed to delete documentation:', error);
      // Refresh state even on partial failure so UI stays consistent (P7-IN-06)
      setSelectedDocs(new Set());
      void loadDocumentation();
    }
  };

  const handleViewContent = async (doc: Documentation) => {
    setViewerDialog({ open: true, doc, content: '', loading: true });
    try {
      const chunks = await documentationService.getDocumentationContent(doc.id);
      const fullContent = chunks.map((chunk) => chunk.content).join('\n\n');
      setViewerDialog((prev) => ({ ...prev, content: fullContent, loading: false }));
    } catch (error) {
      logger.error('Failed to load documentation content:', error);
      setViewerDialog((prev) => ({
        ...prev,
        content: 'Failed to load content. Please try again.',
        loading: false,
      }));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.docId) return;

    try {
      await documentationService.deleteDocumentation(deleteDialog.docId);
      await loadDocumentation();
      setDeleteDialog({ open: false, docId: null });
    } catch (error) {
      logger.error('Failed to delete documentation:', error);
      // Close dialog even on error to prevent it from staying open (P7-IN-07)
      setDeleteDialog({ open: false, docId: null });
    }
  };

  const handleToggleEnabled = async (doc: Documentation) => {
    try {
      const updatedDoc = await documentationService.toggleEnabled(doc.id, !doc.enabled);
      setDocs((prev: Documentation[]) =>
        prev.map((docItem: Documentation) => (docItem.id === doc.id ? updatedDoc : docItem))
      );
    } catch (error) {
      logger.error('Failed to toggle documentation enabled status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-8 h-8 rounded-full border-b-2 animate-spin border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div>
        <h2 className="mb-2 text-2xl font-bold">Knowledge Base Documentation</h2>
        <p className="mb-4 text-muted-foreground">
          Upload documentation that AI will use to answer customer questions automatically.
        </p>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex flex-col gap-3 items-center text-center sm:items-center sm:flex-row sm:text-left">
                <BookOpen className="hidden w-8 h-8 text-blue-500 sm:block" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalDocs}</p>
                  <p className="text-sm text-muted-foreground">Documents</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex flex-col gap-3 text-center items-centersm:items-center sm:flex-row sm:text-left">
                <FileText className="hidden w-8 h-8 text-green-500 sm:block" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Chunks</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex flex-col gap-3 items-center text-center sm:items-center sm:flex-row sm:text-left">
                <CheckCircle className="hidden w-8 h-8 text-purple-500 sm:block" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalReferences}</p>
                  <p className="text-sm text-muted-foreground">Times Used</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <DocumentationUploadForm
        selectedFiles={selectedFiles}
        visibility={visibility}
        documentType={documentType}
        isDragging={isDragging}
        uploading={uploading}
        uploadProgress={uploadProgress}
        onFileSelect={handleFileSelect}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onRemoveFile={handleRemoveFile}
        onVisibilityChange={setVisibility}
        onDocumentTypeChange={setDocumentType}
        onUpload={handleUpload}
      />

      <DocumentationList
        docs={docs}
        selectedDocs={selectedDocs}
        docProgress={docProgress}
        highlightDocId={highlightDocId}
        onToggleDoc={handleToggleDoc}
        onToggleAll={handleToggleAll}
        onBulkDelete={handleBulkDelete}
        onViewContent={handleViewContent}
        onToggleEnabled={handleToggleEnabled}
        onDeleteClick={handleDeleteClick}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        onConfirm={handleDeleteConfirm}
        title="Delete Documentation"
        description="Are you sure you want to delete this documentation? This action cannot be undone and all associated chunks will be removed from the knowledge base."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <Dialog
        open={viewerDialog.open}
        onOpenChange={(open) =>
          !open && setViewerDialog({ open: false, doc: null, content: '', loading: false })
        }
        size="lg"
      >
        <DialogHeader>
          <div className="flex-1 min-w-0 pr-4">
            <DialogTitle>{viewerDialog.doc?.title}</DialogTitle>
            <p className="text-sm text-muted-foreground truncate">
              {viewerDialog.doc?.originalFilename} · {viewerDialog.doc?.chunkCount} chunks
            </p>
          </div>
          <DialogClose
            onClose={() => setViewerDialog({ open: false, doc: null, content: '', loading: false })}
          />
        </DialogHeader>
        <DialogContent className="overflow-auto max-h-[60vh] bg-gray-50 dark:bg-gray-900">
          {viewerDialog.loading ? (
            <div className="flex flex-col justify-center items-center py-12 text-center">
              <Clock className="mb-4 w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground">Loading content...</p>
            </div>
          ) : (
            <div
              className="p-4 bg-white rounded border font-mono text-sm leading-6 dark:bg-gray-800 dark:border-gray-700"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
              }}
            >
              {viewerDialog.content}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
