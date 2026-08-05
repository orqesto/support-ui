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
import { useState } from 'react';
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
}: DocumentationListProps) => {
  // Source filter: gives a Confluence-ONLY list (separate from uploaded docs) where each
  // synced page can be toggled on/off for AI answers.
  const [sourceFilter, setSourceFilter] = useState<'all' | 'uploaded' | 'confluence'>('all');
  const isConfluenceDoc = (doc: Documentation) =>
    doc.externalSource?.split(':')[0] === 'confluence';
  const hasConfluence = docs.some(isConfluenceDoc);
  const confluenceCount = docs.filter(isConfluenceDoc).length;
  const filteredDocs = docs.filter((doc) => {
    if (sourceFilter === 'confluence') return isConfluenceDoc(doc);
    if (sourceFilter === 'uploaded') return !isConfluenceDoc(doc);
    return true;
  });

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          {sourceFilter === 'confluence' ? 'Confluence Pages' : 'Documentation'}
        </h3>
        {sourceFilter === 'all' && docs.length > 0 && (
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

      {hasConfluence && (
        <div className="flex flex-wrap gap-1 mb-4">
          {(['all', 'uploaded', 'confluence'] as const).map((src) => {
            const count =
              src === 'all'
                ? docs.length
                : src === 'confluence'
                  ? confluenceCount
                  : docs.length - confluenceCount;
            const label = src === 'all' ? 'All' : src === 'uploaded' ? 'Uploaded' : 'Confluence';
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  sourceFilter === src
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filteredDocs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-4 w-12 h-12 opacity-50" />
          {sourceFilter === 'confluence' ? (
            <>
              <p>No Confluence pages synced yet.</p>
              <p className="text-sm">
                Connect a Confluence space in Settings → Integrations, then Sync.
              </p>
            </>
          ) : (
            <>
              <p>No documentation uploaded yet.</p>
              <p className="text-sm">Upload your first document to get started.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc) => (
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
                {/* Bulk-select checkbox only in the unfiltered view (bulk actions hide otherwise). */}
                {sourceFilter === 'all' && (
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
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 items-center mb-1">
                    <FileText className="flex-shrink-0 w-5 h-5 text-blue-500" />
                    <h4 className="font-semibold truncate">{doc.title}</h4>
                    {getDocumentTypeBadge(doc.documentType)}
                    {doc.externalSource?.split(':')[0] === 'confluence' && (
                      <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-sky-800 bg-sky-100 rounded-full dark:bg-sky-900 dark:text-sky-200">
                        <BookOpen className="w-3 h-3" />
                        Confluence
                      </span>
                    )}
                    {doc.departmentIds.length === 0 ? (
                      <span className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-200">
                        <Globe className="w-3 h-3" />
                        All departments
                      </span>
                    ) : (
                      doc.departmentIds.map((deptId) => (
                        <DepartmentBadge key={deptId} departmentId={deptId} size="sm" />
                      ))
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
                {doc.externalSource?.split(':')[0] !== 'confluence' && (
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
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteClick(doc.id)}
                  title={
                    doc.externalSource?.split(':')[0] === 'confluence'
                      ? 'Synced from Confluence — it reappears on the next sync unless you remove its space from the Confluence source. Use the Power toggle to exclude it from AI answers.'
                      : 'Delete documentation'
                  }
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
};
