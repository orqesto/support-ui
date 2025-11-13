import { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Clock, BookOpen, BarChart3, Globe, Lock, FileCode, Scale, ScrollText, Mail } from 'lucide-react';
import DepartmentBadge from '@/components/DepartmentBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';
import { documentationService, type Documentation, type DocumentType } from '@/services/documentation.service';

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
    <span className={`inline-flex gap-1 items-center px-2 py-1 text-xs font-medium rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}>
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'department' | 'organization'>('department');
  const [documentType, setDocumentType] = useState<DocumentType>('general');
  const [isDragging, setIsDragging] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; docId: number | null }>({
    open: false,
    docId: null,
  });

  const loadDocumentation = async (isInitialLoad = false) => {
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
      console.error('Failed to load documentation:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadDocumentation(true);
  }, []);

  // Separate effect for polling that only runs when there are processing documents
  useEffect(() => {
    const hasProcessing = docs.some((doc) => doc.status === 'processing');

    if (!hasProcessing) {
      return;
    }

    const interval = setInterval(() => {
      void loadDocumentation(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [docs]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-fill title from filename
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
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

    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Check file type
      const validTypes = ['.pdf', '.txt', '.md'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (validTypes.includes(fileExt)) {
        setSelectedFile(file);
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      return;
    }

    try {
      setUploading(true);
      await documentationService.uploadDocumentation(selectedFile, title, description, visibility, documentType);

      // Reset form
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      setVisibility('department');
      setDocumentType('general');

      // Reload documentation list
      await loadDocumentation();
    } catch (error) {
      console.error('Failed to upload documentation:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeleteDialog({ open: true, docId: id });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.docId) {
      console.warn('Delete confirm called but no docId');
      return;
    }

    console.log('Deleting documentation:', deleteDialog.docId);
    try {
      await documentationService.deleteDocumentation(deleteDialog.docId);
      console.log('Documentation deleted successfully');
      await loadDocumentation();
      setDeleteDialog({ open: false, docId: null });
    } catch (error) {
      console.error('Failed to delete documentation:', error);
      // Keep dialog open to show error
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
              <div className="flex gap-3 items-center">
                <BookOpen className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalDocs}</p>
                  <p className="text-sm text-muted-foreground">Documents</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex gap-3 items-center">
                <FileText className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalChunks}</p>
                  <p className="text-sm text-muted-foreground">Chunks</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex gap-3 items-center">
                <CheckCircle className="w-8 h-8 text-purple-500" />
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

        <div className="space-y-4">
          <div>
            <div className="block mb-2 text-sm font-medium">
              File (PDF, TXT, or Markdown)
            </div>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-lg border-2 border-dashed transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-border bg-muted/30 hover:border-border-hover'
              }`}
            >
              <div className="flex flex-col gap-3 items-center p-8 text-center">
                <div className={`p-3 rounded-full ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Upload className={`w-6 h-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                
                <div>
                  <input
                    id="doc-file"
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="doc-file"
                    className="inline-flex gap-2 items-center px-4 py-2 text-sm font-semibold rounded-md cursor-pointer transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Choose file
                  </label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    or drag and drop your file here
                  </p>
                </div>

                {selectedFile ? (
                  <div className="flex gap-2 items-center px-3 py-2 rounded-md bg-background border">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({formatFileSize(selectedFile.size)})
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Supported formats: PDF, TXT, Markdown
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="doc-title" className="block mb-2 text-sm font-medium">
              Title *
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title"
              className="px-3 py-2 w-full rounded-md border dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          <div>
            <label htmlFor="doc-description" className="block mb-2 text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the document content"
              rows={3}
              className="px-3 py-2 w-full rounded-md border dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          <div>
            <div className="block mb-2 text-sm font-medium">Visibility</div>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
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
              <label className="flex items-center gap-2 cursor-pointer">
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
            <label htmlFor="doc-type" className="block mb-2 text-sm font-medium">
              Document Type
            </label>
            <select
              id="doc-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="px-3 py-2 w-full rounded-md border dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="general">📄 General - Uncategorized documentation</option>
              <option value="technical">📘 Technical - Support guides, how-tos</option>
              <option value="nda">📝 NDA - Confidential agreements (no quoting)</option>
              <option value="legal">⚖️ Legal - Terms, policies (careful references)</option>
              <option value="policy">📋 Policy - Company procedures</option>
              <option value="template">📧 Template - Email/response templates</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {documentType === 'nda' && '⚠️ AI will reference this document without revealing specific terms'}
              {documentType === 'legal' && '⚠️ AI will reference carefully without providing legal advice'}
              {documentType === 'technical' && 'AI can quote directly from this documentation'}
              {documentType === 'policy' && 'AI can quote company policies and procedures'}
              {documentType === 'template' && 'Used for response formatting and templates'}
              {documentType === 'general' && 'Standard documentation with quotable content'}
            </p>
          </div>

          <Button onClick={handleUpload} disabled={!selectedFile || !title.trim() || uploading}>
            <Upload className="mr-2 w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Documentation'}
          </Button>
        </div>
      </Card>

      {/* Documentation List */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Uploaded Documentation</h3>

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
                className="flex justify-between items-start p-4 rounded-lg border transition-colors dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
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

                  {doc.processingError && (
                    <div className="p-2 mt-2 text-sm text-red-800 bg-red-50 rounded border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                      Error: {doc.processingError}
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(doc.id)}
                  className="flex-shrink-0 ml-4"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
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
    </div>
  );
};
