import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { KbExportSize } from '@/features/kb/services/kb.service';
import { downloadKbExport, getKbExportSize, type KbListFilters } from '@/features/kb/services/kbEngine.service';

type KbExportButtonProps = {
  /** The list's own filters (status included, 'all' too): the file holds exactly the list's rows. */
  filters: KbListFilters;
  /**
   * The list's total for these filters, `undefined` while the list is loading. A change under the
   * same filters means rows came or went (the last deleted entry restored, an entry approved out
   * of Pending), so the count is read again. The first total after a filter change only arrives
   * with the list the filter change already counted, and paging keeps the total: neither reads.
   */
  listTotal?: number;
};

/** loading ⇒ `undefined`; a backend without the export ⇒ `unsupported`; a count that failed ⇒ `unknown`. */
type ExportSize = KbExportSize | 'unsupported' | 'unknown' | undefined;

export const KbExportButton = ({ filters, listTotal }: KbExportButtonProps) => {
  // A new object on every render: the effect depends on what the filters say, not on identity.
  const filtersKey = JSON.stringify(filters);
  const [size, setSize] = useState<ExportSize>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countError, setCountError] = useState<string | null>(null);

  // Only the newest read may set the count: an older answer arriving late is dropped.
  const readSeq = useRef(0);
  const read = useCallback(() => {
    const seq = ++readSeq.current;
    setCountError(null);
    getKbExportSize(filters)
      .then((result) => seq === readSeq.current && setSize(result ?? 'unsupported'))
      .catch((err: unknown) => {
        if (seq !== readSeq.current) return;
        setSize('unknown');
        setCountError(getApiErrorMessage(err) ?? null);
      });
    // `filters` is read through `filtersKey`: a new object on every render says the same thing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // The total last seen for the CURRENT filters; undefined until the list answers for them.
  const seenTotal = useRef<number | undefined>(undefined);

  useEffect(() => {
    seenTotal.current = undefined;
    read();
    return () => {
      readSeq.current += 1; // unmount or filter change: no late answer lands
    };
  }, [read]);

  useEffect(() => {
    if (listTotal === undefined) return; // the list is loading
    if (seenTotal.current === undefined) {
      seenTotal.current = listTotal; // the list the filter change already counted
      return;
    }
    if (listTotal === seenTotal.current) return; // paging, or a read with nothing changed
    seenTotal.current = listTotal;
    read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listTotal]);

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
      {countError && (
        <p className="text-xs text-muted-foreground">Could not count the entries: {countError}</p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );
};
