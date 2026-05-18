import {
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Lock,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import type { DocumentType } from '@/services/documentation.service';

type FileUploadProgress = {
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
};

type DocumentationUploadFormProps = {
  selectedFiles: File[];
  visibility: 'department' | 'organization';
  documentType: DocumentType;
  isDragging: boolean;
  uploading: boolean;
  uploadProgress: Record<string, FileUploadProgress>;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onVisibilityChange: (value: 'department' | 'organization') => void;
  onDocumentTypeChange: (value: DocumentType) => void;
  onUpload: () => void;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const DocumentationUploadForm = ({
  selectedFiles,
  visibility,
  documentType,
  isDragging,
  uploading,
  uploadProgress,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemoveFile,
  onVisibilityChange,
  onDocumentTypeChange,
  onUpload,
}: DocumentationUploadFormProps) => (
    <Card className="p-6">
      <h3 className="mb-4 text-lg font-semibold">Upload New Documentation</h3>

      <div className="flex-col space-y-4 text-center sm:items-center sm:flex-row sm:text-left">
        <div>
          <div className="block mb-2 text-sm font-medium">File (PDF, TXT, or Markdown)</div>
          <div
            role="button"
            tabIndex={0}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
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
                  onChange={onFileSelect}
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
                                onClick={() => onRemoveFile(index)}
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
                onChange={(e) => onVisibilityChange(e.target.value as 'department')}
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
                onChange={(e) => onVisibilityChange(e.target.value as 'organization')}
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
            onChange={(value) => onDocumentTypeChange(value as DocumentType)}
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

        <Button onClick={onUpload} disabled={selectedFiles.length === 0 || uploading}>
          <Upload className="mr-2 w-4 h-4" />
          {uploading
            ? `Uploading ${selectedFiles.length} file(s)...`
            : `Upload ${selectedFiles.length > 0 ? selectedFiles.length : ''} ${selectedFiles.length === 1 ? 'File' : 'Files'}`}
        </Button>
      </div>
    </Card>
  );
