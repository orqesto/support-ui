import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  BookOpen,
  BarChart3,
  Globe,
  Lock,
  FileCode,
  Scale,
  ScrollText,
  Mail,
  Download,
  Eye,
  CheckSquare,
  Power,
  Square,
} from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
} from '@/components/ui/Dialog/Dialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { formatDate } from '@/lib/utils';
import {
  documentationService,
  type Documentation,
  type DocumentType,
  type DocumentationProgress,
} from '@/services/documentation.service';
import { logger } from '@/lib/logger';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getDocumentTypeBadge = (type: DocumentType) => {
  const config = {
    technical: { icon: FileCode, label: 'Technical', color: 'blue' },
    nda: { icon: Lock, label: 'NDA', color: 'red' },
    legal: { icon: Scale, label: 'Legal', color: 'purple' },
    policy: { icon: ScrollText, label: 'Policy', color: 'indigo' },
    template: { icon: Mail, label: 'Template', color: 'green' },
    general: { icon: FileText, label: 'General', color: 'gray' },
  };

  const { icon: Icon, label, color } = config[type] || config.general;

  const colorClasses = {
    blue: 'text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-200',
    red: 'text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-200',
    purple: 'text-purple-700 bg-purple-100 dark:bg-purple-900 dark:text-purple-200',
    indigo: 'text-indigo-700 bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-200',
    green: 'text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-200',
    gray: 'text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <span
      className={`inline-flex gap-1 items-center px-2 py-1 text-xs font-medium rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'ready':
      return (
        <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3" />
          Ready
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-200">
          <Clock className="w-3 h-3 animate-spin" />
          Processing
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-red-800 bg-red-100 rounded-full dark:bg-red-900 dark:text-red-200">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
      );
    default:
      return null;
  }
};

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

  const loadDocumentation = useCallback(async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      }
      const [docsData, statsData] = await Promise.all([
        documentationService.listDocumentation(),
        documentationService.getStats(),
      ]);
      setDocs(docsData);
      setStats(statsData);
    } catch (error) {
      logger.error('Failed to load documentation:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDocumentation(true);
  }, [loadDocumentation]);

  // Stable key: only re-run when the set of processing doc IDs changes
  const processingDocIds = docs
    .filter((doc) => doc.status === 'processing')
    .map((doc) => doc.id)
    .sort()
    .join(',');

  // Poll progress for processing documents
  useEffect(() => {
    if (!processingDocIds) {
      return;
    }

    const ids = processingDocIds.split(',').map(Number);

    const fetchProgress = async () => {
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
    };

    // Fetch immediately
    void fetchProgress();

    // Then poll every 3 seconds
    const interval = setInterval(() => {
      void fetchProgress();
      void loadDocumentation(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [processingDocIds, loadDocumentation]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
      // Reset the input so same files can be selected again
      event.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
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
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      setUploading(true);

      // Initialize progress tracking
      const progress: Record<
        string,
        { status: 'pending' | 'uploading' | 'success' | 'error'; progress: number; error?: string }
      > = {};
      selectedFiles.forEach((file) => {
        progress[file.name] = { status: 'pending', progress: 0 };
      });
      setUploadProgress(progress);

      // Upload all files in parallel
      const uploadPromises = selectedFiles.map(async (file) => {
        try {
          // Update status to uploading
          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: { status: 'uploading', progress: 0 },
          }));

          // Auto-generate title from filename
          const title = file.name.replace(/\.[^/.]+$/, '');

          await documentationService.uploadDocumentation(
            file,
            title,
            '', // Empty description for batch uploads
            visibility,
            documentType,
            (progressEvent) => {
              setUploadProgress((prev) => ({
                ...prev,
                [file.name]: { status: 'uploading', progress: progressEvent.progress ?? 0 },
              }));
            }
          );

          // Update status to success
          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: { status: 'success', progress: 100 },
          }));
        } catch (error) {
          // Detect OCR-related errors and provide helpful guidance
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          const isOCRError =
            errorMessage.toLowerCase().includes('only images') ||
            errorMessage.toLowerCase().includes('scanned') ||
            errorMessage.toLowerCase().includes('no extractable text');

          const userFriendlyError = isOCRError
            ? '📄 Scanned PDF detected! Use Knowledge Base sources (they have OCR) or convert to text-searchable PDF first.'
            : errorMessage;

          // Update status to error
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

      // Wait for all uploads
      await Promise.allSettled(uploadPromises);

      // Reset form after 2 seconds to show results
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadProgress({});
        setVisibility('department');
        setDocumentType('general');
      }, 2000);

      // Reload documentation list
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
    if (!deleteDialog.docId) {
      return;
    }

    try {
      await documentationService.deleteDocumentation(deleteDialog.docId);
      await loadDocumentation();
      setDeleteDialog({ open: false, docId: null });
    } catch (error) {
      logger.error('Failed to delete documentation:', error);
      // Keep dialog open to show error
    }
  };

  const handleToggleEnabled = async (doc: Documentation) => {
    try {
      const updatedDoc = await documentationService.toggleEnabled(doc.id, !doc.enabled);
      // Update the doc in the list
      setDocs((prev: Documentation[]) =>
        prev.map((d: Documentation) => (d.id === doc.id ? updatedDoc : d))
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

      {/* Upload Form */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Upload New Documentation</h3>

        <div className="flex-col space-y-4 text-center sm:items-center sm:flex-row sm:text-left">
          <div>
            <div className="block mb-2 text-sm font-medium">File (PDF, TXT, or Markdown)</div>
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  document.getElementById('doc-file')?.click();
                }
              }}
              className={`relative rounded-lg border-2 border-dashed transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-border bg-muted/30 hover:border-border-hover'
              }`}
            >
              <div className="flex flex-col gap-3 items-center p-8 text-center">
                <div className={`p-3 rounded-full ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Upload
                    className={`w-6 h-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                </div>

                <div>
                  <input
                    id="doc-file"
                    type="file"
                    accept=".pdf,.txt,.md,.docx,.doc,.xlsx,.xls,.csv"
                    multiple={true}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="doc-file"
                    className="inline-flex gap-2 items-center px-4 py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Upload className="w-4 h-4" />
                    {selectedFiles.length > 0 ? 'Add more files' : 'Choose file'}
                  </label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Hold <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Cmd</kbd> (Mac) or{' '}
                    <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl</kbd> (Windows) to
                    select multiple files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or drag & drop multiple files • PDF, TXT, Markdown
                  </p>
                </div>

                {/* AI Helper - PDF Requirements */}
                <div className="p-4 mt-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                  <div className="flex gap-2 items-start">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                        📄 PDF Requirements
                      </p>
                      <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                        <li>
                          • <strong>Text-searchable PDFs:</strong> ✅ Automatic table detection &
                          conversion
                        </li>
                        <li>
                          • <strong>Scanned/Image PDFs:</strong> ✅ Automatic OCR (all pages,
                          ~20-30s per page)
                        </li>
                        <li>
                          • <strong>PDFs with tables:</strong> ✅ Auto-converted to Markdown tables
                        </li>
                        <li>
                          • <strong>TXT/Markdown:</strong> ✅ Perfect support, including tables
                        </li>
                      </ul>
                      <p className="mt-2 text-xs italic text-blue-700 dark:text-blue-300">
                        💡 Scanned PDFs: All pages auto-processed. Large docs may take 3-5 minutes!
                      </p>
                    </div>
                  </div>
                </div>

                {selectedFiles.length > 0 ? (
                  <div className="space-y-2 w-full">
                    <p className="text-sm font-medium">{selectedFiles.length} file(s) selected:</p>
                    {selectedFiles.map((file, index) => {
                      const progress = uploadProgress[file.name];
                      return (
                        <div
                          // eslint-disable-next-line react/no-array-index-key
                          key={`${file.name}-${index}`}
                          className="px-3 py-2 rounded-md border bg-background"
                        >
                          <div className="flex gap-2 justify-between items-center mb-2">
                            <div className="flex flex-1 gap-2 items-center min-w-0">
                              <FileText className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-sm font-medium truncate">{file.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                ({formatFileSize(file.size)})
                              </span>
                            </div>
                            <div className="flex gap-2 items-center shrink-0">
                              {progress?.status === 'uploading' && (
                                <Clock className="w-4 h-4 text-blue-500 animate-spin" />
                              )}
                              {progress?.status === 'success' && (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )}
                              {progress?.status === 'error' && (
                                <span title={progress.error}>
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                </span>
                              )}
                              {!uploading && (
                                <button
                                  onClick={() => handleRemoveFile(index)}
                                  className="p-1 rounded transition-colors hover:bg-destructive/10"
                                  type="button"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              )}
                            </div>
                          </div>
                          {progress?.status === 'uploading' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Uploading...</span>
                                <span className="font-medium text-primary">
                                  {progress.progress}%
                                </span>
                              </div>
                              <div className="overflow-hidden h-1.5 rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all duration-300 bg-primary"
                                  style={{ width: `${progress.progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {progress?.status === 'error' && progress.error && (
                            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                              {progress.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Supported formats: PDF, DOCX, XLSX, XLS, CSV, TXT, Markdown
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="block mb-2 text-sm font-medium">Visibility</div>
            <div className="flex gap-3">
              <label className="flex gap-2 items-center cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="department"
                  checked={visibility === 'department'}
                  onChange={(e) => setVisibility(e.target.value as 'department')}
                  className="w-4 h-4"
                />
                <Lock className="w-4 h-4" />
                <span className="text-sm">Department only</span>
              </label>
              <label className="flex gap-2 items-center cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="organization"
                  checked={visibility === 'organization'}
                  onChange={(e) => setVisibility(e.target.value as 'organization')}
                  className="w-4 h-4"
                />
                <Globe className="w-4 h-4" />
                <span className="text-sm">Shared with all departments</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibility === 'department'
                ? 'Only your department can see and use this documentation'
                : 'All departments can see and use this documentation'}
            </p>
          </div>

          <div>
            <ReactSelect
              label="Document Type"
              value={documentType}
              onChange={(value) => setDocumentType(value as DocumentType)}
              options={[
                { value: 'general', label: '📄 General - Uncategorized documentation' },
                { value: 'technical', label: '📘 Technical - Support guides, how-tos' },
                { value: 'nda', label: '📝 NDA - Confidential agreements (no quoting)' },
                { value: 'legal', label: '⚖️ Legal - Terms, policies (careful references)' },
                { value: 'policy', label: '📋 Policy - Company procedures' },
                { value: 'template', label: '📧 Template - Email/response templates' },
              ]}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {documentType === 'nda' &&
                '⚠️ AI will reference this document without revealing specific terms'}
              {documentType === 'legal' &&
                '⚠️ AI will reference carefully without providing legal advice'}
              {documentType === 'technical' && 'AI can quote directly from this documentation'}
              {documentType === 'policy' && 'AI can quote company policies and procedures'}
              {documentType === 'template' && 'Used for response formatting and templates'}
              {documentType === 'general' && 'Standard documentation with quotable content'}
            </p>
          </div>

          <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || uploading}>
            <Upload className="mr-2 w-4 h-4" />
            {uploading
              ? `Uploading ${selectedFiles.length} file(s)...`
              : `Upload ${selectedFiles.length > 0 ? selectedFiles.length : ''} ${selectedFiles.length === 1 ? 'File' : 'Files'}`}
          </Button>
        </div>
      </Card>

      {/* Documentation List */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Uploaded Documentation</h3>
          {docs.length > 0 && (
            <div className="flex gap-2 items-center">
              {selectedDocs.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {selectedDocs.size} selected
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                    <Trash2 className="mr-2 w-4 h-4" />
                    Delete Selected
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleToggleAll}>
                {selectedDocs.size === docs.length ? (
                  <>
                    <CheckSquare className="mr-2 w-4 h-4" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="mr-2 w-4 h-4" />
                    Select All
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {docs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <BookOpen className="mx-auto mb-4 w-12 h-12 opacity-50" />
            <p>No documentation uploaded yet.</p>
            <p className="text-sm">Upload your first document to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className={`flex justify-between items-start p-4 rounded-lg border transition-colors dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  selectedDocs.has(doc.id)
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                    : ''
                }`}
              >
                <div className="flex gap-3 items-start flex-1 min-w-0">
                  <button
                    onClick={() => handleToggleDoc(doc.id)}
                    className="flex-shrink-0 mt-1 text-gray-400 transition-colors hover:text-primary focus:outline-none"
                    aria-label={selectedDocs.has(doc.id) ? 'Deselect document' : 'Select document'}
                  >
                    {selectedDocs.has(doc.id) ? (
                      <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2 items-center mb-1">
                      <FileText className="flex-shrink-0 w-5 h-5 text-blue-500" />
                      <h4 className="font-semibold truncate">{doc.title}</h4>
                      {getDocumentTypeBadge(doc.documentType)}
                      <DepartmentBadge department={doc.departmentRole} size="sm" />
                      {doc.visibility === 'organization' ? (
                        <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-200">
                          <Globe className="w-3 h-3" />
                          Shared
                        </span>
                      ) : (
                        <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full dark:bg-gray-800 dark:text-gray-300">
                          <Lock className="w-3 h-3" />
                          Private
                        </span>
                      )}
                      {getStatusBadge(doc.status)}
                    </div>

                    {doc.description && (
                      <p className="mb-2 text-sm text-muted-foreground">{doc.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>{doc.originalFilename}</span>
                      <span>{formatFileSize(doc.size)}</span>
                      {doc.chunkCount > 0 && <span>{doc.chunkCount} chunks</span>}
                      {doc.timesReferenced > 0 && (
                        <span className="inline-flex gap-1 items-center font-medium text-purple-600 dark:text-purple-400">
                          <BarChart3 className="w-3 h-3" />
                          Used {doc.timesReferenced} {doc.timesReferenced === 1 ? 'time' : 'times'}
                        </span>
                      )}
                      <span>Uploaded {formatDate(doc.createdAt)}</span>
                      {doc.lastReferencedAt && (
                        <span>Last used {formatDate(doc.lastReferencedAt)}</span>
                      )}
                    </div>

                    {doc.status === 'processing' && docProgress[doc.id] && (
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {docProgress[doc.id].message ?? 'Processing...'}
                          </span>
                          <span className="font-medium text-primary">
                            {docProgress[doc.id].percentage}%
                          </span>
                        </div>
                        <div className="overflow-hidden h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-300 bg-primary"
                            style={{ width: `${docProgress[doc.id].percentage}%` }}
                          />
                        </div>
                        {docProgress[doc.id].current !== undefined && docProgress[doc.id].total && (
                          <p className="text-xs text-muted-foreground">
                            {docProgress[doc.id].current} / {docProgress[doc.id].total} chunks
                          </p>
                        )}
                      </div>
                    )}

                    {doc.processingError && (
                      <div className="p-2 mt-2 text-sm text-red-800 bg-red-50 rounded border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                        Error: {doc.processingError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0 ml-4">
                  {doc.status === 'ready' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewContent(doc)}
                      title="View content"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleEnabled(doc)}
                    title={
                      doc.enabled ? 'Disable in suggested answers' : 'Enable in suggested answers'
                    }
                    className={doc.enabled ? 'text-green-600' : 'text-gray-400'}
                  >
                    <Power className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Extract filename from URL path (e.g., /uploads/documentation/file.pdf -> file.pdf)
                      const filename = doc.url.split('/').pop();
                      window.open(`/api/documentation/download/${filename}`, '_blank');
                    }}
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(doc.id)}
                    title="Delete documentation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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

      {/* Documentation Viewer Modal */}
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
