import {
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
import { formatDate } from '@/lib/utils';
import type {
  Documentation,
  DocumentType,
  DocumentationProgress,
} from '@/services/documentation.service';

type DocumentationListProps = {
  docs: Documentation[];
  selectedDocs: Set<number>;
  docProgress: Record<number, DocumentationProgress>;
  highlightDocId?: number;
  onToggleDoc: (id: number) => void;
  onToggleAll: () => void;
  onBulkDelete: () => void;
  onViewContent: (doc: Documentation) => void;
  onToggleEnabled: (doc: Documentation) => void;
  onDeleteClick: (id: number) => void;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
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

export const DocumentationList = ({
  docs,
  selectedDocs,
  docProgress,
  highlightDocId,
  onToggleDoc,
  onToggleAll,
  onBulkDelete,
  onViewContent,
  onToggleEnabled,
  onDeleteClick,
}: DocumentationListProps) => (
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
                <Button variant="destructive" size="sm" onClick={onBulkDelete}>
                  <Trash2 className="mr-2 w-4 h-4" />
                  Delete Selected
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onToggleAll}>
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
              id={`doc-${doc.id}`}
              className={`flex justify-between items-start p-4 rounded-lg border transition-colors dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                highlightDocId === doc.id
                  ? 'ring-2 ring-primary bg-primary/5 border-primary/40'
                  : selectedDocs.has(doc.id)
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                  : ''
              }`}
            >
              <div className="flex gap-3 items-start flex-1 min-w-0">
                <button
                  onClick={() => onToggleDoc(doc.id)}
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
                    <DepartmentBadge departmentId={doc.departmentId} size="sm" />
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
                        Used {doc.timesReferenced}{' '}
                        {doc.timesReferenced === 1 ? 'time' : 'times'}
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
                      {docProgress[doc.id].current !== undefined &&
                        docProgress[doc.id].total && (
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
                    onClick={() => onViewContent(doc)}
                    title="View content"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleEnabled(doc)}
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
                    const filename = encodeURIComponent(doc.url.split('/').pop() ?? '');
                    window.open(`/api/documentation/download/${filename}`, '_blank', 'noopener,noreferrer');
                  }}
                  title="Download file"
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteClick(doc.id)}
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
  );
