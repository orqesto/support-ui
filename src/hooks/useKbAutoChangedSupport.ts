import { useEffect, useState } from 'react';
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';

/**
 * Does the backend know "Changed automatically" (`filters.autoChangedStatus`)? null: not asked
 * yet. Asked of an older backend, which ignores the status, it says no once and the list shows
 * today's "Removed automatically" instead.
 */
export const useKbAutoChangedSupport = (
  appliedStatus: { requested: KbFilterStatus; applied: boolean } | null,
  setFilterStatus: (next: KbFilterStatus) => void
): boolean | null => {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (appliedStatus?.requested !== 'auto_changed') return;
    setSupported(appliedStatus.applied);
    if (!appliedStatus.applied) setFilterStatus('auto_removed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedStatus]);
  return supported;
};
