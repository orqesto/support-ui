import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { KbExportSize } from '@/services/kb.service';
import { downloadKbExport, getKbExportSize, type KbListFilters } from '@/services/kbEngine.service';

type KbExportButtonProps = {
  /** The list's own filters (status included, 'all' too): the file holds exactly the list's rows. */
  filters: KbListFilters;
  /** Changes whenever the list was read again, so the count is read again. */
  refreshKey: unknown;
};

/** loading ⇒ `undefined`; a backend without the export ⇒ `unsupported`; a count that failed ⇒ `unknown`. */
type ExportSize = KbExportSize | 'unsupported' | 'unknown' | undefined;

export const KbExportButton = ({ filters, refreshKey }: KbExportButtonProps) => {
  // A new object on every render: the effect depends on what the filters say, not on identity.
  const filtersKey = JSON.stringify(filters);
  const [size, setSize] = useState<ExportSize>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getKbExportSize(filters)
      .then((result) => current && setSize(result ?? 'unsupported'))
      .catch(() => current && setSize('unknown'));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, refreshKey]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadKbExport(filters);
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
        {counted ? `Export to CSV (${size.count})` : 'Export to CSV'}
      </Button>
      {counted && size.truncated && (
        <Alert variant="warning">
          Only the first {size.cap} of {size.count} entries are exported. Narrow the filters to get
          the rest.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );
};
