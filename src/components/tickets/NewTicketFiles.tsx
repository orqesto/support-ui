import { File, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** POST /api/tickets/:id/attachments takes at most 5 files of 10 MB (BE `uploadMiddleware`). */
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The files a new ticket can take: the upload route refuses the whole batch past its limits, so
 * the extra and oversized ones are left out here, and `notice` says which (null when none were).
 */
export const pickUploadableFiles = (picked: File[]): { kept: File[]; notice: string | null } => {
  const fitting = picked.filter((file) => file.size <= MAX_FILE_BYTES);
  const oversized = picked.filter((file) => file.size > MAX_FILE_BYTES);
  const notes = [
    ...(oversized.length === 1
      ? [`${oversized[0].name} is over 10 MB and was left out`]
      : oversized.length > 1
        ? [`${oversized.length} files over 10 MB were left out`]
        : []),
    ...(fitting.length > MAX_FILES ? [`only the first ${MAX_FILES} files are kept`] : []),
  ];
  return {
    kept: fitting.slice(0, MAX_FILES),
    notice:
      notes.length > 0 ? `At most ${MAX_FILES} files of 10 MB each: ${notes.join('; ')}.` : null,
  };
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/** The files chosen for a new ticket, each removable before Create. */
export const NewTicketFiles = ({
  files,
  onRemove,
  disabled,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled: boolean;
}) =>
  files.length === 0 ? null : (
    <div className="space-y-2">
      <p className="block text-sm font-medium">Attachments</p>
      <div className="space-y-1">
        {files.map((file, index) => (
          <div
            key={file.name}
            className="flex gap-2 items-center p-2 rounded border bg-muted border-border"
          >
            <File className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 text-sm truncate">{file.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </span>
            <Button
              aria-label="Remove file"
              title="Remove file"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              className="p-1 h-auto text-destructive hover:bg-destructive/10"
              disabled={disabled}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
