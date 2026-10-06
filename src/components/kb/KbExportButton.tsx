import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { kbService, type KbExportSize, type KbExportType } from '@/services/kb.service';

type KbExportButtonProps = {
  /** The list's type tab; only Q&A and documents are exported separately, anything else is everything. */
  type: string;
  /** Changes whenever the department picker or the list changed, so the count is read again. */
  refreshKey: unknown;
};

/** loading ⇒ `undefined`; a backend without the export ⇒ `unsupported`; a count that failed ⇒ `unknown`. */
type ExportSize = KbExportSize | 'unsupported' | 'unknown' | undefined;

const exportTypeOf = (type: string): KbExportType | undefined =>
  type === 'qa_pair' || type === 'document' ? type : undefined;

export const KbExportButton = ({ type, refreshKey }: KbExportButtonProps) => {
  const exportType = exportTypeOf(type);
  const [size, setSize] = useState<ExportSize>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    kbService
      .getExportSize(exportType)
      .then((result) => current && setSize(result ?? 'unsupported'))
      .catch(() => current && setSize('unknown'));
    return () => {
      current = false;
    };
  }, [exportType, refreshKey]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      await kbService.downloadExport(exportType);
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not download the CSV.');
    } finally {
      setDownloading(false);
    }
  };

  if (size === 'unsupported') return null;
  const counted = typeof size === 'object';
  return (
    <div className="mt-2 space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download()}
        isLoading={downloading}
        disabled={size === undefined || (counted && size.count === 0)}
      >
        {counted ? `Export approved to CSV (${size.count})` : 'Export approved to CSV'}
      </Button>
      {counted && size.truncated && (
        <Alert variant="warning">
          Only the first {size.cap} of {size.count} entries are exported. Narrow the department or
          type to get the rest.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );
};
